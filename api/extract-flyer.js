export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

const PROMPT = `Extract car meet event info from this flyer. Return ONLY a JSON object with these fields (no markdown, no explanation):
{
  "title": "event name",
  "type": "meet|car show|track day|cruise",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "location": "venue/spot name",
  "address": "full street address if visible",
  "city": "City, ST",
  "host": "organizer name",
  "description": "any details about the event",
  "tags": "comma separated tags like JDM, All Makes, etc"
}
If a field is not found, use empty string. For date, convert to YYYY-MM-DD format using the current year ${new Date().getFullYear()} if no year is specified on the flyer. For time use 24hr format.`

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { imageUrl } = req.body || {}
    if (!imageUrl) return res.status(400).json({ error: 'Missing imageUrl' })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'API key not configured' })

    // Fetch the flyer image server-side to avoid CORS issues in the browser.
    const imgRes = await fetch(imageUrl, {
      headers: {
        // Some hosts behave better when a user-agent is provided.
        'User-Agent': 'Mozilla/5.0',
        Accept: 'image/*',
      },
    })

    if (!imgRes.ok) {
      return res.status(500).json({ error: 'Could not fetch image', status: imgRes.status })
    }

    const arrayBuffer = await imgRes.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    const contentTypeRaw = imgRes.headers.get('content-type') || 'image/jpeg'
    const contentType = contentTypeRaw.split(';')[0].trim()
    const mediaType = contentType.startsWith('image/') ? contentType : 'image/jpeg'

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: base64 },
              },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      console.error('Anthropic error:', data)
      return res.status(response.status).json(data)
    }

    const text = data.content?.[0]?.text || ''
    const clean = text.replace(/```json|```/g, '').trim()
    const extracted = JSON.parse(clean)

    res.status(200).json({ extracted })
  } catch (e) {
    console.error('extract-flyer error:', e)
    res.status(500).json({ error: e.message || 'Failed to extract flyer' })
  }
}


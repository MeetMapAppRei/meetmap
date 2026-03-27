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
  "address": "full street address if visible (one line)",
  "address_parts": { "street": "", "city": "", "state": "", "zip": "" },
  "city": "City, ST",
  "host": "organizer name",
  "description": "any details about the event",
  "tags": "comma separated tags like JDM, All Makes, etc"
}
If a field is not found, use empty string. For date, convert to YYYY-MM-DD format using the current year ${new Date().getFullYear()} if no year is specified on the flyer. For time use 24hr format.`

const norm = (value) =>
  String(value ?? '')
    .replace(/\u2013|\u2014/g, '-') // en/em dash
    .replace(/\s+/g, ' ')
    .trim()

const looksLikeUsZip = (s) => /\b\d{5}(?:-\d{4})?\b/.test(String(s || ''))

const buildAddressQueryCandidates = (extracted) => {
  const parts = extracted?.address_parts || {}
  const street = norm(parts.street)
  const city = norm(parts.city)
  const state = norm(parts.state).toUpperCase()
  const zip = norm(parts.zip)
  const oneLine = norm(extracted?.address)
  const citySt = norm(extracted?.city)
  const venue = norm(extracted?.location)

  const candidates = []
  const push = (v) => {
    const x = norm(v)
    if (!x) return
    if (!candidates.includes(x)) candidates.push(x)
  }

  // Most specific: structured
  const structured = [street, city, state, zip].filter(Boolean).join(', ')
  push(structured)

  // If we have city/state context, prefer appending it to ambiguous street lines.
  if (oneLine && citySt) push(`${oneLine}, ${citySt}`)

  // If OCR gave a one-line address, try it as-is
  push(oneLine)

  // Try pairing venue + city (works when street line is missing / messy)
  if (venue && citySt) push(`${venue}, ${citySt}`)
  if (venue && city && state) push(`${venue}, ${city}, ${state}`)

  // Try street-only + city/state as a fallback when address_parts are missing.
  if (street && citySt) push(`${street}, ${citySt}`)

  return candidates
}

async function nominatimLookup(query) {
  const q = encodeURIComponent(norm(query))
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&addressdetails=1&countrycodes=us`
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      // Nominatim usage policy: identify the app.
      'User-Agent': 'MeetMap/1.0 (+https://www.findcarmeets.com)',
    },
  })
  if (!res.ok) return null
  const data = await res.json()
  if (!Array.isArray(data) || data.length === 0) return null
  return data[0] || null
}

function formatUsAddressFromNominatim(hit) {
  const a = hit?.address || {}
  const house = norm(a.house_number)
  const road = norm(a.road) || norm(a.pedestrian) || norm(a.footway) || norm(a.path)
  const city =
    norm(a.city) ||
    norm(a.town) ||
    norm(a.village) ||
    norm(a.hamlet) ||
    norm(a.suburb) ||
    norm(a.neighbourhood)
  const state = norm(a.state) || norm(a.state_code)
  const postcode = norm(a.postcode)
  const country = norm(a.country)

  const line1 = [house, road].filter(Boolean).join(' ')
  const line2 = [city, state].filter(Boolean).join(', ')
  const tail = [postcode, country].filter(Boolean).join(', ')

  const parts = [line1, line2, tail].filter(Boolean)
  return norm(parts.join(', '))
}

async function verifyAndNormalizeAddress(extracted) {
  const candidates = buildAddressQueryCandidates(extracted)
  for (const q of candidates) {
    try {
      const hit = await nominatimLookup(q)
      if (!hit) continue
      const display = norm(hit.display_name)
      const formatted = formatUsAddressFromNominatim(hit)
      const precision = (() => {
        const a = hit?.address || {}
        const hasHouse = !!norm(a.house_number)
        const hasRoad = !!(norm(a.road) || norm(a.pedestrian) || norm(a.footway) || norm(a.path))
        if (hasHouse && hasRoad) return 'address'
        if (hasRoad) return 'street'
        return 'place'
      })()
      if (!display && !formatted) continue
      return {
        // Only auto-fill the address field when we have house-number precision.
        verified_address: precision === 'address' ? formatted || display : '',
        verified_display_name: display || formatted || '',
        verified_precision: precision,
        verified_lat: hit.lat ? parseFloat(hit.lat) : null,
        verified_lng: hit.lon ? parseFloat(hit.lon) : null,
      }
    } catch {
      // Try next candidate
    }
  }
  return {
    verified_address: '',
    verified_display_name: '',
    verified_precision: '',
    verified_lat: null,
    verified_lng: null,
  }
}

function guessMediaTypeFromUrl(url) {
  const u = String(url || '').toLowerCase()
  if (u.includes('.png')) return 'image/png'
  if (u.includes('.webp')) return 'image/webp'
  if (u.includes('.gif')) return 'image/gif'
  // Default to jpeg since most IG CDN flyers are jpg.
  return 'image/jpeg'
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { imageUrl, sourceUrl, imageBase64, mediaType: mediaTypeInput } = req.body || {}
    if (!imageUrl && !imageBase64)
      return res.status(400).json({ error: 'Missing imageUrl or imageBase64' })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'API key not configured' })

    // If the client already uploaded the image bytes, use that directly.
    if (imageBase64) {
      const mt =
        typeof mediaTypeInput === 'string' && mediaTypeInput.startsWith('image/')
          ? mediaTypeInput
          : guessMediaTypeFromUrl(imageUrl)

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
                  source: {
                    type: 'base64',
                    media_type: mt || 'image/jpeg',
                    data: String(imageBase64),
                  },
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
        const err =
          data?.error?.message ||
          data?.message ||
          (typeof data?.error === 'string' ? data.error : null) ||
          JSON.stringify(data)
        return res.status(response.status).json({ error: err, status: response.status })
      }

      const text = data.content?.[0]?.text || ''
      const clean = text.replace(/```json|```/g, '').trim()
      const extracted = JSON.parse(clean)
      const verified = await verifyAndNormalizeAddress(extracted)
      return res.status(200).json({ extracted: { ...extracted, ...verified } })
    }

    // Fetch the flyer image server-side to avoid CORS issues in the browser.
    // Instagram CDN frequently requires a reasonable UA + Referer/Origin.
    const referer =
      typeof sourceUrl === 'string' && sourceUrl ? sourceUrl : 'https://www.instagram.com/'
    const origin =
      typeof sourceUrl === 'string' && sourceUrl
        ? (() => {
            try {
              return new URL(sourceUrl).origin
            } catch {}
            return 'https://www.instagram.com'
          })()
        : 'https://www.instagram.com'

    const commonHeaders = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: referer,
      Origin: origin,
    }

    const candidates = []
    const pushCandidate = (v) => {
      if (!v || typeof v !== 'string') return
      candidates.push(v)
    }
    try {
      const u = new URL(imageUrl)
      pushCandidate(u.toString())

      // Try removing query string entirely (some CDN assets are accessible without the signed params).
      const noQuery = new URL(u.toString())
      noQuery.search = ''
      pushCandidate(noQuery.toString())

      // Try keeping only signature-ish params that look stable.
      const keepSig = new URL(u.toString())
      for (const [k] of keepSig.searchParams.entries()) {
        if (k !== 'oh' && k !== 'oe') keepSig.searchParams.delete(k)
      }
      pushCandidate(keepSig.toString())

      // Try removing stp if present (square crop forcing param).
      const rmStp = new URL(u.toString())
      rmStp.searchParams.delete('stp')
      pushCandidate(rmStp.toString())

      // Try upscaling s640x640 paths if present.
      const upscale = u.pathname.replace(/\/s\d+x\d+\//i, '/s1080x1080/')
      if (upscale !== u.pathname) {
        const up = new URL(u.toString())
        up.pathname = upscale
        pushCandidate(up.toString())
      }
    } catch {
      pushCandidate(imageUrl)
    }

    // Deduplicate while preserving order.
    const uniqueCandidates = []
    for (const c of candidates) {
      if (!uniqueCandidates.includes(c)) uniqueCandidates.push(c)
    }

    let imgRes = null
    let lastRes = null
    for (const candidateUrl of uniqueCandidates) {
      try {
        let resTry = await fetch(candidateUrl, {
          headers: commonHeaders,
          redirect: 'follow',
          cache: 'no-store',
        })

        // Retry with a simpler Referer if the first attempt was rejected.
        if (!resTry.ok && (resTry.status === 403 || resTry.status === 429)) {
          resTry = await fetch(candidateUrl, {
            headers: { ...commonHeaders, Referer: 'https://www.instagram.com/' },
            redirect: 'follow',
            cache: 'no-store',
          })
        }

        lastRes = resTry
        if (resTry.ok) {
          imgRes = resTry
          break
        }
      } catch (e) {
        lastRes = null
      }
    }

    // Claude expects base64 image data. If Instagram blocks our fetch (403),
    // route through an image proxy to retrieve the bytes.
    let base64 = null
    let mediaType = null

    if (imgRes && imgRes.ok) {
      const arrayBuffer = await imgRes.arrayBuffer()
      base64 = Buffer.from(arrayBuffer).toString('base64')

      const contentTypeRaw = imgRes.headers.get('content-type') || 'image/jpeg'
      const contentType = contentTypeRaw.split(';')[0].trim()
      mediaType = contentType.startsWith('image/') ? contentType : 'image/jpeg'
    } else {
      let proxyRes = null
      for (const candidateUrl of uniqueCandidates.slice(0, 6)) {
        const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(candidateUrl)}`
        try {
          proxyRes = await fetch(proxyUrl, {
            headers: {
              'User-Agent': commonHeaders['User-Agent'],
              Accept: commonHeaders.Accept,
            },
            redirect: 'follow',
            cache: 'no-store',
          })

          if (!proxyRes.ok) continue

          const contentTypeRaw = proxyRes.headers.get('content-type') || ''
          const contentType = contentTypeRaw.split(';')[0].trim()
          if (!contentType.startsWith('image/')) continue

          const arrayBuffer = await proxyRes.arrayBuffer()
          base64 = Buffer.from(arrayBuffer).toString('base64')
          mediaType = contentType
          break
        } catch {
          proxyRes = null
        }
      }

      // We'll still attempt Claude with a URL fallback if base64 retrieval
      // fails (Instagram CDN signatures can be browser-only).
      if (!base64 || !mediaType) {
        base64 = null
        mediaType = null
      }
    }

    // Claude expects base64 image data, but we can fall back to providing
    // the URL directly when our image download fails.
    const imageBlock =
      base64 && mediaType
        ? {
            type: 'image',
            source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: base64 },
          }
        : {
            type: 'image',
            source: { type: 'url', url: imageUrl },
          }

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
            content: [imageBlock, { type: 'text', text: PROMPT }],
          },
        ],
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      console.error('Anthropic error:', data)
      const err =
        data?.error?.message ||
        data?.message ||
        (typeof data?.error === 'string' ? data.error : null) ||
        JSON.stringify(data)
      return res.status(response.status).json({ error: err, status: response.status })
    }

    const text = data.content?.[0]?.text || ''
    const clean = text.replace(/```json|```/g, '').trim()
    const extracted = JSON.parse(clean)
    const verified = await verifyAndNormalizeAddress(extracted)

    res.status(200).json({ extracted: { ...extracted, ...verified } })
  } catch (e) {
    console.error('extract-flyer error:', e)
    res.status(500).json({ error: e.message || 'Failed to extract flyer' })
  }
}

/**
 * Client-side diagnostics sink for production debugging.
 * Keeps payloads small/sanitized and writes to Vercel logs only.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const now = new Date().toISOString()
    const event = String(body.event || '').slice(0, 80)
    const stage = String(body.stage || '').slice(0, 80)
    const message = String(body.message || '').slice(0, 400)
    const code = String(body.code || '').slice(0, 80)
    const details = String(body.details || '').slice(0, 200)
    const platform = String(body.platform || '').slice(0, 40)
    const online = typeof body.online === 'boolean' ? body.online : null
    const url = String(body.url || '').slice(0, 220)
    const appVersion = String(body.appVersion || '').slice(0, 40)
    const hasPhoto = !!body.hasPhoto
    const userAgent = String(body.userAgent || '').slice(0, 240)

    // Structured one-line log for easy filtering in Vercel runtime logs.
    console.error(
      '[client-log]',
      JSON.stringify({
        at: now,
        event,
        stage,
        message,
        code,
        details,
        platform,
        online,
        hasPhoto,
        url,
        appVersion,
        userAgent,
      }),
    )

    return res.status(200).json({ ok: true })
  } catch (e) {
    return res.status(200).json({ ok: false, error: e?.message || 'log failed' })
  }
}

import { readFile } from 'fs/promises'
import { join } from 'path'

/** Serves public/delete-account.html (works even when SPA rewrite blocks static .html). */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).end()
  }
  try {
    const html = await readFile(join(process.cwd(), 'public', 'delete-account.html'), 'utf8')
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    if (req.method === 'HEAD') return res.status(200).end()
    return res.status(200).send(html)
  } catch {
    return res.status(500).send('Account deletion page unavailable')
  }
}

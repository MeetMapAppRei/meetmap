import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '12mb',
    },
  },
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function getSupabaseEnv() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  return { url: url ? String(url).replace(/\/$/, '') : '', anon: anon || '' }
}

async function verifySupabaseJwt(jwt) {
  const { url, anon } = getSupabaseEnv()
  if (!url || !anon || !jwt) return null
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: anon,
    },
  })
  if (!res.ok) return null
  return res.json()
}

function r2Client() {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!accountId || !accessKeyId || !secretAccessKey) return null
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
}

function isAllowedKeyForUser(key, userId) {
  const k = String(key || '')
  if (!k) return false
  if (k.startsWith(`events/`) && k.includes('/')) return true
  if (k.startsWith(`flyer-imports/${userId}/`)) return true
  return false
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const authHeader = req.headers.authorization
  const jwt = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  const user = await verifySupabaseJwt(jwt)
  if (!user?.id) return res.status(401).json({ error: 'Sign in required' })

  const bucket = process.env.R2_BUCKET_NAME
  const client = r2Client()
  if (!client || !bucket)
    return res.status(503).json({ error: 'R2 storage is not configured on the server' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const key = String(body.key || '')
    const contentType = String(body.contentType || 'image/jpeg')
    const base64Data = String(body.base64Data || '')

    if (!key || !base64Data) return res.status(400).json({ error: 'Missing key or base64Data' })
    if (!isAllowedKeyForUser(key, user.id))
      return res.status(403).json({ error: 'Invalid key for user' })

    if (key.startsWith('events/')) {
      const parts = key.split('/')
      const eid = parts[1] || ''
      if (!UUID_RE.test(eid)) return res.status(400).json({ error: 'Invalid event key' })
    } else if (key.startsWith('flyer-imports/')) {
      const uid = key.split('/')[1] || ''
      if (!UUID_RE.test(uid) || uid !== user.id)
        return res.status(403).json({ error: 'Invalid flyer-import key' })
    }

    const bytes = Buffer.from(base64Data, 'base64')
    if (!bytes || bytes.length === 0)
      return res.status(400).json({ error: 'Invalid image payload' })

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType.startsWith('image/') ? contentType : 'image/jpeg',
      }),
    )

    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('storage-upload error:', e)
    return res.status(500).json({ error: e.message || 'Upload failed' })
  }
}

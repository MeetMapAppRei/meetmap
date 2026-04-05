import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const config = {
  api: {
    bodyParser: true,
  },
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EXT_RE = /^(jpe?g|png|webp)$/i

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Correlation-Id')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const correlationId = String(req.headers['x-correlation-id'] || '').slice(0, 80)

  const authHeader = req.headers.authorization
  const jwt = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  const user = await verifySupabaseJwt(jwt)
  if (!user?.id) {
    return res.status(401).json({ error: 'Sign in required' })
  }

  const bucket = process.env.R2_BUCKET_NAME
  const publicBase = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '')
  const client = r2Client()
  if (!client || !bucket || !publicBase) {
    return res.status(503).json({ error: 'R2 storage is not configured on the server' })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const { folder, eventId, fileExt, contentType } = body

    if (folder !== 'events' && folder !== 'flyer-imports') {
      return res.status(400).json({ error: 'Invalid folder' })
    }

    const ext = String(fileExt || 'jpg')
      .toLowerCase()
      .replace(/^\./, '')
    if (!EXT_RE.test(ext)) {
      return res.status(400).json({ error: 'Invalid file extension' })
    }

    const ct =
      typeof contentType === 'string' && contentType.startsWith('image/')
        ? contentType
        : ext === 'png'
          ? 'image/png'
          : ext === 'webp'
            ? 'image/webp'
            : 'image/jpeg'

    let key
    if (folder === 'events') {
      const eid = String(eventId || '')
      if (!UUID_RE.test(eid)) {
        return res.status(400).json({ error: 'Invalid eventId' })
      }
      key = `events/${eid}/${Date.now()}.${ext}`
    } else {
      if (user.id !== String(body.userId || '')) {
        return res.status(403).json({ error: 'userId must match signed-in user' })
      }
      const uid = String(body.userId || '')
      if (!UUID_RE.test(uid)) {
        return res.status(400).json({ error: 'Invalid userId' })
      }
      key = `flyer-imports/${uid}/${Date.now()}.${ext}`
    }

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: ct,
    })

    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 3600 })
    const publicUrl = `${publicBase}/${key}`

    if (correlationId) {
      console.log('[meetmap]', 'storage-presign', 'ok', { correlationId, folder: body.folder })
    }
    return res.status(200).json({ uploadUrl, publicUrl, key })
  } catch (e) {
    console.error('storage-presign error:', e, correlationId ? { correlationId } : '')
    return res.status(500).json({ error: e.message || 'Presign failed' })
  }
}

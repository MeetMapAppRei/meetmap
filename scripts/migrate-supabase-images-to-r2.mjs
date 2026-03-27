/**
 * One-time: copy event/flyer images from Supabase Storage public URLs into R2,
 * then update `events.photo_url` and `flyer_imports.image_url`.
 *
 * Usage:
 *   1. Copy .env.migrate.example -> .env.migrate and fill values (never commit).
 *   2. npm install   (needs @supabase/supabase-js + @aws-sdk/client-s3)
 *   3. DRY_RUN=1 node scripts/migrate-supabase-images-to-r2.mjs   # preview
 *   4. node scripts/migrate-supabase-images-to-r2.mjs               # apply
 */
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env.migrate')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (process.env[k] === undefined) process.env[k] = v
  }
}

const DRY = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'

function required(name) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env ${name} (set in .env.migrate or environment)`)
  return v
}

function isSupabaseEventPhotoUrl(url) {
  if (!url || typeof url !== 'string') return false
  return (
    url.includes('/storage/v1/object/public/event-photos') ||
    (url.toLowerCase().includes('supabase') && url.includes('event-photos'))
  )
}

function r2Client() {
  const accountId = required('R2_ACCOUNT_ID')
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: required('R2_ACCESS_KEY_ID'),
      secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
    },
  })
}

async function copyUrlToR2(client, bucket, publicBase, key, sourceUrl) {
  const res = await fetch(sourceUrl)
  if (!res.ok) throw new Error(`Fetch failed ${res.status} ${sourceUrl.slice(0, 80)}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const ct = res.headers.get('content-type') || 'image/jpeg'
  if (DRY) {
    console.log(`[DRY] Would upload ${key} (${buf.length} bytes)`)
    return `${publicBase.replace(/\/$/, '')}/${key}`
  }
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buf,
      ContentType: ct.startsWith('image/') ? ct : 'image/jpeg',
    }),
  )
  return `${publicBase.replace(/\/$/, '')}/${key}`
}

async function main() {
  const supabaseUrl = required('SUPABASE_URL').replace(/\/$/, '')
  const serviceKey = required('SUPABASE_SERVICE_ROLE_KEY')
  const publicBase = required('R2_PUBLIC_BASE_URL')
  const bucket = required('R2_BUCKET_NAME')
  const client = r2Client()

  const sb = createClient(supabaseUrl, serviceKey)

  console.log(DRY ? '--- DRY RUN (no R2 writes, no DB updates) ---' : '--- LIVE MIGRATION ---')

  const { data: events, error: e1 } = await sb
    .from('events')
    .select('id, photo_url')
    .not('photo_url', 'is', null)
  if (e1) throw e1

  let evCount = 0
  for (const row of events || []) {
    const u = row.photo_url
    if (!isSupabaseEventPhotoUrl(u)) continue
    const ext = u.split('?')[0].split('.').pop()?.toLowerCase() || 'jpg'
    const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg'
    const key = `migrated/events/${row.id}/${Date.now()}.${safeExt}`
    try {
      const newUrl = await copyUrlToR2(client, bucket, publicBase, key, u)
      console.log(`Event ${row.id}: ${u.slice(0, 60)}... -> ${newUrl}`)
      if (!DRY) {
        const { error } = await sb.from('events').update({ photo_url: newUrl }).eq('id', row.id)
        if (error) throw error
      }
      evCount++
    } catch (err) {
      console.error(`Event ${row.id} FAILED:`, err.message)
    }
  }

  const { data: imports, error: e2 } = await sb
    .from('flyer_imports')
    .select('id, image_url')
    .not('image_url', 'is', null)
  if (e2) throw e2

  let imCount = 0
  for (const row of imports || []) {
    const u = row.image_url
    if (!isSupabaseEventPhotoUrl(u)) continue
    const ext = u.split('?')[0].split('.').pop()?.toLowerCase() || 'jpg'
    const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg'
    const key = `migrated/flyer-imports/${row.id}/${Date.now()}.${safeExt}`
    try {
      const newUrl = await copyUrlToR2(client, bucket, publicBase, key, u)
      console.log(`Flyer import ${row.id}: migrated -> ${newUrl}`)
      if (!DRY) {
        const { error } = await sb
          .from('flyer_imports')
          .update({ image_url: newUrl })
          .eq('id', row.id)
        if (error) throw error
      }
      imCount++
    } catch (err) {
      console.error(`Flyer import ${row.id} FAILED:`, err.message)
    }
  }

  console.log(`Done. Events updated: ${evCount}, flyer_imports updated: ${imCount}`)
  if (DRY) console.log('Re-run without DRY_RUN=1 to apply.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

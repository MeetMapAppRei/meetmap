/**
 * One-off: post flyers with hard overrides when OCR/geocode fail.
 * Usage: node scripts/post-flyer-overrides.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (!m) continue
    const key = m[1].trim()
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    val = val.replace(/\r$/, '').trim()
    if (process.env[key] == null || process.env[key] === '') process.env[key] = val
  }
}

loadEnvFile(path.join(process.cwd(), '.env'))
loadEnvFile(path.join(process.cwd(), '.env.local'))

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
const USER_ID = String(process.env.FLYER_AGENT_USER_ID || '')
  .replace(/\\r\\n/g, '')
  .replace(/[\r\n]/g, '')
  .trim()
if (!USER_ID || !/^[0-9a-f-]{36}$/i.test(USER_ID)) {
  console.error('Bad FLYER_AGENT_USER_ID:', JSON.stringify(USER_ID))
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function mediaTypeForFile(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  return 'image/jpeg'
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

async function uploadPhoto(eventId, filePath) {
  const buffer = fs.readFileSync(filePath)
  const mediaType = mediaTypeForFile(filePath)
  const ext = mediaType.includes('png') ? 'png' : 'jpg'
  const key = `events/${eventId}/${Date.now()}.${ext}`
  const r2 = r2Client()
  const bucket = process.env.R2_BUCKET_NAME
  const publicBase = String(process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '')
  if (r2 && bucket && publicBase) {
    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mediaType,
      }),
    )
    return `${publicBase}/${key}`
  }
  const { error } = await sb.storage.from('event-photos').upload(key, buffer, {
    contentType: mediaType,
    upsert: false,
  })
  if (error) throw error
  return sb.storage.from('event-photos').getPublicUrl(key).data.publicUrl
}

async function deleteEvent(id) {
  await sb.from('event_statuses').delete().eq('event_id', id)
  await sb.from('events').delete().eq('id', id)
}

const jobs = [
  {
    file: 'instagram-events/run43-to-post/run43-casselberry-stance-meets-perreo-sep20-flyer.jpg',
    title: 'Stance Meets Perreo',
    type: 'meet',
    date: '2026-09-20',
    time: '7:00 PM',
    city: 'Casselberry, FL',
    location: "Sweet Jenny's / Street Vybz",
    address: '1498 State Hwy 436, Casselberry, FL 32707',
    lat: 28.625253444241,
    lng: -81.315613940692,
    host: 'Street Vybz Entertainment',
    description:
      'Stance Meets Perreo Sep 20, 7 PM-12 AM at 1498 SR-436 N, Casselberry. Food, drinks, vendors, music.',
    tags: ['car_meet', 'casselberry', 'fl'],
  },
  {
    file: 'instagram-events/run43-to-post/run43-sayreville-zero-limits-oct18-flyer.jpg',
    title: 'Zero Limits: The Limiters Curse',
    type: 'car show',
    date: '2026-10-18',
    time: '12:00 PM',
    city: 'Sayreville, NJ',
    location: 'NM Tints LLC',
    address: '501 Hartle St Unit 507, Sayreville, NJ 08872',
    lat: 40.451175982279,
    lng: -74.356139478901,
    host: 'ECR Motorsports',
    description:
      'Halloween car show and 2-step battle Oct 18, 12-4 PM at NM Tints, 501 Hartle St Unit 507.',
    tags: ['car_show', 'sayreville', 'nj', 'halloween'],
  },
  {
    file: 'instagram-events/run43-to-post/run43-bakersfield-friday-night-lights-sep18-flyer.jpg',
    title: 'Friday Night Lights Car Meet',
    type: 'meet',
    date: '2026-09-18',
    time: '9:00 PM',
    city: 'Bakersfield, CA',
    location: 'Floor Decor',
    address: '6915 Colony St, Bakersfield, CA 93307',
    lat: 35.29147162825,
    lng: -119.027144532363,
    host: 'Friday Night Lights',
    description:
      'Friday Night Lights car meet Sep 18, 9-11 PM at Floor Decor, 6915 Colony St, Bakersfield.',
    tags: ['car_meet', 'bakersfield', 'ca'],
  },
  {
    file: 'instagram-events/run43-to-post/run43-braintree-mac-popup-sep18-flyer.jpg',
    title: 'MAC Pop Up Meet',
    type: 'meet',
    date: '2026-09-18',
    time: '7:30 PM',
    city: 'Braintree, MA',
    location: 'Braintree AutoZone',
    address: '120 Ivory St, Braintree, MA 02184',
    lat: 42.204936112543,
    lng: -70.999508042734,
    host: 'Mass Auto Cruises',
    description:
      'MAC pop-up park n chill Sep 18, 7:30-10 PM at AutoZone, 120 Ivory St, Braintree. No revving, burnouts, or music.',
    tags: ['car_meet', 'braintree', 'ma'],
  },
  {
    file: 'instagram-events/run43-to-post/run43-kissimmee-4saken-friday-night-sep18-flyer.jpg',
    title: '4Saken Friday Night Live',
    type: 'meet',
    date: '2026-09-18',
    time: '8:00 PM',
    city: 'Kissimmee, FL',
    location: '4Saken Friday Night Live',
    address: '2540 Simpson Rd, Kissimmee, FL 34744',
    lat: 28.3205188,
    lng: -81.3387292,
    host: '4Saken',
    description:
      '4Saken Friday Night Live park and chill Sep 18, 8-10 PM at 2540 Simpson Rd, Kissimmee. All makes and models.',
    tags: ['car_meet', 'kissimmee', 'fl'],
  },
  {
    file: 'instagram-events/run43-to-post/run43-lakeland-park-and-chill-sep18-flyer.jpg',
    title: 'Park & Chill Lakeland',
    type: 'meet',
    date: '2026-09-18',
    time: '8:30 PM',
    city: 'Lakeland, FL',
    location: '3565 Lakeland Highlands Rd',
    address: '3565 Lakeland Highlands Rd, Lakeland, FL 33813',
    lat: 27.999456486614,
    lng: -81.92420362927,
    host: 'Perfect',
    description:
      'Park & Chill Sep 18 at 8:30 PM, 3565 Lakeland Highlands Rd, Lakeland. Respect the location.',
    tags: ['car_meet', 'lakeland', 'fl'],
  },
  {
    file: 'instagram-events/run43-to-post/run43-orlando-boost-up-guns-down-sep18-flyer.jpg',
    title: "Boost Up Guns Down at Sweet Jenny's",
    type: 'meet',
    date: '2026-09-18',
    time: '9:00 PM',
    city: 'Orlando, FL',
    location: "Sweet Jenny's Pop-Up",
    address: '726 S Goldenrod Rd, Orlando, FL 32822',
    lat: 28.535990672923,
    lng: -81.285851575419,
    host: 'Orlando Meets 407',
    description:
      "Boost Up Guns Down pop-up Sep 18 from 9 PM at Sweet Jenny's, 726 S Goldenrod Rd, Orlando.",
    tags: ['car_meet', 'orlando', 'fl'],
  },
  {
    file: 'instagram-events/run43-to-post/run43-westdundee-circlek-sep18-25-flyer.jpg',
    title: 'Fullydrivn Park N Chill at Circle K',
    type: 'meet',
    date: '2026-09-18',
    time: '6:00 PM',
    city: 'West Dundee, IL',
    location: 'Circle K',
    address: '70 Airport Rd, West Dundee, IL 60118',
    lat: 42.0675785,
    lng: -88.2761838,
    host: 'Fullydrivn Car Meets',
    description:
      'Park n chill Sep 18, 6-9 PM at Circle K, 70 Airport Rd, West Dundee. No excessive revving or burnouts.',
    tags: ['car_meet', 'west_dundee', 'il'],
  },
  {
    file: 'instagram-events/run43-to-post/run43-westdundee-circlek-sep18-25-flyer.jpg',
    title: 'Fullydrivn Park N Chill at Circle K',
    type: 'meet',
    date: '2026-09-25',
    time: '6:00 PM',
    city: 'West Dundee, IL',
    location: 'Circle K',
    address: '70 Airport Rd, West Dundee, IL 60118',
    lat: 42.0675785,
    lng: -88.2761838,
    host: 'Fullydrivn Car Meets',
    description:
      'Park n chill Sep 25, 6-9 PM at Circle K, 70 Airport Rd, West Dundee. No excessive revving or burnouts.',
    tags: ['car_meet', 'west_dundee', 'il'],
  },
  {
    file: 'instagram-events/run43-to-post/run43-nanuet-conceited-parkchill-sep19-flyer.jpg',
    replaceIds: ['527baab9-6381-470a-9c5e-5181222f1a34'],
    title: 'Conceited COTW Park & Chill Car Meet',
    type: 'meet',
    date: '2026-09-19',
    time: '8:00 PM',
    city: 'Nanuet, NY',
    location: 'The Shops at Nanuet',
    address: '6201 Fashion Dr, Nanuet, NY 10954',
    lat: 41.096044310771,
    lng: -74.016280688934,
    host: 'Conceited COTW',
    description:
      'Park & chill Sep 19, 8-10:30 PM at 6201 Fashion Dr, Nanuet. Pre-meet 7:30 PM at QuickCheck, 330 NY-59.',
    tags: ['car_meet', 'nanuet', 'ny'],
  },
  {
    file: 'instagram-events/run43-calendars/jersey-29d8ec915f4a-flyer.jpg',
    title: 'Upper Township Fall Fest Show and Go',
    type: 'car show',
    date: '2026-10-04',
    time: '11:00 AM',
    city: 'Petersburg, NJ',
    location: "Amanda's Field",
    address: '10 Sunset Dr, Petersburg, NJ 08270',
    lat: 39.260322664226,
    lng: -74.741027429977,
    host: 'Upper Township Special Events',
    description:
      "Show and go car show Oct 4 at Amanda's Field, 10 Sunset Dr, Petersburg NJ. Show cars 9 AM; event 11 AM-5 PM.",
    tags: ['car_show', 'petersburg', 'nj'],
  },
  {
    file: 'instagram-events/run43-to-post/run43-roxbury-import-evolution-sep27-flyer.jpg',
    replaceIds: ['4e12491a-9d72-4659-9a15-45eac66fcfda'],
    title: 'Import Evolution',
    type: 'meet',
    date: '2026-09-27',
    time: '6:00 PM',
    city: 'Roxbury Crossing, MA',
    location: 'Roxbury Community College',
    address: '1234 Columbus Ave, Roxbury Crossing, MA 02120',
    lat: 42.329616043792,
    lng: -71.096027025199,
    host: 'Import Evolution',
    description:
      'Import Evolution season-closer meet Sep 27 at Roxbury Community College, 1234 Columbus Ave.',
    tags: ['car_meet', 'roxbury', 'ma', 'import'],
  },
]

let posted = 0
for (const job of jobs) {
  const filePath = path.resolve(job.file)
  console.log(`\n? ${path.basename(filePath)}`)
  if (!fs.existsSync(filePath)) {
    console.log('  missing file')
    continue
  }
  for (const id of job.replaceIds || []) {
    await deleteEvent(id)
    console.log(`  deleted old ${id}`)
  }
  // soft duplicate check
  const { data: existing } = await sb
    .from('events')
    .select('id,title,date,city')
    .eq('date', job.date)
    .limit(300)
  const hit = (existing || []).find(
    (r) =>
      String(r.title).toLowerCase() === job.title.toLowerCase() &&
      String(r.city || '')
        .toLowerCase()
        .includes(String(job.city).split(',')[0].toLowerCase()),
  )
  if (hit) {
    console.log(`  skip duplicate: ${hit.id}`)
    continue
  }
  const eventId = crypto.randomUUID()
  const photoUrl = await uploadPhoto(eventId, filePath)
  const row = {
    id: eventId,
    user_id: USER_ID,
    title: job.title,
    type: job.type,
    date: job.date,
    time: job.time,
    location: job.location,
    city: job.city,
    address: job.address,
    lat: job.lat,
    lng: job.lng,
    description: job.description,
    tags: job.tags,
    host: job.host,
    photo_url: photoUrl,
    featured: false,
  }
  const { data, error } = await sb
    .from('events')
    .insert([row])
    .select('id,title,date,city')
    .single()
  if (error) {
    console.log(`  failed: ${error.message}`)
    continue
  }
  await sb
    .from('event_statuses')
    .upsert([{ event_id: data.id, status: 'active', updated_at: new Date().toISOString() }], {
      onConflict: 'event_id',
    })
  console.log(`  posted: ${data.id}  ${data.title} (${data.date})`)
  posted++
}
console.log(`\nDone overrides: ${posted} posted`)

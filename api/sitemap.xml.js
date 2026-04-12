import { createClient } from '@supabase/supabase-js'

const SITE_ORIGIN = 'https://www.findcarmeets.com'

function xmlEscape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function normalizeCityLabel(cityRaw) {
  const s = String(cityRaw || '').trim()
  if (!s) return ''
  return s.replace(/\s+/g, ' ')
}

function slugFromCityLabel(cityLabel) {
  // Input often looks like "Los Angeles, CA"
  // Output becomes "los-angeles-ca" (works with titleFromCitySlug logic in App.jsx)
  return normalizeCityLabel(cityLabel)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildUrlEntry({ loc, changefreq, priority, lastmod }) {
  const bits = [
    `<loc>${xmlEscape(loc)}</loc>`,
    lastmod ? `<lastmod>${xmlEscape(lastmod)}</lastmod>` : '',
    changefreq ? `<changefreq>${xmlEscape(changefreq)}</changefreq>` : '',
    priority != null ? `<priority>${priority}</priority>` : '',
  ].filter(Boolean)
  return `  <url>\n    ${bits.join('\n    ')}\n  </url>`
}

async function fetchDistinctCitiesFromSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return []

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const today = new Date().toISOString().slice(0, 10)

  // Pull upcoming events and derive a distinct city list.
  // Keep payload small: just city + updated/created timestamps if present.
  const { data, error } = await supabase
    .from('events')
    .select('city, created_at, updated_at, date')
    .gte('date', today)
    .order('date', { ascending: true })
    .limit(5000)

  if (error) {
    console.error('[sitemap] supabase error:', error)
    return []
  }

  const cities = new Map()
  for (const row of data || []) {
    const label = normalizeCityLabel(row?.city)
    if (!label) continue
    const keyLabel = label.toLowerCase()
    const ts = row?.updated_at || row?.created_at || ''
    const prev = cities.get(keyLabel)
    if (!prev || (ts && String(ts) > String(prev.lastmod))) {
      cities.set(keyLabel, { label, lastmod: ts ? String(ts).slice(0, 10) : '' })
    }
  }

  return Array.from(cities.values())
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(0, 1200) // keep sitemap size reasonable
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    return res.end('Method not allowed')
  }

  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  // Cache at the edge; city list changes relatively slowly.
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')

  const now = new Date().toISOString().slice(0, 10)
  const cities = await fetchDistinctCitiesFromSupabase()

  const urls = []
  urls.push(
    buildUrlEntry({
      loc: `${SITE_ORIGIN}/`,
      changefreq: 'daily',
      priority: '1.0',
      lastmod: now,
    }),
  )
  urls.push(
    buildUrlEntry({
      loc: `${SITE_ORIGIN}/find-car-meets-near-me/`,
      changefreq: 'weekly',
      priority: '0.9',
      lastmod: now,
    }),
  )
  urls.push(
    buildUrlEntry({
      loc: `${SITE_ORIGIN}/privacy-policy.html`,
      changefreq: 'monthly',
      priority: '0.3',
      lastmod: now,
    }),
  )

  for (const c of cities) {
    const slug = slugFromCityLabel(c.label)
    if (!slug) continue
    urls.push(
      buildUrlEntry({
        loc: `${SITE_ORIGIN}/car-meets-in-${slug}/`,
        changefreq: 'daily',
        priority: '0.7',
        lastmod: c.lastmod || now,
      }),
    )
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join(
    '\n',
  )}\n</urlset>\n`
  return res.status(200).end(xml)
}

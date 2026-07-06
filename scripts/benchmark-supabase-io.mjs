#!/usr/bin/env node
/**
 * Quick Supabase IO benchmark — compares list + sitemap query shapes.
 * Usage: node scripts/benchmark-supabase-io.mjs
 * Requires: .env.local with SUPABASE_URL + SUPABASE_ANON_KEY (or VITE_* variants)
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnvFile(path) {
  try {
    const raw = readFileSync(path, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (!m) continue
      const key = m[1]
      let val = m[2]
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = val
    }
  } catch {}
}

loadEnvFile('.env.local')
loadEnvFile('.env')

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

const today = new Date().toISOString().slice(0, 10)
const listSelect =
  'id, user_id, title, type, date, time, location, city, address, lat, lng, description, tags, host, photo_url, featured, created_at, moderation_status'

const t0 = performance.now()
const { data: events, error: eventsError } = await supabase
  .from('events')
  .select(`${listSelect}, event_attendees(count)`)
  .gte('date', today)
  .order('date', { ascending: true })
  .order('id', { ascending: true })
  .limit(1000)
const listMs = Math.round(performance.now() - t0)

const t1 = performance.now()
const { data: cities, error: citiesError } = await supabase.rpc('distinct_upcoming_event_cities', {
  max_rows: 1200,
})
const rpcMs = Math.round(performance.now() - t1)

console.log(
  JSON.stringify(
    {
      listQuery: { rows: events?.length || 0, ms: listMs, error: eventsError?.message || null },
      sitemapRpc: { cities: cities?.length || 0, ms: rpcMs, error: citiesError?.message || null },
    },
    null,
    2,
  ),
)

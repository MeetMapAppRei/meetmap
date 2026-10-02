import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

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
    if (process.env[key] == null || process.env[key] === '') process.env[key] = val
  }
}

loadEnvFile(path.join(process.cwd(), '.env'))
loadEnvFile(path.join(process.cwd(), '.env.local'))

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
const supabase = createClient(url, key, { auth: { persistSession: false } })
const today = new Date().toISOString().slice(0, 10)

const { count: upcoming, error: e1 } = await supabase
  .from('events')
  .select('*', { count: 'exact', head: true })
  .gte('date', today)

const { count: total, error: e2 } = await supabase
  .from('events')
  .select('*', { count: 'exact', head: true })

console.log(
  JSON.stringify({ today, upcoming, total, errors: [e1?.message, e2?.message].filter(Boolean) }),
)

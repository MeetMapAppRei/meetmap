import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const SAVED_EVENT_PUSH_URL = Deno.env.get('SAVED_EVENT_PUSH_URL') || ''
const SAVED_EVENT_PUSH_BEARER = Deno.env.get('SAVED_EVENT_PUSH_BEARER') || ''

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

async function dispatchJob(job: {
  id: number
  kind: string
  event_id: string
  payload: Record<string, unknown>
}) {
  const body =
    job.kind === 'event_update'
      ? {
          mode: 'event_update',
          eventId: job.event_id,
          updateMessage: String(job.payload?.updateMessage || ''),
        }
      : {
          mode: 'event_status',
          eventId: job.event_id,
          statusLabel: String(job.payload?.statusLabel || 'Updated'),
        }

  const res = await fetch(SAVED_EVENT_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(SAVED_EVENT_PUSH_BEARER ? { Authorization: `Bearer ${SAVED_EVENT_PUSH_BEARER}` } : {}),
    },
    body: JSON.stringify(body),
  })
  return res.ok
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' })
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
    return json(500, { error: 'Missing Supabase env vars' })
  if (!SAVED_EVENT_PUSH_URL) return json(500, { error: 'Missing SAVED_EVENT_PUSH_URL' })

  const limitParam = Number(new URL(request.url).searchParams.get('limit') || '20')
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(100, limitParam)) : 20

  const { data: jobs, error } = await supabase
    .from('notification_jobs')
    .select('id, kind, event_id, payload')
    .is('processed_at', null)
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) return json(500, { error: String(error.message || error) })

  let processed = 0
  let failed = 0
  for (const job of jobs || []) {
    const ok = await dispatchJob(
      job as { id: number; kind: string; event_id: string; payload: Record<string, unknown> },
    )
    if (!ok) {
      failed += 1
      continue
    }
    const { error: updateErr } = await supabase
      .from('notification_jobs')
      .update({ processed_at: new Date().toISOString() })
      .eq('id', job.id)
    if (updateErr) {
      failed += 1
      continue
    }
    processed += 1
  }
  return json(200, { ok: true, processed, failed, queued: (jobs || []).length })
})

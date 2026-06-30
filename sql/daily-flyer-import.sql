-- Daily nationwide flyer auto-import tracking.
-- Cron/server code writes with the Supabase service role; clients get read-only access
-- for the admin-gated review UI.

create table if not exists public.flyer_import_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'completed', 'completed_with_errors', 'failed')),
  dry_run boolean not null default true,
  source_count integer not null default 0,
  candidate_count integer not null default 0,
  posted_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.flyer_import_runs enable row level security;

drop policy if exists "flyer_import_runs_select_authenticated" on public.flyer_import_runs;
create policy "flyer_import_runs_select_authenticated"
on public.flyer_import_runs
for select
to authenticated
using (true);

drop policy if exists "flyer_import_runs_no_client_insert" on public.flyer_import_runs;
create policy "flyer_import_runs_no_client_insert"
on public.flyer_import_runs
for insert
to authenticated
with check (false);

drop policy if exists "flyer_import_runs_no_client_update" on public.flyer_import_runs;
create policy "flyer_import_runs_no_client_update"
on public.flyer_import_runs
for update
to authenticated
using (false)
with check (false);

drop policy if exists "flyer_import_runs_no_client_delete" on public.flyer_import_runs;
create policy "flyer_import_runs_no_client_delete"
on public.flyer_import_runs
for delete
to authenticated
using (false);

create table if not exists public.flyer_import_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.flyer_import_runs(id) on delete cascade,
  source_url text not null,
  source_account text,
  source_provider text,
  source_posted_at timestamptz,
  image_url text,
  stored_image_url text,
  status text not null default 'pending'
    check (status in ('pending', 'posted', 'skipped', 'failed', 'dry_run')),
  skip_reason text,
  confidence integer not null default 0 check (confidence between 0 and 100),
  validation jsonb not null default '{}'::jsonb,
  extracted jsonb not null default '{}'::jsonb,
  title text,
  type text,
  date date,
  time text,
  location text,
  city text,
  address text,
  host text,
  description text,
  tags text[] not null default '{}',
  lat double precision,
  lng double precision,
  event_id uuid references public.events(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, source_url)
);

create index if not exists flyer_import_candidates_run_id_idx
  on public.flyer_import_candidates(run_id);

create index if not exists flyer_import_candidates_status_idx
  on public.flyer_import_candidates(status);

create index if not exists flyer_import_candidates_event_id_idx
  on public.flyer_import_candidates(event_id);

create index if not exists flyer_import_candidates_source_url_idx
  on public.flyer_import_candidates(source_url);

alter table public.flyer_import_candidates enable row level security;

drop policy if exists "flyer_import_candidates_select_authenticated" on public.flyer_import_candidates;
create policy "flyer_import_candidates_select_authenticated"
on public.flyer_import_candidates
for select
to authenticated
using (true);

drop policy if exists "flyer_import_candidates_no_client_insert" on public.flyer_import_candidates;
create policy "flyer_import_candidates_no_client_insert"
on public.flyer_import_candidates
for insert
to authenticated
with check (false);

drop policy if exists "flyer_import_candidates_no_client_update" on public.flyer_import_candidates;
create policy "flyer_import_candidates_no_client_update"
on public.flyer_import_candidates
for update
to authenticated
using (false)
with check (false);

drop policy if exists "flyer_import_candidates_no_client_delete" on public.flyer_import_candidates;
create policy "flyer_import_candidates_no_client_delete"
on public.flyer_import_candidates
for delete
to authenticated
using (false);

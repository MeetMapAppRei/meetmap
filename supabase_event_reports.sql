create table if not exists public.event_reports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  reporter_user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'ignored')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.event_reports enable row level security;

-- Everyone can insert a report for events. Moderation UI is admin-gated client-side.
drop policy if exists "event_reports_insert_own" on public.event_reports;
create policy "event_reports_insert_own"
on public.event_reports
for insert
to authenticated
with check (auth.uid() = reporter_user_id);

-- Allow authenticated users to view reports (moderation UI is still admin-gated client-side).
drop policy if exists "event_reports_select_authenticated" on public.event_reports;
create policy "event_reports_select_authenticated"
on public.event_reports
for select
to authenticated
using (true);

-- Allow authenticated users to update report status (moderation UI is admin-gated client-side).
drop policy if exists "event_reports_update_authenticated" on public.event_reports;
create policy "event_reports_update_authenticated"
on public.event_reports
for update
to authenticated
using (true)
with check (true);

create index if not exists event_reports_status_created_at_idx
on public.event_reports (status, created_at desc);

create index if not exists event_reports_event_id_idx
on public.event_reports (event_id);


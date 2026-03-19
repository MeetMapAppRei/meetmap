create table if not exists public.event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('interested', 'going')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);

insert into public.event_rsvps (event_id, user_id, status)
select ea.event_id, ea.user_id, 'going'
from public.event_attendees ea
left join public.event_rsvps er
  on er.event_id = ea.event_id and er.user_id = ea.user_id
where er.id is null
on conflict (event_id, user_id) do nothing;

alter table public.event_rsvps enable row level security;

drop policy if exists "event_rsvps_select_all" on public.event_rsvps;
create policy "event_rsvps_select_all"
on public.event_rsvps
for select
to anon, authenticated
using (true);

drop policy if exists "event_rsvps_insert_own" on public.event_rsvps;
create policy "event_rsvps_insert_own"
on public.event_rsvps
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "event_rsvps_update_own" on public.event_rsvps;
create policy "event_rsvps_update_own"
on public.event_rsvps
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "event_rsvps_delete_own" on public.event_rsvps;
create policy "event_rsvps_delete_own"
on public.event_rsvps
for delete
to authenticated
using (auth.uid() = user_id);

create index if not exists event_rsvps_event_id_status_idx
on public.event_rsvps (event_id, status);

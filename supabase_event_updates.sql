create table if not exists public.event_updates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.event_updates enable row level security;

drop policy if exists "event_updates_select_all" on public.event_updates;
create policy "event_updates_select_all"
on public.event_updates
for select
to anon, authenticated
using (true);

drop policy if exists "event_updates_insert_owner" on public.event_updates;
create policy "event_updates_insert_owner"
on public.event_updates
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.events e
    where e.id = event_updates.event_id
      and e.user_id = auth.uid()
  )
);

create index if not exists event_updates_event_id_created_at_idx
on public.event_updates (event_id, created_at desc);

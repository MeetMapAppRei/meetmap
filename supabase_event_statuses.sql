create table if not exists public.event_statuses (
  event_id uuid primary key references public.events(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'moved', 'delayed', 'canceled')),
  status_note text,
  updated_at timestamptz not null default now()
);

alter table public.event_statuses enable row level security;

create policy if not exists "event_statuses_select_all"
on public.event_statuses
for select
to anon, authenticated
using (true);

create policy if not exists "event_statuses_insert_owner"
on public.event_statuses
for insert
to authenticated
with check (
  exists (
    select 1
    from public.events e
    where e.id = event_statuses.event_id
      and e.user_id = auth.uid()
  )
);

create policy if not exists "event_statuses_update_owner"
on public.event_statuses
for update
to authenticated
using (
  exists (
    select 1
    from public.events e
    where e.id = event_statuses.event_id
      and e.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.events e
    where e.id = event_statuses.event_id
      and e.user_id = auth.uid()
  )
);

create policy if not exists "event_statuses_delete_owner"
on public.event_statuses
for delete
to authenticated
using (
  exists (
    select 1
    from public.events e
    where e.id = event_statuses.event_id
      and e.user_id = auth.uid()
  )
);

-- Phase 1 automation tables/functions for saved-event push delivery.
-- Depends on:
-- - device_push_tokens
-- - user_notification_preferences
-- from push-notifications-phase1.sql

create table if not exists public.push_notification_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  kind text not null check (kind in ('reminder', 'event_update', 'event_status')),
  dedupe_key text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists push_notification_sends_user_dedupe_idx
  on public.push_notification_sends(user_id, dedupe_key);

create index if not exists push_notification_sends_event_idx
  on public.push_notification_sends(event_id, created_at desc);

alter table public.push_notification_sends enable row level security;

drop policy if exists "Users can read own push send history" on public.push_notification_sends;
create policy "Users can read own push send history"
  on public.push_notification_sends
  for select
  using (auth.uid() = user_id);

-- Queue outbound notifications triggered by db changes.
create table if not exists public.notification_jobs (
  id bigserial primary key,
  kind text not null check (kind in ('event_update', 'event_status')),
  event_id uuid not null references public.events(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists notification_jobs_unprocessed_idx
  on public.notification_jobs(created_at)
  where processed_at is null;

alter table public.notification_jobs enable row level security;

drop policy if exists "No direct notification job reads for clients" on public.notification_jobs;
create policy "No direct notification job reads for clients"
  on public.notification_jobs
  for select
  using (false);

drop policy if exists "No direct notification job writes for clients" on public.notification_jobs;
create policy "No direct notification job writes for clients"
  on public.notification_jobs
  for all
  using (false)
  with check (false);

create or replace function public.enqueue_event_update_notification()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.notification_jobs(kind, event_id, payload)
  values (
    'event_update',
    new.event_id,
    jsonb_build_object('updateMessage', coalesce(new.message, ''))
  );
  return new;
end;
$$;

drop trigger if exists trg_enqueue_event_update_notification on public.event_updates;
create trigger trg_enqueue_event_update_notification
after insert on public.event_updates
for each row
execute function public.enqueue_event_update_notification();

create or replace function public.enqueue_event_status_notification()
returns trigger
language plpgsql
security definer
as $$
declare
  status_label text;
begin
  if tg_op = 'UPDATE' and (old.status, old.status_note) is not distinct from (new.status, new.status_note) then
    return new;
  end if;

  status_label :=
    case lower(coalesce(new.status, 'active'))
      when 'canceled' then 'Canceled'
      when 'moved' then 'Moved'
      when 'delayed' then 'Delayed'
      else 'Updated'
    end;

  if coalesce(new.status_note, '') <> '' then
    status_label := status_label || ' - ' || new.status_note;
  end if;

  insert into public.notification_jobs(kind, event_id, payload)
  values (
    'event_status',
    new.event_id,
    jsonb_build_object('statusLabel', status_label)
  );
  return new;
end;
$$;

drop trigger if exists trg_enqueue_event_status_notification on public.event_statuses;
create trigger trg_enqueue_event_status_notification
after insert or update on public.event_statuses
for each row
execute function public.enqueue_event_status_notification();

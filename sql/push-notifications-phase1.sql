-- Phase 1 notifications foundation:
-- - device push token storage
-- - per-user notification preferences for saved-event reminders + updates
-- - RLS policies so users can only manage their own rows

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('android', 'ios', 'web')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists device_push_tokens_user_id_idx
  on public.device_push_tokens(user_id);

create index if not exists device_push_tokens_active_idx
  on public.device_push_tokens(active);

create table if not exists public.user_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reminders_enabled boolean not null default true,
  event_updates_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.device_push_tokens enable row level security;
alter table public.user_notification_preferences enable row level security;

drop policy if exists "Users can read own push tokens" on public.device_push_tokens;
create policy "Users can read own push tokens"
  on public.device_push_tokens
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own push tokens" on public.device_push_tokens;
create policy "Users can insert own push tokens"
  on public.device_push_tokens
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own push tokens" on public.device_push_tokens;
create policy "Users can update own push tokens"
  on public.device_push_tokens
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own push tokens" on public.device_push_tokens;
create policy "Users can delete own push tokens"
  on public.device_push_tokens
  for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read own notification preferences" on public.user_notification_preferences;
create policy "Users can read own notification preferences"
  on public.user_notification_preferences
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own notification preferences" on public.user_notification_preferences;
create policy "Users can insert own notification preferences"
  on public.user_notification_preferences
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own notification preferences" on public.user_notification_preferences;
create policy "Users can update own notification preferences"
  on public.user_notification_preferences
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own notification preferences" on public.user_notification_preferences;
create policy "Users can delete own notification preferences"
  on public.user_notification_preferences
  for delete
  using (auth.uid() = user_id);

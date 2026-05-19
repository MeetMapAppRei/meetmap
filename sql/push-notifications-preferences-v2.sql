-- Per-window reminder toggles for user_notification_preferences.
-- Safe to run after push-notifications-phase1.sql

alter table public.user_notification_preferences
  add column if not exists reminder_24h_enabled boolean not null default true,
  add column if not exists reminder_2h_enabled boolean not null default true;

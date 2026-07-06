-- Reduce Disk IO on free/small Supabase compute tiers.
-- Evidence: events table had ~25M seq_tup_read vs ~7.5k idx_scan with only ~1.6k rows;
-- main list query used Seq Scan (no index on date).

-- ── Query indexes ─────────────────────────────────────────────
create index if not exists events_date_id_idx
  on public.events (date asc, id asc);

create index if not exists events_date_user_id_idx
  on public.events (date, user_id);

create index if not exists events_active_date_id_idx
  on public.events (date asc, id asc)
  where moderation_status = 'active';

create index if not exists comments_event_id_created_at_idx
  on public.comments (event_id, created_at asc);

create index if not exists saved_events_event_id_idx
  on public.saved_events (event_id);

-- ── RLS: evaluate auth once per query (not per row) ───────────
alter policy "events_select_visible"
  on public.events
  using (
    (moderation_status = 'active')
    or ((select auth.uid()) = user_id)
    or (select app_private.is_moderator())
  );

alter policy "events_update_owner_or_moderator"
  on public.events
  using (
    ((select auth.uid()) = user_id)
    or (select app_private.is_moderator())
  )
  with check (
    ((select auth.uid()) = user_id)
    or (select app_private.is_moderator())
  );

alter policy "Users can delete own events"
  on public.events
  using ((select auth.uid()) = user_id);

alter policy "events_insert_unsuspended_owner"
  on public.events
  with check (
    ((select auth.uid()) = user_id)
    and not exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.suspended_at is not null
    )
  );

-- ── Sitemap: small DISTINCT city list (no 5k-row client pull) ─
create or replace function public.distinct_upcoming_event_cities(max_rows integer default 1200)
returns table(city_label text, lastmod date)
language sql
stable
security definer
set search_path = public
as $$
  select
    trim(e.city) as city_label,
    max(e.created_at)::date as lastmod
  from public.events e
  where e.date >= current_date
    and e.moderation_status = 'active'
    and trim(coalesce(e.city, '')) <> ''
  group by lower(trim(e.city)), trim(e.city)
  order by trim(e.city)
  limit greatest(1, least(coalesce(max_rows, 1200), 5000));
$$;

revoke all on function public.distinct_upcoming_event_cities(integer) from public;
grant execute on function public.distinct_upcoming_event_cities(integer) to anon, authenticated, service_role;

-- ── Cron: poll less often when queue is usually empty ─────────
select cron.unschedule(jobid)
from cron.job
where jobname in ('meetmap-notification-job-runner', 'meetmap-saved-event-reminder-tick');

select cron.schedule(
  'meetmap-notification-job-runner',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'meetmap_project_url')
      || '/functions/v1/notification-job-runner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'meetmap_publishable_key'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'meetmap_publishable_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

select cron.schedule(
  'meetmap-saved-event-reminder-tick',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'meetmap_project_url')
      || '/functions/v1/saved-event-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'meetmap_publishable_key'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'meetmap_publishable_key')
    ),
    body := '{"mode":"reminder_tick"}'::jsonb
  ) as request_id;
  $$
);

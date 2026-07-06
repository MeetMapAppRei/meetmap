-- Schedule Meet Map push delivery (requires pg_cron + pg_net).
-- One-time setup: store credentials in Vault (Dashboard → Database → Vault), then run this file.
--
--   select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'meetmap_project_url', 'Meet Map project URL');
--   select vault.create_secret('YOUR_SUPABASE_ANON_KEY', 'meetmap_publishable_key', 'Anon key for cron HTTP auth');
--
-- Edge function secret (Dashboard → Edge Functions → Secrets):
--   SAVED_EVENT_PUSH_URL = https://YOUR_PROJECT_REF.supabase.co/functions/v1/saved-event-push

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

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

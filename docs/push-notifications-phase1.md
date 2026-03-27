# MeetMap Android Push (Phase 1)

This phase enables:

- reminders for saved events (24h + 2h windows)
- update notifications for saved events (host updates + status changes)

## What is now in the repo

- App token registration + preference bootstrap:
  - `src/lib/pushNotifications.js`
  - `src/App.jsx`
  - `src/lib/supabase.js`
- Schema/policies:
  - `sql/push-notifications-phase1.sql`
  - `sql/push-notifications-phase1-automation.sql`
- Edge Functions:
  - `supabase/functions/saved-event-push/index.ts`
  - `supabase/functions/notification-job-runner/index.ts`

## Required environment variables

### `saved-event-push` function

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FCM_SERVER_KEY`
- `APP_DEEPLINK_BASE` (optional, default `meetmap://event/`)
- `APP_WEB_BASE` (optional, default `https://www.findcarmeets.com/?event=`)

### `notification-job-runner` function

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SAVED_EVENT_PUSH_URL` (URL of deployed `saved-event-push` function)
- `SAVED_EVENT_PUSH_BEARER` (optional bearer token if you protect the sender endpoint)

## Suggested deployment order

1. Apply SQL migrations in this order:
   1. `push-notifications-phase1.sql`
   2. `push-notifications-phase1-automation.sql`
2. Deploy `saved-event-push`.
3. Deploy `notification-job-runner`.
4. Set Android Firebase config (`google-services.json`) and run:
   - `npm run cap:sync`
5. Open app on Android and tap Alerts to register token.

## How delivery works

- **Host update posted**: DB trigger inserts a row in `notification_jobs`.
- **Event status changed**: DB trigger inserts a row in `notification_jobs`.
- **Runner function** (`notification-job-runner`) reads pending jobs and calls `saved-event-push`.
- **Push sender** (`saved-event-push`) fan-outs to users who saved the event and have active Android tokens.
- **Dedupe**: each sent notification stores a `dedupe_key` in `push_notification_sends`.

## Scheduling

Use Supabase Scheduled Functions (or your cron platform) to call:

- `notification-job-runner` every 1-2 minutes
- `saved-event-push` with `{"mode":"reminder_tick"}` every 5 minutes

Example body for reminders:

```json
{ "mode": "reminder_tick" }
```

# MeetMap Native Push (Phase 1)

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
- `FCM_PROJECT_ID` (Firebase project id, e.g. from `google-services.json` → `project_info.project_id`)
- `FCM_CLIENT_EMAIL` (service account `client_email`)
- `FCM_PRIVATE_KEY` (service account `private_key` — keep the `-----BEGIN PRIVATE KEY-----` lines; newlines can be stored as `\n`)
- `APP_DEEPLINK_BASE` (optional, default `meetmap://event/`)
- `APP_WEB_BASE` (optional, default `https://www.findcarmeets.com/?event=`)

### `notification-job-runner` function

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SAVED_EVENT_PUSH_URL` (**required**) — URL of deployed `saved-event-push`, e.g. `https://<project-ref>.supabase.co/functions/v1/saved-event-push`
- `SAVED_EVENT_PUSH_BEARER` (optional extra auth if you set `SAVED_EVENT_PUSH_BEARER` on `saved-event-push`; otherwise the runner uses the service role JWT for gateway auth)

## Suggested deployment order

1. Apply SQL migrations in this order:
   1. `push-notifications-phase1.sql`
   2. `push-notifications-phase1-automation.sql`
2. Deploy `saved-event-push`.
3. Deploy `notification-job-runner`.
4. Set Android Firebase config (`google-services.json`) and run:
   - `npm run cap:sync`
5. Open app on Android or iOS and tap **Alerts** to register a device token.

## iOS (iPhone / iPad)

### Xcode

1. Open `ios/App/App.xcworkspace`.
2. Target **App** → **Signing & Capabilities** → confirm **Push Notifications** is listed (entitlements file `App/App.entitlements` is in the repo).
3. For **TestFlight / App Store** builds, set `aps-environment` in `App.entitlements` to `production` before archiving.
4. For **Xcode Run** debug installs on a device, keep `aps-environment` as `development` and set `APNS_ENV=sandbox` on the edge function (below).

### Apple Developer

1. Create an **APNs Auth Key** (.p8) with Push Notifications enabled.
2. Note the **Key ID** and your **Team ID**.

### `saved-event-push` edge secrets (iOS)

- `APNS_KEY_ID` — Auth Key ID from Apple Developer
- `APNS_TEAM_ID` — Apple Developer Team ID
- `APNS_PRIVATE_KEY` — contents of the `.p8` file (newlines as `\n` in Supabase secrets)
- `APNS_BUNDLE_ID` (optional, default `com.findcarmeets.app`)
- `APNS_ENV` — `sandbox` for Xcode debug builds, `production` for TestFlight/App Store

Redeploy `saved-event-push` after setting these secrets.

## User preferences

Per-user settings live in `user_notification_preferences`:

- `reminders_enabled` — master switch for start-time reminders
- `reminder_24h_enabled` / `reminder_2h_enabled` — per-window reminders (apply migration `sql/push-notifications-preferences-v2.sql`)
- `event_updates_enabled` — host updates and status changes

Users edit these in the app via **Alerts** → **Alert settings** (logged-in accounts sync across devices).

## How delivery works

- **Host update posted**: DB trigger inserts a row in `notification_jobs`.
- **Event status changed**: DB trigger inserts a row in `notification_jobs`.
- **Runner function** (`notification-job-runner`) reads pending jobs and calls `saved-event-push`.
- **Push sender** (`saved-event-push`) fan-outs to every active Android/iOS token for users who saved the event.
- **Dedupe**: each sent notification stores a per-device `dedupe_key` in `push_notification_sends` (same alert can go to phone and tablet).

## Scheduling

Production uses **pg_cron + pg_net** (see `sql/push-notifications-cron.sql`):

1. Enable extensions (`pg_cron`, `pg_net`) if not already enabled.
2. Store `meetmap_project_url` and `meetmap_publishable_key` in **Vault** (anon JWT for HTTP auth).
3. Set edge secret `SAVED_EVENT_PUSH_URL` on the Supabase project.
4. Run `sql/push-notifications-cron.sql` to schedule:
   - `notification-job-runner` every 2 minutes
   - `saved-event-push` `reminder_tick` every 5 minutes

Example body for manual reminder test:

```json
{ "mode": "reminder_tick" }
```

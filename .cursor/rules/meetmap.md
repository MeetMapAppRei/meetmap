## Meet Map Cursor rules

### Goal

Make changes that work for **both web (Vercel)** and **Android (Capacitor)** without breaking build, push notifications, or Supabase data flows.

### Guardrails

- Do not commit secrets. Never edit `.env` values unless explicitly asked.
- Prefer small, testable diffs. Avoid “drive-by refactors” in unrelated files.
- Keep Vite compatible with Capacitor: `vite.config.js` uses `base: './'` so asset URLs must be relative-friendly.

### Project structure

- **Frontend**: `src/` (React 18 + Vite, JS/JSX)
- **Serverless API (Vercel Functions)**: `api/*.js`
- **Mobile**: Capacitor config + `android/` (Gradle)
- **Database**: `sql/` + `supabase/` (migrations/policies live here)

### Coding standards (JS/React)

- Prefer functional components + hooks.
- Keep effects deterministic: stable deps, cancel async work on unmount where needed.
- Avoid introducing new global state unless necessary; prefer colocated state.
- If adding new environment variables, document them and use the `VITE_` prefix for client usage.

### Supabase usage

- Centralize Supabase reads/writes in `src/lib/supabase.js` (or nearby `src/lib/*`), not scattered across components.
- Be careful with client-side secrets: only publishable keys belong in the client bundle.
- For new tables/columns/policies, add SQL migrations under `supabase/` or `sql/` (prefer migrations if present).

### Vercel Functions

- Keep functions small and fast; respect existing `vercel.json` `maxDuration` limits.
- Return consistent JSON error shapes (`{ error: string }`) and set correct CORS headers when called from the browser/webview.

### Mobile (Android)

- Don’t change Gradle/plugin versions casually.
- Push notifications: do not auto-register at startup; only enable on explicit user action (existing behavior in `src/App.jsx`).

### “Definition of done” for changes

- `npm run build` succeeds.
- Lint/format passes (once configured).
- Web app loads and core flows still work (list/map, view event, post event).
- Android sync/build is not broken by asset paths (`base: './'`) or API origin assumptions.

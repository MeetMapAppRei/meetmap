# Move images to Cloudflare R2 (reduce Supabase cached egress)

Supabase **free** cached egress is tiny; serving full-size **event photos** from `event-photos` blows past it quickly. This project supports:

1. **Client-side image compression** before upload (always on).
2. **Optional R2 uploads** via a Vercel API (`/api/storage-presign`) so **secrets never ship in the app bundle**.
3. A **one-time migration script** to copy existing Supabase URLs into R2 and update the database.

Keep **Supabase** for Postgres + Auth unless you have another reason to move them.

---

## Part A — Cloudflare R2 setup (you do this in the browser)

### 1. Create an R2 bucket

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com) → **R2**.
2. **Create bucket** → name e.g. `meetmap-media` → **Create bucket**.

### 2. Enable public access (read)

1. Open the bucket → **Settings**.
2. Under **Public access**, enable **R2.dev subdomain** *or* connect a **custom domain** (e.g. `cdn.yourdomain.com`).
3. Copy the **public URL base** (example: `https://pub-xxxxxxxxxxxx.r2.dev`).  
   - No trailing slash.  
   - This becomes `R2_PUBLIC_BASE_URL`.

### 3. CORS (required for browser uploads)

In the bucket **CORS** policy, allow your app origins and **PUT**:

Example JSON (adjust origins to your real domains):

```json
[
  {
    "AllowedOrigins": [
      "https://findcarmeets.com",
      "https://meetmap-gilt.vercel.app",
      "http://localhost:5173"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Add your **Capacitor / production** web origin if different. Without CORS, the browser **PUT** to the presigned URL will fail.

### 4. API token (S3-compatible)

1. R2 → **Manage R2 API Tokens** → **Create API token**.
2. Permissions: **Object Read & Write** on this bucket (or admin for dev).
3. Save **Access Key ID** and **Secret Access Key**.
4. **Account ID** is shown in the R2 sidebar URL or dashboard.

---

## Part B — Vercel environment variables (server only)

In **Vercel** → your project → **Settings** → **Environment Variables**, add:

| Name | Value |
|------|--------|
| `R2_ACCOUNT_ID` | Cloudflare account id |
| `R2_ACCESS_KEY_ID` | R2 token access key |
| `R2_SECRET_ACCESS_KEY` | R2 token secret |
| `R2_BUCKET_NAME` | e.g. `meetmap-media` |
| `R2_PUBLIC_BASE_URL` | Public base URL (no trailing `/`) |
| `SUPABASE_URL` | Same as `VITE_SUPABASE_URL` |
| `SUPABASE_ANON_KEY` | Same as `VITE_SUPABASE_ANON_KEY` |

Redeploy after saving.

Optional: you can omit duplicate names if you already use `VITE_*` in Vercel—the API falls back to `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` if `SUPABASE_*` is unset.

---

## Part C — Frontend / mobile env (client)

In **Vercel** (and in `.env` for local builds), set:

```env
VITE_USE_R2_STORAGE=true
```

Leave unset or `false` to keep using **Supabase Storage** only.

Ensure **`VITE_APP_ORIGIN`** points at the same host that serves `/api/*` (your Vercel deployment), especially for **Capacitor** builds.

Redeploy the site / rebuild the app after changing env vars.

---

## Part D — Migrate existing images (one-time)

1. Copy `.env.migrate.example` → **`.env.migrate`** in the project root.
2. Fill in `SUPABASE_URL`, **`SUPABASE_SERVICE_ROLE_KEY`** (from Supabase → **Project Settings** → **API** — keep secret), and all `R2_*` values.
3. Install deps: `npm install`
4. Dry run:  
   `DRY_RUN=1 node scripts/migrate-supabase-images-to-r2.mjs`
5. If output looks good:  
   `node scripts/migrate-supabase-images-to-r2.mjs`

The script updates **`events.photo_url`** and **`flyer_imports.image_url`** when the URL still points at Supabase `event-photos`.

---

## Part E — Verify

1. Open the deployed site, **sign in**, post or edit an event with a photo → image should load from **`R2_PUBLIC_BASE_URL`** in the network tab.
2. Supabase **Usage** → **Cached egress** should drop over the next days as traffic shifts to R2.
3. Old Supabase objects can be deleted later from **Supabase → Storage** (after you’re sure R2 URLs work).

---

## Local development

- `/api/storage-presign` runs on **Vercel**, not in plain `vite` unless you use **`vercel dev`** or proxy.
- For local UI testing of R2 flow: run `vercel dev` from the repo, or test on the **preview deployment**.

---

## Rollback

Set `VITE_USE_R2_STORAGE=false` (or remove it), redeploy, and new uploads go back to Supabase Storage. Existing rows already pointing at R2 keep working as long as R2 stays public.

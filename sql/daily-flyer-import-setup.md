# Daily Flyer Import Setup

The daily importer runs from `api/cron-import-flyers.js` through Vercel Cron.

## Required Environment Variables

- `CRON_SECRET`: shared secret Vercel sends as `Authorization: Bearer <secret>`.
- `SUPABASE_URL` or `VITE_SUPABASE_URL`: Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only key used by the cron function.
- `FLYER_AGENT_USER_ID`: user ID that owns auto-posted events. `FLYER_AGENT_EMAIL` is also supported as a fallback lookup.
- `ANTHROPIC_API_KEY`: required by the existing `/api/extract-flyer` endpoint.
- `FLYER_IMPORT_SOURCE_URLS` or `FLYER_IMPORT_SOURCE_LIST`: nationwide source configuration.

## Optional Environment Variables

- `FLYER_IMPORT_DRY_RUN`: defaults to `true`. Set to `false` only after reviewing dry-run logs.
- `FLYER_IMPORT_DAILY_LIMIT`: defaults to `10`, capped at `25`.
- `FLYER_IMPORT_PROVIDER_API_KEY`: bearer token sent to configured source URLs.
- `FLYER_IMPORT_APP_ORIGIN`: absolute app origin used when calling `/api/extract-flyer`.
- `FLYER_IMPORT_EXTRACT_URL`: override URL for flyer extraction.
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL`: used when uploading event photos to R2.

## Source Payload Format

Each source URL should return either an array, or an object with `candidates`, `items`, or `posts`.

```json
{
  "candidates": [
    {
      "sourceUrl": "https://www.instagram.com/p/example/",
      "imageUrl": "https://cdn.example.com/flyer.jpg",
      "caption": "Optional caption text",
      "account": "example_account",
      "postedAt": "2026-06-29T12:00:00Z"
    }
  ]
}
```

Inline JSON is also supported through `FLYER_IMPORT_CANDIDATES_JSON` for dry-run testing.

## Rollout

1. Apply `sql/daily-flyer-import.sql`.
2. Set env vars with `FLYER_IMPORT_DRY_RUN=true`.
3. Trigger `/api/cron-import-flyers?dryRun=true&secret=<CRON_SECRET>` manually.
4. Review the app's `Auto Imports` modal.
5. Set `FLYER_IMPORT_DRY_RUN=false` when results are consistently high quality.

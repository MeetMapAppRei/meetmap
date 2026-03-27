## Safety & hygiene

- Never add `dist/`, `node_modules/`, Android build outputs, or keystore materials to git.
- Avoid modifying `.env` and `.env.*` contents; treat them as local-only unless the task is specifically env-related.
- When touching auth/storage/API routes, double-check that no secrets are logged or returned.

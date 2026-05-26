# Cross-machine sync (Windows ↔ Mac)

Keep **meetmap** and **meetmap-desktop** aligned via GitHub. Cursor does not sync code or chat history between computers.

## One-time setup on the Mac

1. Clone both repos under `~/Documents/` (same layout as Windows):

   ```bash
   cd ~/Documents
   git clone https://github.com/MeetMapAppRei/meetmap.git
   git clone https://github.com/MeetMapAppRei/meetmap-desktop.git
   ```

2. Open **`~/Documents/Desktop-projects.code-workspace`** (copy from Windows or recreate with the same folder paths).

3. Allow automatic tasks when Cursor asks (so **Sync on folder open** can run).

4. Optional — install git hooks (reminder after pull):

   ```bash
   cd ~/Documents/meetmap
   node scripts/install-git-hooks.mjs
   ```

## Daily workflow

| When                                | Command                                                   |
| ----------------------------------- | --------------------------------------------------------- |
| **Sit down at this machine**        | `cd ~/Documents/meetmap && npm run sync:pull`             |
| **Done for the day / switching PC** | Commit in each repo you changed, then `npm run sync:push` |
| **Check both repos**                | `npm run sync:status`                                     |

From **meetmap-desktop** you can also run `npm run sync:pull` (delegates to meetmap).

## What syncs automatically

- **On folder open:** `npm run sync:pull` (if automatic tasks are enabled)
- **Cursor agent:** rules in `.cursor/rules/cross-machine-sync.mdc` tell the agent to pull at session start and push when you finish

## What does not sync

- Cursor chat history
- Uncommitted files
- `.env` and local secrets (never commit)

## Troubleshooting

- **Pull skipped (uncommitted changes):** commit or `git stash`, then pull again.
- **Push rejected:** run `npm run sync:pull`, resolve conflicts, then push.
- **Desktop repo not found:** ensure `meetmap-desktop/meetmap-desktop` sits next to `meetmap` under Documents.

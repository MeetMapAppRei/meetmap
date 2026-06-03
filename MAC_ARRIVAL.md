# Mac — automatic sync when you open Meet Map

You do **not** need to run `git pull` or `npm ci` by hand each time.

## What happens automatically

1. **Open** `~/Documents/MeetMap/meetmap` (or `~/Documents/meetmap`) in Cursor.
2. **Allow automatic tasks** the first time Cursor asks.
3. On folder open, the project runs **`npm run mac:arrival`**:
   - `git pull` for meetmap (+ meetmap-desktop if present)
   - `npm ci` in each repo
   - **`npm run cap:sync`** — rebuilds the mobile web bundle and copies it into **`ios/`** and **`android/`** (same UI as mobile web; required after UI changes from Windows)

The Cursor agent is also instructed to run the same at the **start of every chat** on Mac.

## One-time on the Mac

If Cursor asks to enable automatic tasks → click **Allow**.

Optional Terminal check:

```bash
cd ~/Documents/MeetMap/meetmap
npm run mac:arrival
```

## Skip sync for one session

Tell Cursor: **don't sync**

## iOS app (after sync)

When `cap:sync` succeeds, open the Xcode project and run on a device or simulator:

```bash
npm run cap:open:ios
```

Ship to TestFlight/App Store from Xcode when ready. UI changes from Windows only reach the iOS binary after **pull + mac:arrival** (or manual `npm run cap:sync` on the Mac).

## More detail

[docs/CROSS_MACHINE_SYNC.md](docs/CROSS_MACHINE_SYNC.md)

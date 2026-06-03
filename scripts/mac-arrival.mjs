#!/usr/bin/env node
/**
 * Mac arrival checklist — run once when opening meetmap on the Mac after using Windows.
 * Usage: npm run mac:arrival
 */

import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { platform } from 'os'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { resolveDesktopDir } from './resolve-desktop-dir.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function run(cmd, args, cwd = root) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', stdio: 'inherit' })
  return r.status === 0
}

function header(msg) {
  console.log(`\n[mac:arrival] ${msg}`)
}

if (platform() !== 'darwin') {
  console.log('[mac:arrival] Not on macOS — skipped. On Windows use: npm run sync:pull')
  process.exit(0)
}

header(`Meet Map root: ${root}`)

if (!existsSync(join(root, 'package.json'))) {
  console.error(`
[mac:arrival] This folder is not a complete meetmap clone (no package.json).

Fix on the Mac (in Terminal):

  cd ~/Documents
  git clone https://github.com/MeetMapAppRei/meetmap.git meetmap
  cd meetmap
  npm run mac:arrival

If you already have a broken folder, back up .env first, then clone fresh.
`)
  process.exit(1)
}

if (!existsSync(join(root, '.git'))) {
  console.error('[mac:arrival] No .git here — clone from GitHub (see above).')
  process.exit(1)
}

header('Pulling meetmap + meetmap-desktop from GitHub...')
if (!run('npm', ['run', 'sync:pull'])) {
  console.error('[mac:arrival] sync:pull failed — commit or stash local changes, then retry.')
  process.exit(1)
}

header('Installing dependencies (npm ci)...')
if (!run('npm', ['ci'])) {
  console.error('[mac:arrival] npm ci failed — check package-lock.json is committed on main.')
  process.exit(1)
}

const desktop = resolveDesktopDir(root)
if (desktop && existsSync(join(desktop, 'package.json'))) {
  header('Installing meetmap-desktop dependencies...')
  if (!run('npm', ['ci'], desktop)) {
    console.error('[mac:arrival] meetmap-desktop npm ci failed.')
    process.exit(1)
  }
} else {
  console.log(
    '[mac:arrival] meetmap-desktop not found at ../meetmap-desktop/meetmap-desktop — skip or clone it.',
  )
}

const iosApp = join(root, 'ios', 'App')
if (existsSync(iosApp)) {
  header('Syncing web bundle → iOS + Android (Capacitor)...')
  if (!run('npm', ['run', 'cap:sync'])) {
    console.error(
      '[mac:arrival] cap:sync failed — fix build errors, then run: npm run cap:sync\n' +
        '  Open Xcode after a successful sync: npm run cap:open:ios',
    )
    process.exit(1)
  }
  console.log('[mac:arrival] Native projects updated. Xcode: npm run cap:open:ios')
} else {
  console.log('[mac:arrival] No ios/App — skipped Capacitor sync (clone full meetmap repo).')
}

console.log('\n[mac:arrival] Done — repos pulled, deps installed, native sync complete.\n')

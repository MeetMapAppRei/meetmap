/**
 * Standard Android build pipeline:
 * - bump versionCode (always before Play uploads)
 * - build web bundle
 * - sync Capacitor Android project
 *
 * This avoids forgetting version bumps and avoids shell `&&` portability issues.
 */
import { spawnSync } from 'child_process'

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' })
  if (res.status !== 0) process.exit(res.status ?? 1)
}

run('node', ['scripts/bump-android-version.mjs'])
run('npm', ['run', 'build:mobile'])
run('npx', ['cap', 'sync', 'android'])

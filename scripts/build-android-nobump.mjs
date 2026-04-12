/**
 * Android build pipeline without bumping versionCode.
 * Useful when you need to target a specific versionCode (e.g. set manually).
 */
import { spawnSync } from 'child_process'

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' })
  if (res.status !== 0) process.exit(res.status ?? 1)
}

run('npm', ['run', 'build:mobile'])
run('npx', ['cap', 'sync', 'android'])


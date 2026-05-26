#!/usr/bin/env node
/** Point this repo's git hooks at scripts/git-hooks (run once per clone). */

import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'
import { platform } from 'os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

if (!existsSync(join(root, '.git'))) {
  console.error('Not a git repository:', root)
  process.exit(1)
}

const r = spawnSync('git', ['config', 'core.hooksPath', 'scripts/git-hooks'], {
  cwd: root,
  stdio: 'inherit',
  shell: platform() === 'win32',
})

if (r.status !== 0) process.exit(r.status ?? 1)
console.log('Git hooks installed (core.hooksPath=scripts/git-hooks).')

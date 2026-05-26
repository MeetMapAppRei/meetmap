#!/usr/bin/env node
/**
 * Pull or push meetmap + meetmap-desktop together (Mac ↔ Windows workflow).
 *
 * Usage:
 *   node scripts/sync-repos.mjs pull
 *   node scripts/sync-repos.mjs push
 *   node scripts/sync-repos.mjs status
 */

import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { homedir, platform } from 'os'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MEETMAP_ROOT = join(__dirname, '..')

const REPOS = [
  { name: 'meetmap', dir: MEETMAP_ROOT },
  {
    name: 'meetmap-desktop',
    dir: join(MEETMAP_ROOT, '..', 'meetmap-desktop', 'meetmap-desktop'),
  },
]

function git(cwd, args) {
  const r = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    shell: platform() === 'win32',
  })
  return {
    ok: r.status === 0,
    out: `${r.stdout || ''}${r.stderr || ''}`.trim(),
    status: r.status ?? 1,
  }
}

function resolveRepos() {
  const resolved = []
  for (const repo of REPOS) {
    if (!existsSync(join(repo.dir, '.git'))) {
      console.warn(`[skip] ${repo.name}: not a git repo at ${repo.dir}`)
      continue
    }
    resolved.push(repo)
  }
  return resolved
}

function branch(cwd) {
  return git(cwd, ['branch', '--show-current']).out || 'main'
}

function isDirty(cwd) {
  const r = git(cwd, ['status', '--porcelain'])
  return r.ok && r.out.length > 0
}

function aheadBehind(cwd) {
  git(cwd, ['fetch', 'origin'])
  const b = branch(cwd)
  const r = git(cwd, ['rev-list', '--left-right', '--count', `origin/${b}...HEAD`])
  if (!r.ok) return { ahead: 0, behind: 0, branch: b }
  const [behind, ahead] = r.out.split(/\s+/).map(Number)
  return { ahead: ahead || 0, behind: behind || 0, branch: b }
}

function statusMode(repos) {
  let ok = true
  for (const { name, dir } of repos) {
    const dirty = isDirty(dir)
    const { ahead, behind, branch: b } = aheadBehind(dir)
    const flags = [
      dirty ? 'uncommitted changes' : 'clean',
      ahead ? `${ahead} commit(s) ahead` : null,
      behind ? `${behind} commit(s) behind origin` : null,
    ].filter(Boolean)
    console.log(`${name} (${b}): ${flags.join(' · ')}`)
    if (dirty || behind) ok = false
  }
  return ok ? 0 : 1
}

function pullMode(repos) {
  let failed = false
  for (const { name, dir } of repos) {
    if (isDirty(dir)) {
      console.warn(`[${name}] Skipping pull — uncommitted changes. Commit or stash first.`)
      failed = true
      continue
    }
    const b = branch(dir)
    console.log(`[${name}] Pulling origin/${b}...`)
    const r = git(dir, ['pull', '--rebase', 'origin', b])
    if (r.ok) console.log(`[${name}] Up to date.`)
    else {
      console.error(`[${name}] Pull failed:\n${r.out}`)
      failed = true
    }
  }
  return failed ? 1 : 0
}

function pushMode(repos) {
  let failed = false
  for (const { name, dir } of repos) {
    if (isDirty(dir)) {
      console.error(`[${name}] Cannot push — uncommitted changes. Commit first.`)
      failed = true
      continue
    }
    const { ahead, branch: b } = aheadBehind(dir)
    if (!ahead) {
      console.log(`[${name}] Nothing to push.`)
      continue
    }
    console.log(`[${name}] Pushing ${ahead} commit(s) to origin/${b}...`)
    const r = git(dir, ['push', '-u', 'origin', b])
    if (r.ok) console.log(`[${name}] Pushed.`)
    else {
      console.error(`[${name}] Push failed:\n${r.out}`)
      failed = true
    }
  }
  return failed ? 1 : 0
}

function main() {
  const mode = (process.argv[2] || 'status').toLowerCase()
  const repos = resolveRepos()
  if (!repos.length) {
    console.error('No git repositories found.')
    process.exit(1)
  }

  if (mode === 'status') process.exit(statusMode(repos))
  if (mode === 'pull') process.exit(pullMode(repos))
  if (mode === 'push') process.exit(pushMode(repos))

  console.error(`Unknown mode "${mode}". Use: pull | push | status`)
  process.exit(1)
}

main()

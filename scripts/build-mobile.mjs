import { spawnSync } from 'node:child_process'

const env = { ...process.env, MEETMAP_CAPACITOR_BUILD: '1' }
const result = spawnSync('npm run build', { stdio: 'inherit', shell: true, env })
if (result.error) {
  console.error(String(result.error?.message || result.error))
  process.exit(1)
}
process.exit(result.status ?? 1)


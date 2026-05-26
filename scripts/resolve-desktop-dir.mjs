import { existsSync } from 'fs'
import { join } from 'path'

/** meetmap-desktop Vite root — supports ~/Documents/meetmap and ~/Documents/MeetMap/meetmap */
export function resolveDesktopDir(meetmapRoot) {
  const candidates = [
    join(meetmapRoot, '..', 'meetmap-desktop', 'meetmap-desktop'),
    join(meetmapRoot, '..', '..', 'meetmap-desktop', 'meetmap-desktop'),
  ]
  for (const dir of candidates) {
    if (existsSync(join(dir, '.git'))) return dir
  }
  return null
}

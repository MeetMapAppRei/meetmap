/**
 * Increments android/app/build.gradle defaultConfig.versionCode by 1.
 * Run before every new Play Console upload so version codes never collide.
 *
 * Usage: node scripts/bump-android-version.mjs
 *        npm run android:bump-version
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const gradlePath = path.join(__dirname, '..', 'android', 'app', 'build.gradle')

const content = fs.readFileSync(gradlePath, 'utf8')
const match = content.match(/versionCode\s+(\d+)/)
if (!match) {
  console.error('Could not find versionCode in android/app/build.gradle')
  process.exit(1)
}

const previous = parseInt(match[1], 10)
const next = previous + 1
const updated = content.replace(/versionCode\s+\d+/, `versionCode ${next}`)

fs.writeFileSync(gradlePath, updated)
console.log(`Android versionCode: ${previous} → ${next}`)
console.log('Next: npm run build:mobile && npx cap sync android, then signed AAB in Android Studio.')

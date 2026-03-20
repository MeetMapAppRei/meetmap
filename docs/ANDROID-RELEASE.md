# Android release (Play Console)

Google Play accepts each **`versionCode` only once** for the whole app. If upload says *"Version code X has already been used"*, bump to **X + 1** and upload a new signed AAB.

## Before every new Play upload

1. **Bump + build + sync** (recommended one command):

   ```bash
   npm run release:android
   ```

   This runs `scripts/bump-android-version.mjs`, then `vite build`, then `npx cap sync android`.

2. **Or bump only** (then build yourself):

   ```bash
   npm run android:bump-version
   npm run build:mobile
   npx cap sync android
   ```

3. In **Android Studio**: **Build → Generate Signed Bundle / APK** → **Android App Bundle** → `release` → use your keystore.

4. Upload the **new** signed `.aab` to Play Console (never reuse an old file if the code inside still has an old `versionCode`).

## Notes

- `versionCode` lives in `android/app/build.gradle` (`defaultConfig`).
- `versionName` (e.g. `1.0`) is user-facing; you can change it when you want a new marketing version.
- The assistant should run **`npm run release:android`** (or at least `android:bump-version`) before preparing each Play release so the number always advances.

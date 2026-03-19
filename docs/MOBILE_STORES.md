# Meet Map — Step-by-step: Android & iPhone

Your app is a **web app inside a native shell** (Capacitor). Follow sections **in order**. Paths assume your project is `meetmap` on your computer (e.g. `C:\Users\...\Desktop\meetmap`).

---

## Part A — One-time setup (do once)

### A1. Install tools

1. Install **Node.js** (LTS) from https://nodejs.org/  
2. Install **Git** if you don’t have it (optional but recommended).  
3. **For Android only (Windows is OK):**  
   - Install **Android Studio** from https://developer.android.com/studio  
   - Open Android Studio once → complete the wizard → let it install **Android SDK**.  
   - In Android Studio: **Settings** (or **Preferences** on Mac) → **Languages & Frameworks** → **Android SDK** → note the **Android SDK location** (you may need it for `ANDROID_HOME`).  
4. **For iPhone only:** you need a **Mac** with **Xcode** from the Mac App Store, and **CocoaPods**:  
   ```bash
   sudo gem install cocoapods
   ```  
   (iOS steps below; skip until you have a Mac.)

### A2. Google accounts (Android)

1. Use a **Google account** you want as the app owner.  
2. Go to https://play.google.com/console and pay the **one-time developer registration fee** (if you haven’t already).  
3. Accept the agreements so you can create an app.

### A3. Apple account (iPhone)

1. Enroll in the **Apple Developer Program** ($/year): https://developer.apple.com/programs/  
2. You’ll use this for **App Store Connect** and **Xcode** signing later.

### A4. Confirm your live website has the APIs

The mobile app calls **`https://YOUR-DOMAIN/api/...`** (not relative paths).

1. In a browser, confirm your production site loads (e.g. `https://findcarmeets.com`).  
2. You do **not** need to open `/api/...` in a browser; just know that **flyer / AI features** need those routes deployed (e.g. Vercel serverless) on **that same domain**.

---

## Part B — Every mobile build (repeat whenever you change the web app)

Do this in **Terminal** (Mac/Linux) or **PowerShell** (Windows).  
`cd` into your project folder first:

```text
cd path\to\meetmap
```

### B1. Create / edit `.env`

1. If you don’t have `.env`, copy the example:  
   - Copy `.env.example` to a new file named `.env` in the **same folder** as `package.json`.  
2. Open `.env` in a text editor. Set at least:

| Line | What to put |
|------|-------------|
| `VITE_APP_ORIGIN` | Your real HTTPS URL **with no trailing slash**, e.g. `https://findcarmeets.com` |
| `VITE_SUPABASE_URL` | Same as your working web app |
| `VITE_SUPABASE_ANON_KEY` | Same as your working web app |
| `VITE_MAPBOX_TOKEN` | Same Mapbox **public** token as web |

**Important:** `VITE_APP_ORIGIN` must be set **before** the build in B2, or flyer/AI calls from the app will fail.

### B2. Install dependencies (if needed)

```bash
npm install
```

### B3. Build the web app and copy into Android/iOS

```bash
npm run cap:sync
```

This runs `vite build` and copies `dist/` into `android/` and `ios/`.  
**Run `npm run cap:sync` again** every time you change React/CSS and want a new store build.

---

## Part C — Android: open project and run on a device/emulator

### C1. Open Android Studio

From the project folder:

```bash
npm run cap:open:android
```

Or manually: **Android Studio** → **File** → **Open** → select the **`android`** folder inside `meetmap` (the one that contains `build.gradle` at the top level of that folder).

### C2. Wait for Gradle sync

1. Android Studio may ask to **Trust Project** → choose **Trust**.  
2. Wait until the bottom status bar finishes **Gradle sync** (no red errors).  
3. If it asks to install missing SDK components, click **Install** / **OK**.

### C3. Run the debug app (smoke test)

1. Connect an **Android phone** with **USB debugging** on, **or** create a **Virtual Device** (Tools → Device Manager → Create device).  
2. At the top toolbar, pick your device.  
3. Click the green **Run** ▶ button.  
4. The app should open. Test: map, login, list. If flyer import fails, recheck `VITE_APP_ORIGIN` and run **`npm run cap:sync`** again.

---

## Part D — Android: create a signed release (AAB) for Google Play

You need a **keystore** file (keep it backed up; losing it complicates updates).

### D1. Generate Signed Bundle (first time)

1. In Android Studio, menu **Build** → **Generate Signed App Bundle or APK…**  
2. Select **Android App Bundle** → **Next**.  
3. **Key store path:** click **Create new…**  
   - Choose a folder **outside** the repo (e.g. `Documents\meetmap-release-key.jks`).  
   - Set passwords (remember them).  
   - **Alias:** e.g. `meetmap`  
   - Fill **Certificate** (name, org, etc.) → **OK** → **Next**.  
4. Select **release** → **Create**.  
5. Note where the **`.aab`** file was saved (Android Studio shows the path).

### D2. Later updates

Same menu **Build** → **Generate Signed App Bundle…** → use the **same** keystore and bump version in:

- File: `android/app/build.gradle`  
- Increase **`versionCode`** by 1 each upload (e.g. `1` → `2`).  
- Optionally change **`versionName`** (e.g. `1.0` → `1.0.1`).

Then **Generate Signed Bundle** again.

---

## Part E — Google Play Console: internal testing (step-by-step)

### E1. Create the app

1. Go to https://play.google.com/console  
2. **All apps** → **Create app**  
3. Fill **App name**, **Default language**, **App or game**, **Free or paid**  
4. Accept declarations → **Create app**

### E2. Complete required sections (dashboard will show what’s missing)

Typical minimum for a first internal test:

1. **App access** — if the app needs login, explain how reviewers/testers get access.  
2. **Ads** — declare if you show ads.  
3. **Content rating** — complete the questionnaire.  
4. **Target audience**  
5. **News apps** — usually “No”  
6. **Data safety** — list what you collect (account, location if used, photos if uploaded, etc.). Match reality.  
7. **Government apps** — usually “No”  
8. **Financial features** — if not a banking app, usually “No”

### E3. Store listing (can be minimal for internal test, but some items are required)

1. **Main store listing**: short description, full description, **app icon** (512×512), **feature graphic** (1024×500), **phone screenshots** (at least 2).  
2. **Privacy policy URL** — must be a public HTTPS link to your policy.

### E4. Internal testing track

1. Left menu: **Testing** → **Internal testing**  
2. **Create new release**  
3. **Upload** your **`.aab`** from Part D  
4. **Release name** — e.g. `1.0.0 (1)`  
5. **Review release** → **Start rollout to Internal testing**

### E5. Add testers

1. Still under **Internal testing**, open **Testers** tab  
2. Create an **email list** (comma-separated Gmail addresses) → **Save**  
3. Copy the **opt-in URL** and send it to testers  
4. Testers open the link → accept → install **Meet Map** from Play (it may take a short time to appear)

---

## Part F — After Android internal test (your “Step 2”)

1. Use the app daily on real phones: keyboard, scrolling, map, posting, photos.  
2. Fix issues in the **web** code (`src/…`).  
3. Repeat **Part B** (`npm run cap:sync`) and rebuild/sign a new **AAB** if needed.  
4. Upload the new AAB as a **new release** in the same **Internal testing** track.

---

## Part G — iPhone / TestFlight (Mac + Xcode only)

### G1. Install CocoaPods deps (once per clone / after pulling `ios/`)

```bash
cd ios/App
pod install
cd ../..
```

### G2. Open Xcode

```bash
npm run cap:open:ios
```

Or open **`ios/App/App.xcworkspace`** (use **.xcworkspace**, not `.xcodeproj`, after CocoaPods).

### G3. Signing

1. Click the **App** project in the left sidebar → target **App** → **Signing & Capabilities**  
2. **Team:** select your Apple Developer team  
3. **Bundle Identifier:** should match Capacitor, e.g. `com.meetmap.app` (change in Xcode **and** in `capacitor.config.json` if you rebrand)

### G4. Run on a real iPhone (optional)

1. Plug in iPhone, trust computer  
2. Select your iPhone as run destination  
3. Click **Run** ▶

### G5. Archive for TestFlight

1. Menu **Product** → **Archive**  
2. When the Organizer opens, **Distribute App** → **App Store Connect** → follow prompts  
3. In https://appstoreconnect.apple.com → your app → **TestFlight**  
4. Wait for processing → add **Internal testers** → they install via **TestFlight** app

### G6. Sync web changes to iOS

After any web change:

```bash
npm run cap:sync
```

Then in Xcode: **Product** → **Archive** again for a new build.

---

## Part H — Public launch (both stores)

### Google Play (production)

1. Play Console → **Production** (or **Open testing** first)  
2. Create release → upload latest **AAB**  
3. Complete **Countries**, **App content** if still pending  
4. **Submit for review**

### Apple (App Store)

1. App Store Connect → **App Store** tab → prepare **screenshots**, **description**, **privacy**  
2. Select a **TestFlight build** → **Submit for Review**  
3. Answer **encryption**, **export compliance**, and **content** questions truthfully

---

## Command summary (copy-paste)

| When | Command |
|------|--------|
| After editing web code, before native build | `npm run cap:sync` |
| Open Android Studio | `npm run cap:open:android` |
| Open Xcode (Mac) | `npm run cap:open:ios` |
| iOS pods (Mac, after git pull) | `cd ios/App` then `pod install` |

---

## Troubleshooting (specific)

| Problem | What to check |
|---------|----------------|
| White screen in app | Run `npm run cap:sync` again; confirm `dist/` has files; check **Chrome remote debugging** (`chrome://inspect` → WebView) for JS errors |
| Flyer / AI “network error” | `VITE_APP_ORIGIN` in `.env` during build; must be **exact** production URL; redeploy server if CORS blocks WebView |
| Map blank | `VITE_MAPBOX_TOKEN` in `.env` at build time; Mapbox token URL restrictions |
| Play Console rejects AAB | Increase `versionCode` in `android/app/build.gradle` |
| iOS won’t archive | Run `pod install` in `ios/App`; open **.xcworkspace** |

---

## Files that matter

| File | Purpose |
|------|--------|
| `capacitor.config.json` | App id `com.meetmap.app`, name, `webDir: dist` |
| `.env` | `VITE_APP_ORIGIN`, Supabase, Mapbox (**not** committed if `.gitignore`d) |
| `android/app/build.gradle` | `applicationId`, `versionCode`, `versionName` |
| `vite.config.js` | `base: './'` for Capacitor |

If you tell me your **exact production URL** (domain only), I can give you a one-line example `.env` block to paste (without secrets).

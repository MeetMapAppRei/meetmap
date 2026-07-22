# Mobile release notes

## 1.1.0 (Android versionCode 44) — Capacitor 8 / API 36

**Google Play "What's new" (paste):**

```
• Updated to Android 16 (API 36) for Google Play target API requirements
• Capacitor 8 native shell upgrade
• Bug fixes and stability improvements
```

### What to test (Android versionCode 44)

1. **Cold start** — App opens to map/list without a white screen.
2. **Near Me** — Allow location; nearby events load (Cap 8 geolocation timeout behavior).
3. **Back button** — Hardware/gesture back closes overlays then exits as before.
4. **Push prompt** — Notification permission still works on Android 13+.
5. **Edge-to-edge** — Headers and bottom nav are not clipped under system bars.

### Native / tooling notes

- Capacitor **8.x**; Android `minSdk` **24**, `compileSdk`/`targetSdk` **36**
- Requires **Node.js 22+**, **JDK 21** (Android Studio JBR), Android SDK **36**
- iOS deployment target **15.0** (run `pod install` on Mac after pull)
- **Mac / iOS build:** after pull, say **I'm on my Mac** or run `npm run mac:arrival` (pull + `npm ci` + `cap:sync`). Needs **Xcode 26+**. Then `npm run cap:open:ios`, archive/upload from Xcode.

---

## 1.1.0 (Android versionCode 43 / iOS build 9)

**Google Play / App Store "What's new" (paste):**

```
• Event cards now show city and state with the street address so you can tell where a meet is at a glance
• Bug fixes and stability improvements
```

### What to test (Android versionCode 43 / iOS build 9)

1. **Street-only address** — Open LIST and find an event whose street line has no city (e.g. “152 Rt. 46”); the card should also show the town and state (e.g. Rockaway, NJ).
2. **Full address** — Confirm events that already include city/state in the address still look correct (no duplicated city line).
3. **Event detail** — Open that same event; the detail screen address line should match the card.
4. **Directions** — Directions from the card still open the preferred maps app to the right place.

---

## 1.1.0 (Android versionCode 42)

**Google Play "What's new" (paste):**

```
• Fixed Near Me on Android and improved location filtering
• Filter buttons now stay visible without horizontal scrolling
• Near Me radius slider can be closed while keeping Near Me active
• Event card Previous/Next navigation now updates the full event card
• Improved map layout so pins no longer overlap a blank bottom area
```

### What to test (Android versionCode 42)

1. **Near Me** — Tap Near Me, allow location, confirm nearby events load and the radius slider appears.
2. **Radius slider** — Close the slider with × and confirm Near Me stays active; tap Near Me again to reopen the slider.
3. **Filters** — Confirm All Events, This Week, event type, sort, Past Events, and Saved are visible without horizontal scrolling.
4. **Event detail navigation** — Open an event and tap Next/Previous; image, title, details, and position should all change.
5. **Map layout** — Open Map and confirm pins stay over the map, with no blank white strip under them.

---

## 1.1.0 (Android versionCode 38)

**Google Play "What's new" (paste):**

```
• Improved mobile layout so Meet Map uses the full screen width more reliably
• Added adjustable Near Me radius for broader or tighter local searches
• Fixed event cards opening from push notifications
• Improved flyer import reliability
• Bug fixes and stability improvements
```

### What to test (Android versionCode 38)

1. **Mobile layout** — Open the app on Android and confirm the map, bottom nav, forms, and event detail fill the screen without side gaps.
2. **Near Me radius** — Use Near Me and change the radius; nearby events should update according to the selected range.
3. **Push notification tap** — Tap a saved-event notification; the app should open the matching event card.
4. **Flyer import** — Import an event flyer and confirm the extracted meet details populate correctly.
5. **Regression: posting** — Post a meet with and without a photo; both should save and appear on the map.
6. **Regression: directions** — Settings → directions app preference should still open the chosen maps app from an event.

---

## 1.1.0 (iOS build 8)

**App Store / TestFlight “What’s New” (paste):**

```
• Fixed: posting a meet without a photo no longer fails with a database error
• Clearer messages when required fields are missing (no more developer error text)
• Bug fixes and stability improvements
```

### What to test (build 8)

1. **Post meet without photo** — Sign in, open Post a Meet, fill required fields (name, date, city, address), do **not** add a photo, tap **Drop the Pin**. Event should save and appear on the map.
2. **Missing field validation** — Leave Date empty and tap **Drop the Pin**. Should highlight Date, scroll to it, and say “Please fill in Date before posting” (not a database/SQL error).
3. **Post meet with photo** — Same flow with an event photo attached; confirm upload and pin both work.
4. **Regression: map + detail** — After posting, map should fly to the new pin and open the event card.
5. **Regression: Near Me / location** — Map still centers on your area when permission is granted.
6. **Regression: directions** — Settings → directions app preference still opens the chosen maps app from an event.

---

## 1.1.0 (iOS build 4 / Android versionCode 36)

**App Store / TestFlight “What’s New” (paste):**

```
• iOS: Near Me and map location now work — the app asks for permission and centers on your area
• iOS: Alerts (push notifications) — enable reminders for saved events on iPhone and iPad
• After posting an event, the map flies to your new pin and opens the event card
• Search: clearer message when filters (like This Week) hide matching events
• Settings: choose Apple Maps or Google Maps for Directions (saved on your device)
• Bug fixes and stability improvements
```

### iOS (1.1.0 build 4)

- Added location permission and native geolocation for Near Me and map centering
- Added push notification support (requires Push capability in Xcode + APNs secrets on server)
- Added camera and photo library permissions for event photo uploads
- Post-success flow: switch to map, fly to pin, open event detail, clear restrictive filters
- Directions app preference (Apple Maps vs Google Maps) in Settings

### Android (1.1.0 versionCode 36)

- Post-success flow: switch to map, fly to pin, open event detail, clear restrictive filters
- Search empty state explains when client filters hide results
- Directions app preference (Apple Maps vs Google Maps) in Settings

### Server / ops (if shipping iOS alerts)

Deploy updated `saved-event-push` and set Supabase secrets: `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`, `APNS_ENV` (`sandbox` for Xcode debug, `production` for TestFlight).

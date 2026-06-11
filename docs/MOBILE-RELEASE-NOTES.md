# Mobile release notes

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

# GPS Logger — App Type Analysis

**Target devices:**
- Motorola Edge 60 Pro — Android 17
- Samsung Galaxy S20 FE — Android 13
- iPhone / iPad — iOS / iPadOS 16.4+ (optional)

**Question:** Can this be built as an HTML/TypeScript app, delivered from a web page, and keep logging with the screen off?

---

## Summary

| Requirement | Pure web app (PWA) | Capacitor-wrapped APK |
|---|---|---|
| Written in HTML/TS | Yes | Yes (same codebase) |
| Delivered from a web page | Yes (install prompt) | Yes (side-loaded APK) |
| Logs while app is in foreground | Yes | Yes |
| Logs with screen off / app backgrounded | **No** | Yes (foreground service) |
| Build toolchain needed | None (any static host) | Android Studio / JDK or CI |
| Runs on iPhone / iPad | Yes (Add to Home Screen) | Yes, but needs a Mac + Apple Developer account |
| Installable from a web page on iOS | Yes | **No** — Apple does not permit side-loading |

**Recommendation:** build the PWA first. It is the only option that covers all three devices from one URL with no toolchain, and the Capacitor wrapper reuses the same source if screen-off recording turns out to be required.

---

## 0. Device compatibility

One build serves both phones — nothing needs to be forked. The differences are in platform policy and vendor battery management, not in the app code.

| | Motorola Edge 60 Pro (Android 17) | Galaxy S20 FE (Android 13 / API 33) | iPhone / iPad (iOS 16.4+) |
|---|---|---|---|
| PWA install | Yes (Chrome install prompt) | Yes (Chrome install prompt) | Yes — Share → **Add to Home Screen**, manual, Safari only |
| `watchPosition` over HTTPS | Yes | Yes | Yes |
| Screen Wake Lock API | Yes | Yes (Chrome 84+) | Yes (Safari 16.4+) |
| IndexedDB storage / export | Yes | Yes | Yes, with eviction caveats |
| Native wrapper installable from your web page | Yes (APK side-load) | Yes (APK side-load) | **No** |
| Background logging with screen off | Native build only | Native build only | Native build only |
| GNSS hardware | GPS, GLONASS, Galileo, BeiDou | GPS, GLONASS, Galileo, BeiDou | iPhone: yes. **iPad Wi-Fi-only: no GNSS chip** |

For the web APIs, the browser version matters rather than the OS version. Both Android phones run a current Chrome, and Android 13 is far above anything the PWA needs. iOS needs 16.4 or newer for the wake lock; everything else works further back.

### Android 13 specifics (S20 FE)

- **`POST_NOTIFICATIONS` is a runtime permission from Android 13 onward.** If the native build is ever made, the app must request it explicitly — otherwise the foreground-service notification is suppressed, and on some OEM builds the service is then treated as unjustified and killed. This is the single most common cause of "it works on my other phone but not this one".
- `FOREGROUND_SERVICE_LOCATION` is only *enforced* from Android 14. Declaring it in the manifest is harmless on 13 — it is simply ignored — so one manifest covers both devices.
- Precise/approximate location toggle exists (since Android 12); the user must choose **Precise** or tracks will be useless.

### Samsung battery management — the real risk

Samsung's One UI is considerably more aggressive than Motorola's stock-like Android at killing background work. Expect to configure, on the S20 FE:

- Settings → Battery → Background usage limits → **remove the app from "Sleeping apps" / "Deep sleeping apps"**.
- Disable **"Put unused apps to sleep"** (or at least exempt this app).
- Settings → Apps → *app* → Battery → **Unrestricted**.
- For the PWA specifically, these settings apply to **Chrome**, not to the installed web app — a PWA runs inside Chrome's process, so Chrome itself must not be put to sleep.

None of this rescues the PWA from screen-off suspension (see §2) — it only prevents the native build from being killed, and keeps the wake-lock PWA alive while the screen is on.

### iOS / iPadOS specifics

The same PWA runs on iPhone and iPad with no code changes, but several platform behaviours differ enough to plan around:

- **Installation is manual.** iOS has no install prompt and no `beforeinstallprompt` event. The user must tap Share → *Add to Home Screen*. The app should detect iOS Safari and show a short illustrated hint instead of an install button.
- **Add to Home Screen matters more than on Android.** A home-screen app gets its own storage container and escapes Safari's 7-day eviction of script-writable storage for unused sites. A tab-only install can silently lose its IndexedDB track history. Export early, export often — and say so in the UI.
- **Permission prompt is per-session.** Safari re-asks for location more readily than Chrome, and "Allow Once" is the default-looking choice. Settings → Privacy → Location Services → Safari Websites → **While Using the App**, plus **Precise Location** on, is the configuration that works.
- **Backgrounding is harsher than Android.** iOS suspends a web app the instant it is backgrounded or the screen locks, and may purge it from memory entirely — on return, the app restarts rather than resumes. Any in-memory buffer must be flushed to IndexedDB on every point and on `visibilitychange`, never only on stop.
- **Wake lock works** (Safari 16.4+) and is the only way to log a continuous track from the web app, exactly as on Android.
- **iPad hardware caveat:** Wi-Fi-only iPads have **no GNSS receiver**. They position by Wi-Fi/IP lookup only — accuracy of tens to hundreds of metres, no speed or heading, useless for a track log. Cellular iPads do have GNSS and work like an iPhone. The app should surface `coords.accuracy` prominently so this is obvious rather than mysterious.
- **Low Power Mode** throttles location updates noticeably; worth detecting indirectly via degraded update frequency and warning the user.

---

## 1. What works in a plain web app

- `navigator.geolocation.watchPosition()` works in Chrome on Android over HTTPS.
  Provides: latitude, longitude, altitude, accuracy, altitudeAccuracy, speed, heading, timestamp.
- Persist points in **IndexedDB**; export as GPX, GeoJSON, or CSV.
- Serve from any HTTPS host (GitHub Pages is sufficient).
- Add a web app manifest + service worker → Chrome offers "Install app" / Add to Home Screen.
  Result: full-screen launch, own icon, works offline.

The "get it from a web page and run it on the phone" requirement is fully met this way.

## 2. The background limitation

There is **no background geolocation API on the web platform**. Once the tab is hidden or the screen is off:

- Chrome freezes timers and stops delivering `watchPosition` callbacks — typically within seconds to a few minutes.
- Service workers cannot hold a location watch; they are event-driven and get terminated.
- Periodic Background Sync is Chrome-only, has a minimum interval of roughly 12 hours, and cannot produce a continuous track.
- Android Doze and app standby will suspend the process regardless of what the page does.

### Partial workarounds (all unreliable for unattended logging)

- **Screen Wake Lock API** — `navigator.wakeLock.request('screen')` keeps the screen on so logging continues.
  Works, but the display stays lit and battery drain is significant. Acceptable for an activity with the phone mounted/visible; not for pocket logging.
- **Silent audio loop** to keep the page "active" — increasingly blocked by browsers. Do not rely on it.

## 3. Native wrapper option (for screen-off logging)

Wrap the same HTML/TS codebase in **Capacitor** and build an APK. All web code is reused; a native plugin runs an Android **foreground service**, which carries a persistent notification and is exempt from Doze.

### Android

Plugin candidates:
- `@capacitor-community/background-geolocation` (free)
- `@transistorsoft/capacitor-background-geolocation` (commercial, more robust)

Requirements and caveats:
- Manifest permissions: `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`.
  One manifest covers both phones: `FOREGROUND_SERVICE_LOCATION` is ignored on Android 13 and enforced on 14+; `POST_NOTIFICATIONS` must be requested at runtime on 13+.
- On recent Android versions the user must grant **"Allow all the time"** manually via system settings — it cannot be granted from the initial runtime prompt.
- A persistent notification is mandatory while tracking.
- Battery optimization exemption may need to be requested for long sessions — and on the Samsung device, the app must additionally be taken off the "Sleeping apps" list (see §0).
- `minSdk` for current Capacitor is 23, so Android 13 is comfortably supported.

Distribution:
- The APK can be hosted on your own web page and side-loaded. Android will ask the user to allow installs from that source (per-app "Install unknown apps" permission). Motorola does not block this.
- Building requires Android Studio / JDK locally, or a GitHub Actions runner producing the APK.

### iOS / iPadOS

Technically the *better* platform for background tracking, and the harder one to distribute to.

- The same Capacitor project builds for iOS; the background plugins listed above support both platforms behind one API.
- Background location on iOS is genuinely reliable once configured: `UIBackgroundModes: location` in `Info.plist`, `allowsBackgroundLocationUpdates`, and **Always** authorization. No persistent notification is required — iOS shows a blue status-bar indicator instead. Tracking survives screen lock and app backgrounding properly.
- `NSLocationAlwaysAndWhenInUseUsageDescription` and `NSLocationWhenInUseUsageDescription` must both be present with honest text, or the app is rejected / the prompt never appears.

Distribution is the blocker:

| Route | Cost | Works from your web page? | Notes |
|---|---|---|---|
| Xcode + free Apple ID | Free | No | Sideload to your own device only; **app expires after 7 days** and must be re-signed. Workable but tedious. |
| Apple Developer Program → TestFlight | $99/year | No (invite link, via TestFlight app) | 90-day builds, up to 100 internal testers. The practical route for personal use. |
| Apple Developer Program → App Store | $99/year | No | Full review process for an app only you will use. |
| EU web distribution (iOS 17.4+) | $99/year | Yes, in theory | Requires Developer Program membership, notarization, and a €1M letter of credit or two years of membership. Not realistic here. |

- A Mac is required to build and sign, or a cloud-Mac CI runner (GitHub Actions `macos-*` runners can do this).
- **Conclusion:** "get it from a web page" is achievable on Android and effectively impossible on iOS. On Apple devices the PWA is the realistic delivery mechanism, which means accepting the screen-on limitation there.

## 4. Suggested path

1. **Phase 1 — PWA (covers all three platforms)**
   - TypeScript + Vite, static output.
   - `watchPosition` with configurable accuracy/interval, IndexedDB storage, live stats, map preview.
   - Write each fix to IndexedDB immediately and flush on `visibilitychange` — required for iOS, good hygiene everywhere.
   - Screen Wake Lock toggle so tracking survives an idle screen.
   - GPX/GeoJSON/CSV export, plus Web Share on mobile.
   - Platform-aware install hint: Chrome install prompt on Android, Share → Add to Home Screen instructions on iOS.
   - Accuracy readout surfaced prominently (catches the Wi-Fi-only iPad case).
   - Hosted on GitHub Pages (HTTPS), installable on every device from the same URL.
2. **Phase 2 — optional Capacitor wrapper, Android only**
   - Add `@capacitor/android`, swap the geolocation layer for the background plugin behind the same interface.
   - Publish the APK next to the web build.
3. **Phase 3 — optional iOS native build**
   - Only worth doing if screen-off logging is needed on Apple devices *and* a Mac plus a $99/year developer account are acceptable. Otherwise iOS stays on the PWA.

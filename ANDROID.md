# Android build

The APK wraps the same web app in Capacitor and adds a foreground service,
so recording continues with the screen off and the phone in a pocket
(REQ-PLAT-4, REQ-BG-7…14). This is the build intended for real rides; the
web build cannot do this and never will.

---

## Building in GitHub Actions (no JDK needed locally)

The runner already has a JDK and the Android SDK, so nothing has to be
installed on the development machine. This is the recommended route.

1. GitHub → **Actions** → **Build Android APK** → **Run workflow**
2. Leave *Publish the APK as a GitHub release* ticked
3. When it finishes, open **Releases** and tap the `.apk` **on the phone**

The first install asks permission to install from your browser — allow it for
Chrome, then tap the file again.

Releases give a direct download link. Workflow *artifacts* are zipped and
require a GitHub login, which is awkward on a phone; use a release unless you
only wanted the build to be checked.

Debug builds are signed with the standard debug keystore, so they install
without any signing setup. That is fine for personal side-loading. For wider
distribution, sign a release build with your own keystore — and do not commit
it.

## Building locally (needs a JDK)

Only if you have, or can install, the toolchain:

- **JDK 21** (Android Gradle Plugin 8.x)
- **Android Studio** with the Android SDK, platform 36 and build-tools
- A phone with **USB debugging** enabled

```bash
npm run cap:sync     # build the web app and copy it into android/
npm run cap:open     # open the project in Android Studio
```

Then Run ▶ in Android Studio, or from the command line:

```bash
cd android
./gradlew assembleDebug
# APK at android/app/build/outputs/apk/debug/app-debug.apk
```

Re-run `npm run cap:sync` after every web change — the APK serves a copy of
`dist/`, not the live source.

### Without admin rights

A JDK does not strictly need an installer: the Temurin **.zip** build unpacks
anywhere and works with `JAVA_HOME` pointed at it. The Android SDK likewise
comes as a `commandlinetools` zip, from which `sdkmanager` can fetch
`platforms;android-36` and `build-tools` into a user folder. Whether that is
permitted on a managed machine is a question for whoever manages it — the CI
route above avoids it entirely.

---

## Permissions the user must grant

Three separate things, and two of them cannot be granted from the normal
runtime prompt:

| Permission | How it is granted |
|---|---|
| Location (precise) | Runtime prompt on first recording |
| **Allow all the time** | **System settings only** — Android will not offer it in a prompt |
| Notifications | Runtime prompt on Android 13+ |

The app shows a **Permit Location** button that opens the system settings page
when these are missing (REQ-PERM-2).

**Precise, not approximate.** Android 12+ lets the user grant approximate
location. The manifest declares `ACCESS_COARSE_LOCATION` so the app still
starts in that case, but tracks will be useless until precise is granted.

## Samsung Galaxy S20 FE

One UI is considerably more aggressive than stock Android about killing
background work. On the S20 FE specifically (REQ-BG-14):

- Settings → Battery → Background usage limits → remove **GPS Logger** from
  *Sleeping apps* and *Deep sleeping apps*
- Disable **Put unused apps to sleep**, or exempt this app
- Settings → Apps → GPS Logger → Battery → **Unrestricted**

Without these, a long ride can be cut short with no error anywhere — the
recording simply stops.

---

## Known limitation: REQ-BG-11 is not fully met

> *REQ-BG-11 — Recording shall continue without loss of positions if the user
> interface is destroyed by the operating system while the service is still
> running.*

`@capacitor-community/background-geolocation` delivers each position to a
**JavaScript callback**. The foreground service and the WebView live or die
together: if Android reclaims the WebView, positions stop being recorded.
`android.useLegacyBridge` (set in `capacitor.config.ts`) is what keeps the
bridge alive past the five-minute mark, and is not optional.

What happens in practice:

| Situation | Behaviour |
|---|---|
| App backgrounded, screen off | Records normally — the intended case |
| App swiped away or killed by the OS | Service stops; the log is recovered on next launch and marked **unfinished**, keeping every position up to that point (REQ-REC-15…17) |

So a ride is never silently lost — it is truncated and clearly labelled. That
is a materially weaker guarantee than REQ-BG-11 asks for.

### What to measure, and what to do about it

This is the central question the Phase 0 spike exists to answer: **does Android
actually reclaim the WebView during a two-hour ride with the foreground service
running, on these two phones?**

- If it does not, this plugin is sufficient and nothing needs to change.
- If it does, swap to `@transistorsoft/capacitor-background-geolocation`, which
  keeps its own native SQLite store and a headless task, so recording survives
  the UI entirely. Note its Android release builds require a paid licence.

The swap is contained: `LocationSource` (REQ-PLAT-5) is the only interface that
would change, and `core/` and `data/` are untouched by it. That abstraction was
put in specifically for this decision.

---

## Verifying a build

Worth checking on both phones before trusting a ride to it:

1. Start a recording, lock the screen, put the phone in a pocket for 30 minutes
2. Confirm the notification stays present throughout
3. Reopen the app — statistics should be up to date, not frozen at lock time
   (REQ-BG-12)
4. Stop, then check the point count is roughly `duration in seconds`
5. Force-stop the app mid-recording and relaunch — the log should appear as
   **unfinished** with its positions intact
6. Export and share to Google Drive

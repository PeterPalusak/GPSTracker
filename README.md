# GPS Logger

Records GPS tracks while driving, riding a motorbike or cycling. Runs as an
installable web app, and later as an Android APK wrapping the same code.

- [Requirements.md](Requirements.md) — what it does
- [Requirements_Analysis.md](Requirements_Analysis.md) — the decisions behind it
- [Implementation_Plan.md](Implementation_Plan.md) — how it is being built
- [AppType_Analysis.md](AppType_Analysis.md) — why PWA first, APK second

## Running it

```bash
npm install
npm run dev          # development server
npm run dev -- --host  # also reachable from a phone on the same network
```

Geolocation needs a secure context: `localhost` works, any other host needs
HTTPS.

```bash
npm test             # 315 tests
npm run typecheck
npm run build        # static output in dist/
npm run preview      # serve the built output
```

## Installing on a phone

**Android (Chrome).** Open the deployed URL and accept the install prompt, or
use ⋮ → *Install app*.

**iOS (Safari).** Share → *Add to Home Screen*. There is no install prompt on
iOS; the app shows instructions instead. Installing matters more here than on
Android — a home-screen app escapes Safari's seven-day eviction of storage for
unused sites, which would otherwise delete recorded rides.

## What the web build cannot do

**It cannot record with the screen off.** A browser stops delivering position
updates seconds after the screen switches off, and no web API changes that. The
app holds a screen wake lock while recording, so the screen stays on and
logging continues — fine for a bike ride with the phone mounted, not for a ride
with the phone in a pocket.

Screen-off recording needs the Android APK, which uses a foreground service.
That is the intended way to use this; the web build is for development and
testing. See [AppType_Analysis.md](AppType_Analysis.md) §2.

## Deploying

The build is static and uses relative asset paths, so it can be served from a
subfolder — GitHub Pages included.

```bash
npm run build
# publish the contents of dist/
```

HTTPS is required: geolocation, the service worker and the wake lock all need a
secure context.

## Notes

- **Rides are stored on the device only.** Clearing site data, uninstalling, or
  losing the phone loses anything not exported. Export is a share sheet, so a
  file can go to Google Drive or anywhere else installed.
- **Map tiles are deliberately not cached.** The OpenStreetMap tile usage policy
  prohibits bulk downloading, so the service worker precaches the app shell
  only, and the Map tab is the one part that needs a network connection.
- `npm audit` reports moderate advisories in `workbox-build`'s dependencies.
  These are build-time only and nothing from them reaches the browser.

## Regenerating the icons

```bash
node scripts/generate-icons.mjs
```

Writes the PNGs in `public/` from pure geometry — no image library involved.
Only needed if the mark changes; the output is committed.

# GPS Logger — Requirements Analysis

**Reviews:** [Requirements.md](Requirements.md) draft 1
**Date:** 2026-11-16
**Related:** [AppType_Analysis.md](AppType_Analysis.md)

---

## Verdict

The requirements are buildable and the overall shape is sound: local-first recorder, four-button state machine, log list, settings, statistics panel. Nothing here needs a server, an account, or a map SDK licence.

All three blockers are settled (B1, B2, B3), and as of draft 2 every trap, ambiguity and gap has a decision recorded in §8.

The deliberate position taken across T1–T3 and REQ-GEN-3 is that **this app is a recorder, not a cleaner**: raw fixes in, raw statistics out, with noise removed later in other tools. That is a coherent and defensible scope, and it removes most of the correctness risk from the build. §8 notes where it shows through to the user so the numbers are not a surprise.

One consequence of the G9 decision deserves emphasis and is now recorded as REQ-PLAT-4: the intended usage — **screen off, phone in pocket** — is impossible in the PWA by any means. The PWA is a development and testing stage; real rides start at the APK.

| Severity | Status | Meaning |
|---|---|---|
| **Blocker** | 3 — all resolved | Contradictory or unimplementable as written; needs a decision |
| **Trap** | 4 — 1 resolved, 3 accepted | Implementable as written, but the result will be wrong |
| **Ambiguity** | 8 — 6 resolved, 2 accepted | Needs a decision, any reasonable choice works |
| **Gap** | 9 — 7 addressed, 2 accepted | Not mentioned, will be needed |

**All items are now closed.** Requirements draft 2 reflects every decision; see the decision log in §8. Three traps and three gaps were deliberately accepted rather than fixed — §8 records what each one means in practice, so the consequences are visible rather than forgotten.

---

## 1. Blockers

### B1 — Start is enabled while paused (REQ-REC-10) — ✅ RESOLVED

**Resolution (2026-11-16):** while paused, Start is enabled and acts as an alias for Re-Start — it resumes logging into the same log. Start never creates a new log while a log is open. Recorded as REQ-REC-10a.

This is the safe outcome. The risk in this requirement was an interpretation where Start began a *new* log, so a single mis-tap during a fuel stop would discard a two-hour ride. That interpretation is now explicitly excluded, and no confirmation dialog is needed.

Two minor consequences for implementation:

- Start and Re-Start become the same action on the same state. Implement one `resume()` transition that both buttons dispatch, rather than duplicating logic — otherwise they will drift apart.
- After resuming via Start, Start immediately becomes disabled-and-highlighted again per REQ-REC-11, so the button the user just pressed goes dead under their finger. Worth a brief visual transition so this reads as intentional. Pressing Re-Start instead keeps the touch target alive, which is the better path for the user; consider making Re-Start the visually dominant control while paused.

### B2 — 20 Hz sampling is not achievable (REQ-SET-5) — ✅ RESOLVED

**Resolution (2026-11-16):** the frequency setting is removed entirely. The app records at whatever rate the device delivers. Recorded as REQ-SET-3 / REQ-SET-4; REQ-SET-5 withdrawn.

This is the right call and it is also the *best* behaviour, not merely the simplest — see the analysis below and the sampling conclusion in [AppType_Analysis.md](AppType_Analysis.md): across a 10–200 km/h range there is no spare sampling margin to discard, so "keep every fix" is what a correct implementation would have arrived at anyway. Secondary benefits:

- The Settings screen drops to two items (units, export format), which is a reasonable size for one screen.
- No setting means no way for a user to silently ruin their own track by selecting 0.5 Hz before a motorway run.
- Battery cost is unaffected: the receiver is powered continuously regardless of how many fixes you keep.

Worth retaining in the UI: a small read-only indicator of the observed fix rate ("1.0 Hz") on the main or settings screen. It costs nothing, confirms the receiver is alive, and makes a degraded signal visible.

The original analysis follows for the record.

---

Consumer GNSS receivers in phones produce a fix at **1 Hz**. This is a hardware and OS limit, not a browser one:

- **Web Geolocation API:** no rate control exists at all. `watchPosition` has only `enableHighAccuracy`, `timeout` and `maximumAge`. You receive fixes at whatever rate the OS emits — ~1 Hz.
- **Android native:** `FusedLocationProvider` accepts an interval, but will not synthesise fixes the chip does not produce. Sub-second rates require raw `GnssMeasurement` callbacks and are not available on all devices.
- **iOS native:** `CLLocationManager` has no interval parameter whatsoever — only `distanceFilter` and `desiredAccuracy`.

A setting of 5 Hz or 20 Hz would silently do nothing, which is worse than not offering it: the user believes they changed something.

Also note the low end: 0.5 Hz (one fix per 2 s) at 200 km/h is **111 m between points**, which visibly cuts corners and understates distance.

**Recommendation:** keep the setting, change its meaning and range. Label it *"Recording rate"*, range **0.2 Hz – 1 Hz**, default 1 Hz, implemented as a throttle that *discards* fixes — the only direction that is physically possible. Display the actual observed rate next to it ("device is delivering 1.0 Hz") so the limit is visible rather than mysterious. If a >1 Hz option is kept for future hardware, it must be clamped and labelled as a maximum, not a guarantee.

This also contradicts the sampling conclusion in [AppType_Analysis.md](AppType_Analysis.md): for the 10–200 km/h range, the correct behaviour is to **keep every fix** and simplify only at export. A user-facing rate control is therefore a convenience for battery/storage, not a quality control — and should default to "every fix".

### B3 — "Save the log into a file" is not possible in the PWA (REQ-REC-5, REQ-REC-13) — ✅ RESOLVED

**Resolution (2026-11-16):** storage and file production are separated. Logs live in IndexedDB (new §7, REQ-STO-1…6); files are produced only by Export, which offers *Share file with…* via the OS share sheet, with Google Drive and similar cloud destinations reached that way (new §4.3, REQ-EXP-1…7). REQ-REC-5 and REQ-REC-13 amended accordingly.

**Why the share sheet is the right mechanism.** The alternative — integrating the Google Drive REST API directly — would require an OAuth client, a Google Cloud project, a consent screen, and because Drive file scopes are restricted, an annual third-party security assessment for a published app. That is a disproportionate amount of work and ongoing obligation for a personal track logger, and it would bind the app to one provider. Handing the file to the share sheet gets Drive, OneDrive, Dropbox, email, Files/iCloud and everything else the user has installed, for one API call and no credentials. REQ-EXP-5 records this as a deliberate constraint rather than an omission.

**Platform support for `navigator.share({ files })`:**

| Target | Support | Notes |
|---|---|---|
| Chrome on Android | Yes | Full share sheet; Google Drive appears if the Drive app is installed |
| Safari on iOS 15+ | Yes | iOS share sheet; Files → iCloud Drive, plus the Drive app if installed |
| Capacitor APK | Yes | `@capacitor/filesystem` writes the file, `@capacitor/share` shares the URI |
| Desktop browsers | Partial | Falls back to download — covered by REQ-EXP-6 |

**Implementation notes:**

- Feature-detect with `navigator.canShare({ files: [f] })`, not `navigator.share` alone — the files capability is separate from the basic share capability and is the one that matters here.
- The call must happen inside a user-gesture handler. Generating a large GPX asynchronously and *then* calling `share()` can lose the gesture; build the Blob first, or keep the generation synchronous within the handler.
- Set a correct MIME type (`application/gpx+xml`, `application/vnd.google-earth.kml+xml`). An incorrect or generic type causes some targets to refuse the file or save it with the wrong extension.
- The share sheet gives no completion signal — you cannot know whether the user actually saved to Drive or dismissed the sheet. Do not mark a log "backed up" on the strength of a share action.

**Residual risk, unchanged by this resolution:** local storage is not a backup. Clearing site data, uninstalling the app, or losing the phone loses every log that has not been exported. The share flow makes backup *possible*, not automatic. Worth considering a gentle post-ride prompt to export, or a visible "never exported" marker on logs in the list — neither is currently required.

The original analysis follows for the record.

---

A web app cannot silently write a file to device storage. The File System Access API (`showSaveFilePicker`) is **desktop-only** — unavailable in Chrome on Android and in Safari on iOS. The only ways a PWA produces a real file are a user-initiated download or the Web Share API, both of which require a tap per file.

This makes REQ-REC-13 ("any file already created shall be deleted") unimplementable too: a web app cannot delete a file it handed to the OS download manager.

**Recommendation:** split the concept.

| Concern | PWA | Capacitor APK |
|---|---|---|
| Store of record | IndexedDB | IndexedDB (unchanged) |
| Stop = "save" | Commit the record in IndexedDB, mark as finalised | Same |
| Export | Download / Web Share, user-initiated | `@capacitor/filesystem` writes to Documents, plus share sheet |
| Cancel = "delete file" | Delete the IndexedDB record | Delete record; no file exists yet |

Nothing should be written to the filesystem until Export is pressed. Then Cancel has nothing to clean up and the requirement is satisfied in spirit.

---

## 2. Traps — statistics that will be wrong

These are all implementable exactly as written, and all four will produce numbers the user can see are nonsense.

### T1 — Gained / dropped height (REQ-STAT-12, REQ-STAT-13)

**This is the single most likely visible bug in the app.** GNSS altitude has ±10–20 m noise with a slow random walk. Summing every positive delta over a 2-hour flat drive yields several hundred metres of phantom climb — commonly 300–800 m on genuinely flat terrain.

Required mitigation:
- Smooth altitude first (moving median over ~15 s, or a light Kalman filter).
- Apply hysteresis: only commit a climb once altitude has risen ≥ 5 m above the last committed extreme, then reset the reference. Never sum raw deltas.
- Discard altitude entirely when `altitudeAccuracy > 15 m`.
- Expect ±10–15% error versus a barometric device even after this. The web API exposes no barometer.

### T2 — Maximum speed (REQ-STAT-8)

A single bad fix after a tunnel or in an urban canyon yields an implied 300+ km/h. Max speed is the statistic users check first, so a wrong value destroys confidence in the whole panel.

Required mitigation: use `coords.speed` (Doppler-derived, far better than differencing positions), reject fixes with `accuracy > 30 m`, reject implied speeds > 90 m/s, and consider reporting a 1-second-smoothed maximum rather than a raw sample peak.

### T3 — Total distance inflated while stationary (REQ-STAT-4)

At traffic lights and fuel stops the position random-walks. Naively summing point-to-point distance adds 1–3 km per stationary hour.

Required mitigation: a stationary deadband — do not accumulate distance while `speed < 0.5 m/s`.

### T4 — Undefined averages (REQ-STAT-7, REQ-STAT-9)

"Average speed" and "average moving speed" are only meaningful once their denominators are fixed, and "overall time" is ambiguous while Pause exists.

**Recommended definitions** (these should be added to the requirements):

| Metric | Definition |
|---|---|
| Overall time | Wall-clock from Start to Stop, **excluding** paused intervals |
| Moving time | Sum of intervals where speed ≥ 0.5 m/s |
| Average speed | Total distance ÷ overall time |
| Average moving speed | Total distance ÷ moving time |
| Moving threshold | 0.5 m/s (1.8 km/h), configurable |

---

## 3. Ambiguities

| # | Requirement | Question | Recommendation |
|---|---|---|---|
| A1 | REQ-REC-2 | `yyyymmdd-hhmm` has minute resolution — Start, Cancel, Start within one minute collides. So does a Stop/Start pair. | Add seconds: `yyyymmdd-hhmmss`. Keep the display name minute-resolution if preferred, but the key must be unique. |
| A2 | REQ-REC-2 | Local time or UTC? A ride crossing a DST boundary or a timezone sorts incorrectly. | Store UTC internally, display local. |
| A3 | REQ-SET-1 | **UK miles and US miles are the same unit** — both are exactly 1609.344 m since the 1959 international agreement. The distinction does not exist for distance. | Offer *Metric* (km, m, km/h), *Imperial* (mi, ft, mph), and optionally *Nautical* (NM, ft, kn) for completeness. If a UK/US split is still wanted, state what should actually differ. |
| A4 | REQ-SET-2 | Yards are listed for height. Yards are not used for altitude in any convention. | Metres for metric, feet for imperial. Drop yards. |
| A5 | REQ-NAV-4 | "Displayed in the dedicated area at the bottom" — does viewing a log show its statistics, a map, an elevation profile, or all three? | Statistics first (reuses the panel from the main screen). Map and profile as later additions. |
| A6 | REQ-STAT-3 | On a fresh install there is no "most recent log". | Define an empty state. |
| A7 | REQ-SET-7 | KML has no standard time representation for tracks. A plain `LineString` loses all timestamps, so speed and time statistics cannot be re-derived from the export. | *Decided: accepted.* KML is treated as a route-only export; GPX carries the full log. See §8. |
| A8 | REQ-REC-0 vs G1 | "Only Start is enabled when the app is opened" is correct for a normal launch, but the app can also be launched after being killed mid-recording, with an unfinalised log in storage. Forcing the Idle state there silently abandons the ride. | Treat REQ-REC-0 as the rule for a *clean* launch. On finding an unfinalised log, enter a **Recovered** state instead: prompt "Recording was interrupted — resume or finish?", with Stop and Cancel enabled so the partial ride can be saved or discarded. Once Android background recording exists (REQ-PLAT-2), re-opening the app during an active recording must likewise restore the Recording state, not the Idle one. |

---

## 4. Gaps — not specified, will be needed

| # | Gap | Why it matters |
|---|---|---|
| G1 | **Crash / kill recovery** | Android will kill the app during a long ride. Without recovery the whole ride is lost. Every fix must be committed to IndexedDB as it arrives, and on launch the app must detect an unfinalised log and offer to resume or finalise it. Non-negotiable for a vehicle logger. **Note the tension with REQ-REC-0:** "only Start is enabled when the app is opened" holds for a normal launch, but cannot hold when an unfinalised log is found — that case needs its own defined state (see A8). |
| G2 | **Screen-off recording** | Not stated, but implied by 2-hour drives. The PWA cannot do it (see [AppType_Analysis.md](AppType_Analysis.md) §2). This is the main driver for the Capacitor phase and should be an explicit requirement. |
| G3 | **Wake lock** | The PWA's only way to keep logging. Needs a user-visible toggle and a warning about battery. |
| G4 | **Permission handling** | Denied location, "Allow once", precise-location off, location services disabled entirely. Each needs a distinct message — a blank screen is the common failure. |
| G5 | **No-fix / poor-accuracy state** | The first 10–30 s after Start usually have no satellite fix. The UI must show "acquiring" rather than a distance of 0 that looks broken. |
| G6 | **Delete a log** | The list screen offers Export but no delete. Storage grows without bound. Rename would also be useful given the timestamp-only names. |
| G7 | **Track segments across signal loss** | Tunnels and underpasses. Without segmenting, the track draws a straight line across the gap and distance is wrong. GPX `<trkseg>` exists for this. |
| G8 | **Storage limits** — ✅ addressed | ~1.3 MB per 3-hour ride at 1 Hz. Fine for dozens of logs, but Safari evicts script-writable storage for unused sites after 7 days unless installed to the home screen. Now covered by REQ-STO-4 (persistent-storage request) and REQ-STO-5 (visible storage figure). |
| G9 | **Thermal / battery behaviour** | A mounted phone in sun, screen on, GNSS active, will throttle and may shut down mid-ride. Worth a documented recommendation (dim screen, shaded mount, charging) even if not a code requirement. |

---

## 5. Additional observations

> **All four were decided on 2026-11-19 — see §9b.** Kept for the reasoning;
> the decisions supersede the recommendations below.

- **Disabled-but-highlighted Start (REQ-REC-3)** is unusual — a control that looks active but rejects taps is normally a bug. The intent is clearly a recording indicator. Better: Start becomes plainly disabled, and a separate prominent "● Recording" badge with elapsed time communicates the state. If the highlight is kept, it must be visually distinct from an enabled button.
- **Ten metrics in half a screen.** On a 6" phone that area is roughly 350 px tall. Ten label/value pairs fit in a 2-column grid but will be cramped and uniformly weighted. Suggest a hierarchy: distance, duration and current speed large at the top; the remaining seven in a compact grid below.
- **Pause is only half-useful without auto-pause.** The main reason to pause is a stop, and users forget to press it. Since moving time is already computed via the 0.5 m/s threshold, an optional auto-pause is nearly free. Worth considering, not required.
- **No map is specified anywhere.** That is a legitimate choice — it keeps the app small and offline. Confirm it is deliberate; a track log with no visual preview is harder to identify in a list of timestamped names.

---

## 6. Suggested requirement changes

> **Superseded by the decision log in §8.** This table records what was proposed
> when the analysis was first written; §8 records what was actually decided and
> where it landed in draft 2. Kept for traceability.

| Action | Requirement |
|---|---|
| Amend | REQ-REC-2 — add seconds to the name; store UTC |
| ~~Amend~~ Done | REQ-REC-5 / REQ-REC-13 — "save" means commit to local storage; files exist only on Export. §4.3 (REQ-EXP) and §7 (REQ-STO) added |
| ~~Amend~~ Done | REQ-REC-10a — Start while paused resumes the open log |
| Amend | REQ-SET-1 / REQ-SET-2 — Metric / Imperial / Nautical; drop yards |
| ~~Amend~~ Done | REQ-SET-3/4 — setting removed, record at device rate; REQ-SET-5 withdrawn |
| Amend | REQ-SET-7 — KML export uses `gx:Track` |
| Add | Definitions of overall time, moving time, moving threshold, and both averages |
| Add | Altitude smoothing and ≥5 m hysteresis for gained/dropped height |
| Add | Fix rejection rules: accuracy > 30 m, implied speed > 90 m/s |
| Add | Crash recovery of an unfinalised log, and a Recovered launch state qualifying REQ-REC-0 |
| Add | Track segmentation on signal gaps > 10 s |
| Add | Delete and rename on the log list screen |
| Add | Permission, no-fix and empty states |
| Add | Wake lock toggle (PWA) and background recording (APK) |

---

## 8. Decision log (2026-11-19)

### Traps

| # | Decision | Consequence |
|---|---|---|
| T1 — gained/dropped height | **Accepted.** No altitude smoothing or hysteresis. Raw deltas summed. Cleanup happens externally. | Expect several hundred metres of phantom climb and descent on a flat ride; on hilly routes the figure may be 2–3× the true value. The numbers are self-consistent and the raw altitudes are preserved, so an external tool can recompute correctly. Recorded as REQ-STAT-19 so the panel's limitation is documented rather than looking like a bug. |
| T2 — maximum speed | **Accepted.** No outlier rejection. | A single bad fix can show an implausible maximum. One zero-cost mitigation is already in the spec as REQ-GPS-5: take speed from the device's own Doppler-derived value rather than differencing positions. That alone removes most spurious peaks without any filtering logic, because a position jump does not produce a corresponding Doppler reading. |
| T3 — distance inflated while stationary | **Accepted.** No stationary deadband. | Stops at lights and fuel stops add drift to total distance — roughly 1–3 km per stationary hour in poor conditions, less in open sky. Affects total distance and therefore average speed. |
| T4 — undefined averages | **Resolved.** Average moving speed removed (REQ-STAT-9 withdrawn). Remaining definitions fixed in REQ-STAT-15…18. | Note that "time while moving" (REQ-STAT-6) is retained and still needs a moving threshold; set at 0.5 m/s in REQ-STAT-16. This threshold affects only that one metric, not distance. |

### Ambiguities

| # | Decision | Recorded as |
|---|---|---|
| A1 — name collisions | **Accepted.** Minute resolution kept; two logs will not be started within one minute. | REQ-REC-2 unchanged |
| A2 — timezone | **Resolved.** UTC. | REQ-REC-2 |
| A3 — UK vs US miles | **Resolved.** Two options only: kilometres (default) or miles. | REQ-SET-1 |
| A4 — yards | **Resolved.** Removed. Metres or feet. | REQ-SET-2 |
| A5 — log view content | **Resolved.** Three tabs: Statistics, Map, Elevation profile. | REQ-NAV-10…14, see §9 for the map recommendation |
| A6 — empty state | **Resolved.** No logs → no statistics. | REQ-STAT-14 |
| A7 — KML timestamps | **Accepted.** KML is a route export only; a plain `<LineString>` without timestamps is fine. GPX remains the default and carries the full log. | REQ-EXP-9 |
| A8 — recovery after kill | **Resolved.** Unfinished log is closed automatically on next launch, retained, and marked "unfinished". No automatic resume. | REQ-REC-15…17, REQ-NAV-9 |

### Gaps

| # | Decision | Recorded as |
|---|---|---|
| G1 — crash recovery | **Addressed** via A8. Per-fix commits (REQ-STO-2) are what make the partial log survivable. | REQ-REC-15…17 |
| G2 — screen-off recording | **Resolved.** Deferred to the APK and now specified there (REQ-BG-7…14). Not attempted in the PWA. | REQ-PLAT-4, §10.2 |
| G3 — wake lock | **Resolved.** Both builds now have an explicit mechanism: the PWA holds a screen wake lock while recording; the APK records with the screen locked via a foreground service and holds no wake lock. | REQ-BG-1…14, §10 |
| G4 — permissions | **Resolved.** A **Permit Location** button appears in place of the controls. Opens system settings in the APK; the PWA cannot do this, so it re-requests and falls back to instructions. | REQ-PERM-1…3 |
| G5 — no-fix state | **Resolved.** Wait for a satellite fix before recording; show "acquiring". | REQ-GPS-1, REQ-GPS-2 |
| G6 — delete a log | **Resolved.** Delete button next to each log. | REQ-NAV-8 |
| G7 — signal gaps | **Resolved.** Nothing is written while there is no signal; gaps are not marked. | REQ-GPS-3, REQ-GPS-4 |
| G8 — storage limits | **Accepted**, though already covered by REQ-STO-4 and REQ-STO-5 from the B3 resolution. No further action. | REQ-STO-4, REQ-STO-5 |
| G9 — battery and heat | **Accepted.** Intended use is screen off, phone in pocket, statistics refreshed only when the app is opened. | REQ-PLAT-4 |

**On G3 and G9 together — resolved 2026-11-19.** Each build now has its own stated mechanism for recording without interruption, specified in §10 of the requirements:

- **PWA:** screen wake lock while recording (REQ-BG-1…6). The screen stays on, which is the only way a web page keeps receiving fixes. Accepted as a testing arrangement, not a usage model.
- **APK:** foreground service, screen off and locked, no wake lock held (REQ-BG-7…14). This is the real product behaviour.

The reasoning behind the split: when the screen turns off, Chrome moves the page hidden → frozen → discarded and suspends the JavaScript task queue, so `watchPosition` simply stops being called. A service worker cannot hold the subscription (event-driven, terminated when idle), and Doze would suspend the process regardless. Wake Lock is the only remaining lever and it works by preventing the screen from switching off — so it enables continuous logging and precludes the pocketed-phone usage model at the same time. The foreground service is a different mechanism entirely: an OS-sanctioned, user-visible exemption granted to an installed app, with no web equivalent.

Two implementation details that are easy to get wrong:

- **Wake locks are released automatically when the page is hidden** and are *not* restored when it returns. REQ-BG-3 exists because of this: without a `visibilitychange` re-acquire, a single notification shade pull silently ends the wake lock and the next screen-off stops the log.
- **REQ-BG-12 is a genuine exception to REQ-REC-0.** With the service running, reopening the app must restore the Recording state and backfill the statistics panel — not show the initial Idle state. This is distinct from the interrupted-log recovery in REQ-REC-15…17, which handles the case where nothing is running any more. The two must not be conflated: one resumes a live recording, the other closes a dead one.

Two consequences for how the project should be run:

- **Don't defer the APK phase to the end of the schedule.** It is not packaging work; it is where the only requirement that makes the app usable (REQ-PLAT-4) is actually met. Worth standing up a minimal APK early — even before the UI is finished — to prove the background service, the "Allow all the time" permission flow, and Samsung's battery management (see [AppType_Analysis.md](AppType_Analysis.md) §0) on both phones.
- **Acceptance testing must happen on the APK.** A feature verified in the PWA has not been verified for the intended use. In particular, statistics computed over a 2-hour pocketed ride exercise code paths — long logs, interrupted recordings, storage growth — that a desk test never reaches.

**On G7.** Writing nothing during signal loss is the right call for a recorder, but note the downstream effect: a tunnel becomes two points separated by a straight line in any tool that reads the file, and the distance across it is measured as a straight line. Since GPX is the default and segments (`<trkseg>`) are the standard representation for exactly this, leaving the gap unmarked is a deliberate loss of information — easy to add later if a downstream tool turns out to care.

---

## 9. Map technology for the Map tab (REQ-NAV-12)

**Recommendation: Leaflet with OpenStreetMap raster tiles.** ✅ Adopted 2026-11-19 — recorded as REQ-NAV-15…20.

| Option | Cost / key | Size | Assessment |
|---|---|---|---|
| **Leaflet + OSM tiles** | Free, no key, no account | ~42 KB gzipped | **Recommended.** Drawing a polyline over tiles is a dozen lines of code. No billing, no signup, nothing to expire. Attribution is required and the OSM tile policy forbids bulk downloading — both fine for personal use. |
| MapLibre GL JS + vector tiles | Free library; tiles need a provider or self-hosting | ~200 KB+, needs WebGL | Better rendering, rotation, and the genuine upgrade path if offline maps ever matter (a PMTiles archive is a single file you can ship or cache). Overkill for v1. |
| Google Maps JS API | API key + billing account required | Large | Familiar, but needs a Cloud project and a card on file for a map that draws one line. Ties the app to a provider for no benefit here. |
| Mapbox GL JS | Key required, free tier then paid | ~200 KB+ | Good product, same signup and quota overhead as Google for no advantage over MapLibre. |

Practical notes:

- Tiles come from the network, so the Map tab is the one part of the app that does not work offline. REQ-NAV-14 and REQ-STO-6 already record this. The track polyline itself renders from IndexedDB and could be shown on a blank background if you prefer that to an error message.
- A 3-hour ride is ~10,800 points. Leaflet handles a polyline that size, but simplify to ~2,000 points for display (Douglas–Peucker, ~5 m tolerance) or panning will stutter. This is display-only simplification and must not touch the stored data or the export.
- The service worker should **not** aggressively cache map tiles. OSM's tile usage policy prohibits bulk downloading, and a logger that pre-fetches a route's worth of tiles is exactly what that policy is aimed at.

**For the elevation profile (REQ-NAV-13):** no charting library is needed. A hand-rolled SVG or canvas plot of altitude against cumulative distance is about 50 lines and avoids a dependency. If a library is preferred, µPlot (~45 KB) is the smallest credible option. Note that with T1 accepted, this profile will visibly show GPS altitude noise as a fuzzy trace — that is expected and not a rendering bug.

---

## 9b. Decision log — second round (2026-11-19)

Closing the items raised in §5 and in the blocker resolutions, plus five gaps found while reviewing draft 2.

### Items raised in the analysis

| # | Decision | Recorded as |
|---|---|---|
| 1 — highlighted Start | **Resolved.** Start is disabled once logging runs; the highlight is retained deliberately as the recording indicator, including while the first fix is still being acquired. No separate badge. | REQ-REC-3 |
| 2 — statistics layout | **Deferred.** Build it, look at it, decide then. | — |
| 3 — auto-pause | **Rejected.** Not wanted. | — |
| 4 — fix-rate indicator | **Adopted.** Read-only display of the current fix rate. | REQ-GPS-6 |
| 5 — "never exported" marker | **Rejected.** | — |
| 6 — location abstraction + early APK spike | **Adopted, both.** The interface is now a requirement; the spike is a working practice (see below). | REQ-PLAT-5, REQ-PLAT-6 |
| 7 — tabs on the main screen | **Deferred.** Main screen shows statistics only for now; revisit after the app is built and tested. | REQ-STAT-1 |

### Gaps found in draft 2

| # | Decision | Recorded as |
|---|---|---|
| 8 — destructive actions | **Resolved.** Confirmation required for both Cancel and Delete. | REQ-REC-12a, REQ-NAV-8a |
| 9 — export units | **Resolved.** Display units are display-only; exports always carry decimal degrees and metres. | REQ-EXP-10, REQ-SET-2a |
| 10 — Pause and the receiver | **Resolved.** Pause switches the receiver off. | REQ-REC-7, REQ-REC-9a |
| 11 — null altitude | **Accepted.** No special handling; height statistics reflect the altitudes that were recorded. | REQ-GPS-7 |
| 12 — settings persistence | **Resolved.** `localStorage` in the PWA, native preferences in the APK, behind one interface. | REQ-SET-9…12 |

### Notes on three of these

**#9 was a different question than the one answered.** The export *format* choice (GPX default, KML optional) was already settled in REQ-SET-6…8 and is unchanged. The issue here is narrower: GPX and KML are specified formats whose coordinate and elevation units are fixed — decimal degrees and metres. If the km/miles display setting ever reaches the serialiser, the app emits files that every other tool silently misreads, with no error anywhere. REQ-EXP-10 and REQ-SET-2a exist to keep that boundary explicit.

**#10 has a visible cost worth knowing.** Switching the receiver off during Pause saves power, but resuming now needs a fresh fix — typically 5–30 seconds, longer in a built-up area or after a long pause. REQ-REC-9a states this: the first part of the section after a resume will not be recorded. For short stops this trades a real data gap for a small power saving; if that proves annoying in use, keeping the receiver on during Pause is a one-line change.

**#12 for the APK.** `localStorage` does work inside the Capacitor WebView, but it lives in WebView storage, which can be cleared by the system or by "Clear data", and is not reliably included in Android's app backup. `@capacitor/preferences` writes to native `SharedPreferences` — durable, backed up, and unaffected by WebView data clears. REQ-SET-12 keeps both behind one interface, the same pattern as REQ-PLAT-5 for location.

### Working practice adopted (#6)

Not requirements, but agreed ways of working:

- **Spike the APK early**, before the UI is finished — a throwaway build with Start, Stop, a point count and the notification, then a real ride on both phones. This answers the genuinely uncertain questions (does the service survive Samsung's battery management, does "Allow all the time" work, does the plugin batch, does the WebView get reclaimed, what does it cost in battery) while they are still cheap to act on.
- **Acceptance testing happens on the APK, on real rides.** A feature verified in the browser is verified for development, not for use. Long logs, interrupted recordings, storage growth and recovery after a kill only appear in the real execution model.

---

## 10. Build order

0. **APK spike** — throwaway build, no UI beyond Start/Stop/point count. Proves the foreground service, the "Allow all the time" flow, batched delivery and Samsung's battery management on a real ride. Do this first; it is the only part of the project with genuinely unknown answers.
1. **Core recorder** — state machine (REQ-REC-0…17), the `LocationSource` interface (REQ-PLAT-5/6), IndexedDB persistence per fix, interrupted-log recovery, permission and acquiring-signal states. Everything else depends on this being correct.
2. **Statistics engine** — the definitions in REQ-STAT-15…19. Unit-testable against recorded fixture tracks; worth doing before any UI, since every metric is computed from the same stored fixes.
3. **Main screen** — buttons and statistics panel.
4. **Log list** — list, select, delete, "unfinished" marker.
5. **Log view tabs** — Statistics first (reuses step 2), then Elevation profile (plain SVG), then Map (Leaflet, see §9). The map is last because it is the only part needing a network and a third-party dependency.
6. **Export and share** — GPX, KML, share sheet with download fallback.
7. **Settings** — units, export format, storage usage.
8. **PWA packaging** — manifest, service worker, install hints, screen wake lock with `visibilitychange` re-acquire (REQ-BG-1…6).
9. **Capacitor APK** — foreground service and background recording (REQ-BG-7…14), live-recording restore on reopen, system-settings deep link for REQ-PERM-2, native file export. This is where the app becomes usable for real rides (REQ-PLAT-4).

Steps 1 and 2 carry nearly all the risk. Steps 3–8 are routine. Step 9 is where the Android-specific work lives — foreground service, permissions, and the "Allow all the time" flow — and is best treated as its own phase rather than an afterthought.

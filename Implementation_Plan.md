# GPS Logger — Implementation Plan

**Status:** draft 1, for review
**Date:** 2026-11-19
**Implements:** [Requirements.md](Requirements.md) draft 2
**Informed by:** [Requirements_Analysis.md](Requirements_Analysis.md), [AppType_Analysis.md](AppType_Analysis.md)

---

## 1. Approach in one paragraph

Build a small, dependency-light TypeScript application whose core — state machine, statistics, serialisers — is pure code with no browser or platform APIs in it, so it can be unit-tested without a device. Everything platform-specific sits behind three narrow interfaces (location, settings, sharing) with one implementation per build. The PWA is developed first because iteration is fast there; the APK is proven first, in a throwaway spike, because that is where the unknowns are.

---

## 2. Technology choices

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript, strict mode | Statistics and state transitions are where bugs hide; the compiler earns its keep |
| Build | Vite | Fast dev server, static output, first-class Capacitor target |
| UI | **Preact + TSX** (~4 KB) | React-like and heavily documented, so knowledge transfers; TSX is explicitly typed with no compiler magic. Three screens do not justify anything larger |
| Routing | None — screen state in a store | Three screens. A router library would be more code than the feature |
| IndexedDB | `idb` (~1.5 KB) | Promise wrapper over raw IndexedDB, which is otherwise event-based and unpleasant |
| Map | Leaflet + OSM tiles, lazy-loaded | REQ-NAV-15…18. Loaded only when the Map tab is opened |
| Elevation chart | Hand-rolled SVG | REQ-NAV-20 |
| Tests | Vitest + `fake-indexeddb` | Runs the real storage layer in Node, no browser needed |
| PWA shell | `vite-plugin-pwa` | Manifest and service worker without hand-writing either |
| Native | Capacitor 7 + Android | REQ-PLAT-2 |

**Alternatives considered.** Svelte compiles smaller and has nicer reactivity, but introduces a compile-time model to learn for a three-screen app. Plain TypeScript with manual DOM updates avoids a framework entirely but costs boilerplate in exactly the place that changes most — the once-per-second statistics panel. Preact is the middle. This decision is cheap to reverse in Phase 1 and expensive after Phase 4.

### Capacitor plugins

| Plugin | Requirement |
|---|---|
| `@capacitor/preferences` | REQ-SET-11 |
| `@capacitor/filesystem` | REQ-EXP-1, REQ-EXP-6 |
| `@capacitor/share` | REQ-EXP-3, REQ-EXP-4 |
| `@capacitor/app` | Back-button handling, lifecycle for REQ-BG-12 |
| Background geolocation — **to be chosen in Phase 0** | REQ-BG-7…11 |

The background geolocation plugin is the one genuinely consequential dependency, because it determines who owns the recorded data while the UI is dead. Phase 0 exists to decide it with evidence rather than by reading READMEs.

---

## 3. Architecture

```
src/
  core/                    pure — no DOM, no platform APIs, fully unit-tested
    types.ts               Fix, LogMeta, LogStatus, Stats, Units
    geo.ts                 haversine, bearing, cumulative distance
    statistics.ts          incremental accumulator + finalise
    recordingMachine.ts    explicit state machine, no side effects
    simplify.ts            Douglas–Peucker (display only)
    export/
      gpx.ts
      kml.ts

  platform/                interfaces + one implementation per build
    LocationSource.ts      interface (REQ-PLAT-5/6)
    WebLocationSource.ts   watchPosition
    NativeLocationSource.ts background plugin
    SettingsStore.ts       interface (REQ-SET-12)
    LocalSettingsStore.ts  localStorage        (REQ-SET-10)
    NativeSettingsStore.ts @capacitor/preferences (REQ-SET-11)
    Sharer.ts              interface
    WebSharer.ts           navigator.share / download fallback
    NativeSharer.ts        filesystem + share sheet
    wakeLock.ts            REQ-BG-1…5, PWA only
    index.ts               build-time selection of implementations

  data/
    db.ts                  schema, open, migrations
    logRepository.ts       create / append / finalise / delete / query

  app/
    recorder.ts            orchestrates machine + source + repository
    stores.ts              reactive state for the UI

  ui/
    App.tsx
    screens/   MainScreen, LogListScreen, SettingsScreen
    components/ ControlButtons, StatisticsPanel, SignalIndicator,
                ConfirmDialog, LogList, LogTabs, MapTab, ElevationTab
```

**The rule that keeps this testable:** nothing in `core/` may import from `platform/`, `data/` or `ui/`. Statistics and state transitions are then verifiable in milliseconds against fixture data, which is where the four accepted traps and all the timing edge cases actually get caught.

### Two design decisions worth agreeing before coding

**1. Recording state and signal state are orthogonal.**

REQ-REC-3 requires the Start button highlighted while logging runs *even before the first fix*, and REQ-REC-9a reintroduces acquisition after every resume. Modelling "acquiring" as a recording state would duplicate every button rule. Instead:

```ts
type RecordingState = 'idle' | 'recording' | 'paused';
type SignalState    = 'off' | 'acquiring' | 'tracking';
```

Button labels and enablement derive from `RecordingState` alone (REQ-REC-0…14); the signal indicator and whether fixes are stored derive from `SignalState` (REQ-GPS-1…3, REQ-GPS-6). Pause sets `SignalState` to `off` (REQ-REC-7); resume sets it to `acquiring` (REQ-REC-9a).

The three controls are a pure projection of `RecordingState` — a single table, no conditional logic scattered through the view:

| `RecordingState` | Start / Stop | Pause / Re-Start | Cancel |
|---|---|---|---|
| `idle` | "Start", plain | disabled | disabled |
| `recording` | "Stop", highlighted | "Pause" | enabled |
| `paused` | "Stop", highlighted | "Re-Start" | enabled |

Note that the merge of Start and Stop (requirements §3.1) changed only this table. The state machine itself is unaffected — which is the point of keeping the projection separate from the states.

**2. Statistics are accumulated incrementally, not recomputed.**

Recomputing nine metrics over a growing array once per second is wasteful by the end of a long ride. A running accumulator is O(1) per fix:

```ts
interface StatsAccumulator {
  distance; movingTime; overallTime; maxSpeed;
  minAlt; maxAlt; gain; drop;
  last: Fix | null;
}
```

The accumulator is snapshotted into the log record periodically, so opening a finished log is instant. One exception: on re-attaching to a recording that continued while the UI was dead (REQ-BG-12), stats are recomputed from stored points once — ~10,800 points is a few milliseconds — then accumulation resumes.

### Data model

```ts
// store: logs        keyPath 'id'
interface LogMeta {
  id: string;                 // ULID — sortable, collision-free
  name: string;               // yyyymmdd-hhmm UTC (REQ-REC-2)
  startedAt: number;          // epoch ms UTC
  endedAt: number | null;
  status: 'recording' | 'finished' | 'unfinished';   // REQ-REC-16
  pauses: Array<{ from: number; to: number | null }>; // REQ-STAT-15
  stats: Stats | null;
  pointCount: number;
}

// store: points      keyPath ['logId','seq']
interface Fix {
  logId: string; seq: number;
  t: number;                  // epoch ms
  lat: number; lon: number;   // degrees
  alt: number | null;         // metres (REQ-GPS-7)
  acc: number | null;
  spd: number | null;         // m/s, device-reported (REQ-GPS-5)
  hdg: number | null;
}
```

Separate stores per REQ-STO-3. The compound key makes append O(1), read a single cursor over a range, and delete a single range operation. Everything is stored in SI units; display conversion happens in the UI only (REQ-SET-2a, REQ-EXP-10).

---

## 4. Phases

Sizing is relative: **S** ≈ a short session, **M** ≈ a day, **L** ≈ several days.

### Phase 0 — APK spike (throwaway) — **M**

Not the product. A minimal Capacitor app: Start, Stop, a live point count, the foreground-service notification. No statistics, no storage beyond a counter, no styling.

**Purpose:** answer the questions that cannot be answered at a desk, while it is still free to act on them.

- Does the service survive a locked screen for 2 hours on **both** phones?
- Does Samsung's One UI kill it, and which exemptions stop that? ([AppType_Analysis.md](AppType_Analysis.md) §0)
- Does "Allow all the time" behave as expected on Android 13 and Android 17?
- Does the plugin deliver fixes **batched** or one at a time? (determines REQ-PLAT-6's shape)
- Is the WebView reclaimed while the service runs? (determines who owns persistence)
- What does an hour of recording cost in battery?

**Done when:** a real ride on each phone has been recorded with the screen off, and the plugin choice is made and written down.

> This phase can invalidate assumptions in Phases 2–3. That is exactly why it is first.

### Phase 1 — Project skeleton and pure core — **M**

Vite + TS strict + Preact + Vitest. Then `core/`: types, `geo.ts`, `statistics.ts`, `recordingMachine.ts`, with tests.

- REQ-STAT-15…19 definitions implemented exactly
- REQ-REC-0…17 state machine as a pure transition table, plus the state → control projection above (REQ-REC-0, 3, 4, 6, 6a, 11, 14)
- Synthetic fixture tracks: a straight run, a stop-and-go, a climb, a track with null altitudes, an empty track

**Done when:** `npm test` covers every transition and every statistic, with no browser involved.

### Phase 2 — Storage — **S/M**

`db.ts` + `logRepository.ts`, tested against `fake-indexeddb`.

- REQ-STO-1…3; batch append in one transaction (REQ-PLAT-6)
- REQ-STO-4 persistent storage request
- Recovery query: find `status === 'recording'` at launch (REQ-REC-15…17)

**Done when:** a 10,000-point log can be written, read back, summarised and deleted in tests.

### Phase 3 — Recorder and web location source — **M**

`recorder.ts` joins machine + source + repository. `WebLocationSource` wraps `watchPosition`.

- REQ-GPS-1…3 (wait for fix, record nothing without signal), REQ-GPS-5, REQ-GPS-6 (observed rate)
- REQ-REC-7 / REQ-REC-9a — Pause releases the watch entirely; resume re-acquires
- REQ-STO-2 — commit on arrival, never buffer

**Done when:** a log can be recorded end-to-end from the browser console, with no UI.

### Phase 4 — Main screen — **M**

- REQ-REC-0…14 — three controls: combined Start/Stop (highlighted whenever a log is open, REQ-REC-3), combined Pause/Re-Start, Cancel
- REQ-STAT-1…14 panel, statistics only (REQ-STAT-1)
- REQ-GPS-2 acquiring indication, REQ-GPS-6 rate indicator
- REQ-REC-12a Cancel confirmation via a shared `ConfirmDialog`
- REQ-PERM-1…3 permission states

**Done when:** a ride can be recorded on a phone in the browser, screen on, and the panel updates live.

> Two review points here: the deferred statistics layout (analysis §9b #2 — nine metrics in half a screen), and whether the Start/Stop highlight should look different while paused versus recording (analysis §9c).

### Phase 5 — Log list — **S/M**

REQ-NAV-1…3, REQ-NAV-8 delete, REQ-NAV-8a confirmation, REQ-NAV-9 "unfinished" marker.

### Phase 6 — Log view tabs — **M**

REQ-NAV-10…14. Statistics tab reuses Phase 4's panel. Elevation profile as SVG (REQ-NAV-20). Map last: Leaflet in a lazy chunk (REQ-NAV-15…19), display simplification via `simplify.ts`, offline message per REQ-NAV-14.

### Phase 7 — Export and share — **S/M**

REQ-EXP-1…10. GPX with `<ele>` and `<time>`; KML as a plain `LineString`. `WebSharer` uses `navigator.canShare({ files })` with a download fallback (REQ-EXP-6). SI units enforced at the serialiser boundary (REQ-EXP-10) — covered by a test that exports with miles selected and asserts metres in the output.

### Phase 8 — Settings — **S**

REQ-SET-1…12. Units, export format, storage usage (REQ-STO-5), settings behind `SettingsStore`.

### Phase 9 — PWA packaging — **S**

REQ-PLAT-1, manifest, service worker, install hints. Wake lock with `visibilitychange` re-acquire (REQ-BG-1…6). Service worker must **not** cache map tiles (REQ-NAV-18).

### Phase 10 — Capacitor APK — **L**

REQ-PLAT-2, REQ-BG-7…14. `NativeLocationSource`, `NativeSettingsStore`, `NativeSharer`. Foreground service and notification, REQ-BG-12 re-attach on reopen, REQ-PERM-2 settings deep link, REQ-BG-13/14 permission and battery-optimisation flows. Android hardware back button must navigate between screens rather than exit (`@capacitor/app`).

**Done when:** a 2-hour pocketed ride on both phones produces a complete log, and reopening mid-ride shows correct live statistics.

---

## 5. Requirements coverage

| Phase | Requirements |
|---|---|
| 0 | — (de-risking only) |
| 1 | REQ-REC-0…17, REQ-STAT-4…19, REQ-GEN-3 |
| 2 | REQ-STO-1…4, REQ-REC-15…17 |
| 3 | REQ-PLAT-5/6, REQ-GPS-1…7, REQ-REC-7/9a, REQ-STO-2 |
| 4 | REQ-REC-0…14, REQ-REC-12a, REQ-STAT-1…3/14, REQ-PERM-1…3 |
| 5 | REQ-NAV-1…3, REQ-NAV-8/8a/9 |
| 6 | REQ-NAV-4, REQ-NAV-10…20 |
| 7 | REQ-EXP-1…10 |
| 8 | REQ-SET-1…12, REQ-STO-5 |
| 9 | REQ-PLAT-1, REQ-BG-1…6, REQ-STO-6 |
| 10 | REQ-PLAT-2/4, REQ-BG-7…14, REQ-PERM-2 |

Every numbered requirement in draft 2 appears exactly once.

---

## 6. Testing

**Unit (Vitest).** All of `core/`, plus `data/` against `fake-indexeddb`. The high-value cases:

- Pause/resume gaps excluded from overall time (REQ-STAT-15) but present in wall-clock
- Moving-time threshold at exactly 0.5 m/s (REQ-STAT-16)
- Null altitudes mixed into a track (REQ-GPS-7)
- Export emits metres while miles is selected (REQ-EXP-10)
- Every state transition, and the state → control projection (Stop reachable from both `recording` and `paused`, REQ-REC-6a)
- Recovery of a log left as `recording` (REQ-REC-15…17)

**Manual device matrix.** Both phones, both builds, for: permission denial and recovery, screen-off behaviour, app killed mid-ride, reopening mid-ride (REQ-BG-12), export to Google Drive via the share sheet, tunnel/signal loss.

**Fixtures.** Record two or three real rides early and keep the raw fixes as test data. Synthetic tracks miss real noise; the accepted traps (T1–T3) are easiest to reason about against a track you remember riding.

---

## 7. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Background plugin behaves differently than assumed | Rework of Phases 2–3 | **Phase 0 exists for this** |
| Samsung kills the service mid-ride | Silent data loss | Phase 0 on the S20 FE specifically; REQ-BG-14 guidance |
| WebView reclaimed while service runs | Lost points | Decide persistence ownership in Phase 0, before Phase 2 |
| Accepted traps look like bugs in use | Loss of confidence in the panel | REQ-STAT-19 documents it; consider a short note in the UI |
| Preact chosen wrongly | Rework of `ui/` only | `core/`, `data/`, `platform/` are framework-free by construction |
| Scope creep into cleanup features | Schedule | REQ-GEN-3 is explicit: this app records, other tools clean |

---

## 8. Explicitly out of scope

Track cleanup and smoothing (REQ-GEN-3) · auto-pause (§9b #3) · "never exported" markers (§9b #5) · tabs on the main screen (§9b #7, deferred) · iOS native build ([AppType_Analysis.md](AppType_Analysis.md) §3) · cloud sync or accounts (REQ-EXP-5) · offline map tiles (REQ-NAV-18) · multi-log export · track editing.

---

## 9. Open questions for review

1. **Preact, or would you rather plain TypeScript?** Cheap to change now, expensive after Phase 4.
2. **Phase 0 before anything else** — it is a throwaway day that de-risks the whole project, but it delays visible progress. Confirm you want it first.
3. **Where should the repository live** — keep everything at the root of `GPSTracker`, or put the app in `app/` with the analysis documents alongside?
4. **Commit granularity** — one commit per phase, or smaller steps you can review as they land?

# GPS Logger — Performance Requirements (Acceleration and Deceleration)

**Status:** draft 3. Decisions D2, D4 (partly), D5, D6, D11, D14, D15 and D22 resolved on 2026-11-25. Implemented in the app and covered by unit and render tests. Not yet driven in a browser or field-tested. The Android rate is open, see D23.
**Date:** 2026-11-25
**Related:** [Requirements.md](Requirements.md) (main recorder, draft 2), [Requirements_Analysis.md](Requirements_Analysis.md)

> This document specifies a fourth top-level screen, **Performance**, with two tabs: **Acceleration** and **Deceleration**. The screen records a GPS log, and when the user stops, it calculates the standard figures for both tabs from that log and charts each event. Where it departs from the main requirements, the departure is listed in §12 so it can be accepted or rejected explicitly.
>
> Items marked **D#** in §16 are decisions for the reviewer. The values in §13 are proposals to be tuned against real rides.

---

## 1. Purpose and scope

| ID | Requirement |
|---|---|
| REQ-ACC-1 | The app shall provide an **Performance** screen, reached from the top navigation alongside **Logs** and **Settings**. The screen shall have two tabs: **Acceleration** and **Deceleration**. |
| REQ-ACC-2 | The screen shall start a GPS log, record it, and on Stop analyse that log and populate both tabs. |
| REQ-ACC-3 | The feature shall apply to a car, a motorcycle and a bicycle (REQ-GEN-1). The analysis shall not depend on vehicle type. |
| REQ-ACC-4 | The feature shall measure **pure** phases only: stationary periods, and any phase in which the vehicle is neither accelerating nor braking, shall not contribute to the results. |
| REQ-ACC-5 | Analysis shall be computed from the stored fixes of a log. It shall not alter the stored log. |
| REQ-ACC-6 | The Deceleration tab shall provide a live wanted-speed alert that tells the driver when to start braking (§8). |
| REQ-ACC-7 | The screen shall have a vehicle selector: **motorcycle** (default), **car** or **bicycle**. The chosen vehicle is stored with each performance log. The log viewer shall allow it to be changed for a stored log, after which that log's analysis is recalculated (REQ-ACC-109). Each vehicle has its own analysis parameter set (§13); the three sets start with the same values. |

## 2. Definitions

| Term | Meaning |
|---|---|
| **Standstill** | Device-reported speed below `STANDSTILL_MPS` (proposed 0.5 m/s, the same threshold as REQ-STAT-16). |
| **G** | Acceleration in units of standard gravity, 1 G = 9.80665 m/s². |
| **Time zero (standing start)** | The instant, interpolated between fixes, at which speed first rises above standstill after a period of standstill. |
| **Acceleration phase** | A period in which speed rises, including brief dips from gear changes (§5.2). It may start at standstill or at any speed. |
| **Standing start** | An acceleration phase whose time zero is a standstill. Only standing-start phases qualify for standing-start metrics. |
| **Rolling window** | A speed window (A to B) crossed during an acceleration phase, measured without reference to standstill. |
| **Braking event** | One deceleration, from a target speed (130, 100, 80 or 50 km/h) down to standstill (§5.3). |
| **Trap speed** | The speed at the moment the run's distance reaches a given mark. |
| **Ready** | The precision state of §3.3. Distinct from REQ-GPS-1 acquisition, which still applies. |
| **Performance log** | A log started from the Performance screen. Stored with the type `performance` (§10.1). |

---

## 3. Starting, stopping and readiness

### 3.1 Start

| ID | Requirement |
|---|---|
| REQ-ACC-10 | The Performance screen shall have a **Start** control. Pressing it shall start GPS logging at once, without waiting for the readiness state in §3.3. |
| REQ-ACC-11 | The new log shall be named as REQ-REC-2 (`yyyymmdd-hhmm`, UTC) and tagged as an performance log. |
| REQ-ACC-12 | The gate of REQ-GPS-1 still applies. No position is recorded until the basic satellite fix is acquired. The readiness check of §3.3 is stricter and runs on top of it. |
| REQ-ACC-13 | Every fix delivered after acquisition shall be stored as it arrives (REQ-STO-2), including fixes received before the readiness state is reached. Analysis decides which fixes it uses (§6.5). |

### 3.2 Stop

| ID | Requirement |
|---|---|
| REQ-ACC-14 | The screen shall have a **Stop** control, which works as the main Stop does: it finishes the log and saves it (REQ-REC-5). |
| REQ-ACC-15 | Pressing Stop shall also run the analysis of §5 and §6 on the log just finished, and populate the Acceleration and Deceleration tabs. |
| REQ-ACC-16 | Stop shall be enabled whenever a log is open, including while the readiness state is not yet **Ready**. |
| REQ-ACC-17 | The screen shall have no Pause and no Cancel (D7). An unwanted log is removed from the Logs list with Delete (REQ-NAV-8). |

### 3.3 Readiness indicator

The readiness indicator shows the precision state of the current fix stream. It is intentionally separate from the main recorder's "acquiring" state.

| ID | Requirement |
|---|---|
| REQ-ACC-20 | The indicator shall have three states: **Off** (no log open), **Acquiring** (amber), **Ready** (green). |
| REQ-ACC-21 | The state shall be **Ready** when all of the following hold for at least `READY_SUSTAIN_S` seconds (proposed 5 s) of consecutive fixes (D1): (a) horizontal accuracy is at or below `READY_ACCURACY_M` (proposed 5 m); (b) device speed is reported (non-null); (c) where the platform reports satellites, at least `READY_MIN_SATELLITES` (proposed 6) are used; (d) where the platform reports a provider, the provider is `gps` or `fused`, not `network`. |
| REQ-ACC-22 | On the PWA, checks (c) and (d) cannot be made, because the web API does not report them (`src/platform/LocationSource.ts`). The PWA shall apply (a) and (b) only, and shall show that the readiness check is indicative. |
| REQ-ACC-23 | Once **Ready**, the state shall return to **Acquiring** if accuracy stays above `READY_ACCURACY_M` for more than 3 s. Recording continues regardless. |
| REQ-ACC-24 | While the state is **Acquiring**, the screen shall show the current horizontal accuracy in metres, the satellite count where known, and the best accuracy seen so far in this log. |
| REQ-ACC-25 | The state shall not block Stop, and shall not prevent results being calculated. A log that never reaches **Ready** shall still be analysed, with its events flagged (§9). |

### 3.4 Keeping the device awake, and recovery

| ID | Requirement |
|---|---|
| REQ-ACC-26 | While an performance log is open, the PWA shall hold a screen wake lock as REQ-BG-1 to REQ-BG-3 describe. |
| REQ-ACC-27 | In the APK, recording shall use the foreground service and notification as REQ-BG-7 to REQ-BG-9 describe. The screen is not kept on, as REQ-BG-10 describes. |
| REQ-ACC-28 | Recovery of an interrupted performance log shall follow REQ-REC-15 to REQ-REC-17. The log is marked unfinished and can still be analysed (REQ-ACC-111). |

---

## 4. Recording rate

| ID | Requirement |
|---|---|
| REQ-ACC-30 | While a performance log is recording on a native build, the location source shall request the highest update rate the platform offers. Precision is the priority, so the rate is as high as the device allows. 5 Hz is the minimum before the low-rate flag (REQ-ACC-102) applies. **Not met on Android yet:** the background plugin fixes the interval at 1 s (D23). |
| REQ-ACC-31 | The rate shall be fixed for this feature and not user-selectable. This overrides REQ-SET-3 for this screen only (§12). |
| REQ-ACC-32 | The observed fix rate (REQ-GPS-6) shall be shown on the screen during recording. |
| REQ-ACC-33 | The PWA build shall record at whatever rate the browser delivers, which is typically about 1 Hz. Its results are less precise and are flagged as low-rate (REQ-ACC-102). |

---

## 5. Isolating the phases

### 5.1 Stationary periods

| ID | Requirement |
|---|---|
| REQ-ACC-40 | Fixes recorded before the first movement shall be ignored. This is the "first few logs where I am not moving" of the brief. The count of fixes is not fixed; the rule is based on speed. |
| REQ-ACC-41 | For a standing start, time zero shall be the interpolated instant at which speed first rises above `STANDSTILL_MPS` after standstill. It is not the moment Start was pressed or the moment the user began to accelerate. |
| REQ-ACC-42 | Stationary periods between phases shall not belong to any phase. |
| REQ-ACC-43 | Fixes after the end of the last phase shall be ignored. This is the "end of the log when I am not really accelerating" of the brief. |

### 5.2 Acceleration phases and gear dips

Gear changes make the speed drop briefly or stop rising. A dip shall not end a phase, because acceleration resumes afterwards.

| ID | Requirement |
|---|---|
| REQ-ACC-50 | A period in which speed is not rising (windowed acceleration below `MIN_ACCEL_MPS2`, proposed 0.3 m/s²) shall remain part of the phase while it lasts no longer than `GEAR_DIP_MAX_S` (maximum 1.0 s) and the speed lost during it does not exceed `GEAR_DIP_MAX_LOSS_MPS` (proposed 0.8 m/s, about 3 km/h) (D4). |
| REQ-ACC-51 | A phase shall end at the first period that exceeds either limit in REQ-ACC-50. The phase ends at the peak speed before that period began; the period itself is excluded. |
| REQ-ACC-52 | A phase still accelerating when the log ends shall end at the last fix of the log. |
| REQ-ACC-53 | A new acceleration phase shall begin whenever speed starts rising after a non-accelerating period longer than `GEAR_DIP_MAX_S`. The rise may start from standstill or from any speed. This allows rolling windows (§6.1) to be measured. |
| REQ-ACC-54 | A dip after a target speed has been reached shall not invalidate that target. The target is measured at its first crossing. |
| REQ-ACC-55 | One log may contain several phases. Each is analysed separately and listed in order. |
| REQ-ACC-56 | A phase that does not reach 10 km/h shall not be reported. It is treated as noise. |
| REQ-ACC-57 | Standing-start metrics (§6.1, first group) shall use only standing-start phases. Rolling windows and distance-based metrics that are measured from a standstill shall use standing-start phases. Rolling windows (§6.1, third group) may use any phase. |

### 5.3 Braking events

| ID | Requirement |
|---|---|
| REQ-ACC-58 | A braking event for target T (130, 100, 80 or 50 km/h) shall start at the last downward crossing of T before the vehicle stops, and end at the first fix below `STANDSTILL_MPS`. Only measured speed defines an event. The wanted-speed alert does not start or alter an event (D22). |
| REQ-ACC-59 | A braking event shall be valid only if speed does not rise by more than `GEAR_DIP_MAX_LOSS_MPS` for longer than `GEAR_DIP_MAX_S` during it. This tolerates a brief release and re-application of the brake. Otherwise the event is interrupted and not reported for that target. |

Events from one stop share data. A single stop from 130 km/h yields four events, one for each target, and all four are reported from that stop (D17).

---

## 6. Calculated results

### 6.1 Acceleration results

Each result is an elapsed time, and for the distance-based group also a trap speed. Targets are measured per REQ-ACC-76 to REQ-ACC-80.

| ID | Metric | Definition |
|---|---|---|
| REQ-ACC-60 | **Standing start 0–100 km/h** | Time from time zero to the first crossing of 100 km/h. |
| REQ-ACC-61 | **Standing start 0–100 mph** | As above, for 100 mph. |
| REQ-ACC-62 | **1/8 mile** | Time to 201.168 m from time zero, and trap speed at that point. |
| REQ-ACC-63 | **1/4 mile** | Time to 402.336 m from time zero, and trap speed at that point. |
| REQ-ACC-64 | **400 m** | Time to 400 m from time zero, and trap speed at that point. |
| REQ-ACC-65 | **1000 m** | Time to 1000 m from time zero, and trap speed at that point. |
| REQ-ACC-66 | **Rolling 30–80 km/h** | Time from the first upward crossing of 30 km/h to the first crossing of 80 km/h within one acceleration phase. |
| REQ-ACC-67 | **Rolling 50–100 km/h** | As above, for 50 and 100 km/h. |
| REQ-ACC-68 | **Rolling 80–130 km/h** | As above, for 80 and 130 km/h. |
| REQ-ACC-69 | **Peak acceleration** | Highest windowed acceleration in the phase, in G. |
| REQ-ACC-70 | **Phase summary** | Maximum speed, duration and distance of the phase. |

### 6.2 Deceleration results

Each braking event (REQ-ACC-58) is reported with its time and distance.

| ID | Metric | Definition |
|---|---|---|
| REQ-ACC-71 | **130–0 km/h** | Time and distance from the downward crossing of 130 km/h to standstill. |
| REQ-ACC-72 | **100–0 km/h** | As above, from 100 km/h. |
| REQ-ACC-73 | **80–0 km/h** | As above, from 80 km/h. |
| REQ-ACC-74 | **50–0 km/h** | As above, from 50 km/h. |

### 6.3 Calculation rules

| ID | Requirement |
|---|---|
| REQ-ACC-76 | Crossing times shall be linearly interpolated between the two fixes that bracket the target speed. |
| REQ-ACC-77 | Distances shall be computed by integrating device speed over time (trapezoidal rule). This applies to the distance marks of §6.1, the distance of §6.2 and the phase distance of REQ-ACC-70. Point-to-point distance shall be stored alongside as a cross-check, because it is noisier at low fix rates. |
| REQ-ACC-78 | Device speed (REQ-GPS-5) is the primary source. Where a fix in an event has no device speed, speed shall be derived from positions (`impliedSpeed` in `src/core/geo.ts`), and the event flagged (§9). |
| REQ-ACC-79 | Peak acceleration and the chart (§7) may use a smoothed speed signal. Crossing times, trap speeds and distances shall use unsmoothed device speed. |
| REQ-ACC-80 | A rolling window shall be measured within a single acceleration phase (REQ-ACC-50 allows dips inside it). It shall not require standstill. |
| REQ-ACC-81 | Braking times and distances shall be measured over the same interval, from the downward crossing of the target to the first fix below standstill. |
| REQ-ACC-82 | Times shall be shown to 0.01 s. Distances shall be shown in metres, or feet where the units setting is miles (REQ-SET-1). The distance marks of §6.1 keep their definitions in metres. |

### 6.4 Presentation

| ID | Requirement |
|---|---|
| REQ-ACC-83 | The target labels (0–100 km/h, 0–100 mph, 130–0 km/h and so on) are fixed by their definitions and do not change with the units setting (REQ-SET-1). |
| REQ-ACC-84 | Trap speeds shall be shown in both km/h and mph. |
| REQ-ACC-85 | Each tab shall show a table of its results, one row per event, with the best value per metric marked. For braking, the best is the shortest time and the shortest distance. |
| REQ-ACC-86 | Each tab shall state the number of events found, the number of braking events interrupted (REQ-ACC-59) and the number of fixes ignored (standstill, post-phase, or below the accuracy limit in REQ-ACC-87). |
| REQ-ACC-88 | A target that the event does not reach shall display as **not reached**, and is not an error. A bicycle will normally not reach 80 km/h or more. |

### 6.5 Fix quality inside an event

| ID | Requirement |
|---|---|
| REQ-ACC-87 | Fixes whose horizontal accuracy is above `EXCLUDE_ACCURACY_M` (proposed 10 m) shall be excluded from crossing and distance calculations. Their exclusion shall be counted (REQ-ACC-86). |
| REQ-ACC-89 | If exclusion or a gap leaves no fix near a target crossing, that target shall display as **not measured** rather than an estimate. |

---

## 7. Charts

| ID | Requirement |
|---|---|
| REQ-ACC-90 | Each acceleration phase and each braking event shall have a chart, shown on the tab that holds it. |
| REQ-ACC-91 | The Y axis shall be acceleration in G (REQ-ACC-83 notes the definition). Acceleration is positive and deceleration is negative, so the two kinds read on one scale (D15). |
| REQ-ACC-92 | The X axis shall be time in seconds from the event's time zero: time zero of a standing start (REQ-ACC-41); the upward crossing of the start speed for a rolling window; the downward crossing of the target for a braking event (D16). |
| REQ-ACC-93 | Plotted values shall be the windowed acceleration from device speed, smoothed as REQ-ACC-79 allows. The smoothing window shall be stated in the chart caption. |
| REQ-ACC-94 | The chart shall mark the crossings of its targets (for example, 100 km/h) and the end of the event. |
| REQ-ACC-95 | The chart shall be drawn as SVG or canvas without a charting-library dependency, as REQ-NAV-20 requires for the elevation profile. |
| REQ-ACC-96 | The chart shall have labelled axes and grid lines, and shall be readable in portrait orientation. Touching or moving a cursor across it shall show the time and G at that point. |
| REQ-ACC-97 | The user shall be able to choose one or more events of the same kind and overlay them on one chart, to compare runs or stops. |
| REQ-ACC-98 | Chart series shall be derived from the stored fixes when the log is opened. They need not be stored separately. |

---

### 7.1 Export

| ID | Requirement |
|---|---|
| REQ-ACC-160 | Performance logs shall be exportable only in the form that suits their measurements, described below. Route logs keep the GPX and KML export of REQ-EXP-1 to REQ-EXP-10. |
| REQ-ACC-161 | An acceleration export shall contain, for each event of the Acceleration tab, its chart (positive G) and these figures: time, distance, average acceleration and maximum acceleration over the measured span. Average acceleration is the change in speed divided by the time over the measured span. |
| REQ-ACC-162 | A deceleration export shall contain, for each event of the Deceleration tab, its chart (negative G) and these figures: time, distance, maximum deceleration and average deceleration. |
| REQ-ACC-163 | The selected event shall be exported as one PNG image showing its chart and figures, shared through the share sheet (REQ-EXP-3), with the plain download fallback (REQ-EXP-6). One image is shared at a time. The image is prepared when the event is selected, so that the share sheet opens within the tap. |
| REQ-ACC-164 | Exporting shall not alter the stored log (REQ-EXP-7). |

## 8. Live wanted-speed alert (Deceleration tab)

The Deceleration tab lets the user set a **wanted speed**. While a log is recording, the app alerts the driver when the vehicle reaches that speed, so they know when to start braking. The alert is live: it runs on fixes as they arrive, not after Stop.

### 8.1 Setting the wanted speed

| ID | Requirement |
|---|---|
| REQ-ACC-140 | The Deceleration tab shall have a **Wanted speed** control with four presets: 130, 100, 80 and 50 km/h, the same targets as §6.2. |
| REQ-ACC-141 | A custom wanted speed may be entered, between 20 and 250 km/h (or the mph equivalent). Values outside that range shall be rejected with a message. |
| REQ-ACC-142 | The wanted speed may be set, changed or set to **Off** at any time: before Start, while recording and after Stop. A change while recording takes effect at once. |
| REQ-ACC-143 | The last wanted speed shall be remembered across restarts (REQ-SET-9). |

### 8.2 When the alert fires

| ID | Requirement |
|---|---|
| REQ-ACC-145 | The alert shall be armed only while a log is recording and a wanted speed is set. |
| REQ-ACC-146 | The alert shall fire when device speed (REQ-GPS-5) rises to the wanted speed, evaluated on each fix as it arrives. |
| REQ-ACC-147 | Each approach to the wanted speed shall fire the alert once. After it fires, the alert re-arms when speed falls below the wanted speed minus `ALERT_HYSTERESIS_KMH` (proposed 5 km/h), or on standstill. This stops repeated alarms while speed hovers around the target (D21). |
| REQ-ACC-148 | Latency: the alert shall fire no later than the first fix at or above the wanted speed. Fixes arrive at about 1 Hz on the PWA, so up to a second late is possible. The alert may fire earlier, at the predicted crossing time from recent acceleration (D18). |
| REQ-ACC-149 | The moment the alert fires shall be stored with the log as an event marker, not as a fix. The Deceleration tab shall show it, so it can be compared with the braking events of §5.3. |

### 8.3 What the driver sees and hears

| ID | Requirement |
|---|---|
| REQ-ACC-150 | When the alert fires it shall (a) play a loud, repeated audible signal (for example three beeps over about 2 s) at the alert volume set in Settings, default maximum, audible over road and engine noise; (b) blink the whole screen between white and a high-contrast colour, at no more than 3 flashes per second, for `ALERT_DURATION_S` (proposed 3 s); (c) vibrate where the device supports it. Vibration can be turned off in Settings. |
| REQ-ACC-151 | The alert shall stop after `ALERT_DURATION_S`, or at once on a single tap anywhere on the screen. |
| REQ-ACC-152 | The sound shall be enough to notice the alert without looking at the screen. The blink is an addition and is not the only signal. |
| REQ-ACC-153 | PWA: browsers allow sound only after a user gesture. The app shall unlock audio when Start is pressed, and shall show a warning if audio is still blocked. |
| REQ-ACC-154 | APK: while the wanted speed is armed, the screen shall be kept awake, as an exception to REQ-BG-10 for this mode only, so the blink can be seen. Sound and vibration shall play from the foreground service with the screen off or locked. Waking the screen is attempted where Android permits (D19). |

### 8.4 Implementation and tests

| ID | Requirement |
|---|---|
| REQ-ACC-155 | The alert trigger (arming, firing, hysteresis and re-arming) shall be a pure function of the fix stream in `src/core`, with unit tests. Sound, blink and vibration are platform-specific and shall sit behind an interface, as REQ-PLAT-5 does for location. |
| REQ-ACC-156 | Unit tests shall cover at least: an upward crossing fires once; speed oscillating around the target does not refire within the hysteresis; re-arming after standstill; no alert when not recording; no alert when the wanted speed is Off. |

### 8.5 Use and safety

| ID | Requirement |
|---|---|
| REQ-ACC-157 | The app shall show a one-time notice when a wanted speed is first set. The notice shall say that the alert is for use only where it is safe and lawful to brake hard, and that the screen must not be operated while driving. |
| REQ-ACC-158 | The alert is a timing aid for controlled tests. It is not a driver-assistance or braking-control feature, and it shall not be described as one in the app. |

## 9. Validity and confidence

Each event carries a validity state: **Valid**, or **Flagged** with one or more reasons.

| ID | Requirement |
|---|---|
| REQ-ACC-100 | An event shall be flagged if any of the following holds: (a) a fix within the event has accuracy above `READY_ACCURACY_M`; (b) speed was derived rather than reported (REQ-ACC-78); (c) a gap of more than 2 s between fixes lies inside the event; (d) the log never reached **Ready** before the event began; (e) the peak acceleration exceeds `MAX_PLAUSIBLE_MPS2` (proposed 30 m/s², about 3 G), which indicates a speed error. |
| REQ-ACC-101 | Flagged events shall still show their results, marked with their reasons. They shall not be removed silently. |
| REQ-ACC-102 | The average fix rate within each event shall be shown. An event whose rate is below 5 Hz shall be flagged as low-rate (D2). |

---

## 10. Storage

### 10.1 Log metadata

| ID | Requirement |
|---|---|
| REQ-ACC-105 | A log shall carry a type: `route` (the main recorder, the default for existing logs) or `performance`. Logs started from the Performance screen are of type `performance`. |
| REQ-ACC-106 | The type shall be shown in the Logs list, so that performance logs can be told apart from route logs. |
| REQ-ACC-107 | Performance logs shall be stored, exported and deleted as any other log (REQ-EXP-1, REQ-NAV-8). |

### 10.2 Cached results

| ID | Requirement |
|---|---|
| REQ-ACC-108 | The results of both tabs shall be cached with the log, as REQ-STAT caching is, together with a version number of the analysis algorithm. |
| REQ-ACC-109 | When the cached version number differs from the current one, the results shall be recalculated the next time the log is opened. |
| REQ-ACC-110 | Analysis constants (§13) shall be held in one module, so that they can be changed without touching the screen code. |
| REQ-ACC-111 | Analysis may be run on any performance log, including one marked unfinished (REQ-REC-16). |

---

## 11. Interaction with the rest of the app

| ID | Requirement |
|---|---|
| REQ-ACC-115 | Only one log may be open at a time. While a route log is recording or paused, the Performance Start is disabled, and the reverse also applies. |
| REQ-ACC-116 | Performance logs and route logs shall use the same recorder, so the location-permission, wake-lock, recovery and storage rules apply to both. |
| REQ-ACC-117 | Performance logs shall be viewable in the Logs list with the Statistics, Map and Elevation profile tabs (REQ-NAV-10). The acceleration and deceleration results appear on the Performance screen. |
| REQ-ACC-118 | Whether the main-screen statistics panel shows performance logs is open (D10). |
| REQ-ACC-119 | On opening, the Performance screen shall show the most recent performance log's results, with a selector to choose any other performance log. Both tabs use the same selector. |
| REQ-ACC-120 | The new screen shall use the navigation pattern of `App.tsx`. The top bar keeps Logs and Settings, and adds the **Performance** button (label: D13). |

---

## 12. Changes to the existing requirements

These changes apply to the Performance screen only. The reviewer should accept or reject each one before any existing requirement is amended.

| Existing | Conflict | Proposed handling |
|---|---|---|
| REQ-GEN-3 — cleaning up tracks is left to other tools | The analysis filters the log and crops it to phases and events. | The analysis is read-only. It produces results and charts and does not change stored fixes or exports. Route logs keep REQ-GEN-3 unchanged. |
| REQ-SET-3 — no sampling-frequency setting | The screen needs the highest available rate (REQ-ACC-30). | A fixed rate for this screen only, with no setting. |
| REQ-STAT-1 — the main screen shows statistics only | The Performance screen is a separate screen with its own tables and charts. | No change to the main screen beyond D10. |
| REQ-GPS-1 — the acquisition gate | Readiness is a stricter test than acquisition. | Both apply. Acquisition gates recording; readiness only drives the indicator (REQ-ACC-12, REQ-ACC-25). |

---

## 13. Analysis constants

Proposed values, held in one module (REQ-ACC-110). All are to be tuned against recorded runs.

| Constant | Proposed | Used in |
|---|---|---|
| `G_MPS2` | 9.80665 m/s² | §7, REQ-ACC-69 |
| `STANDSTILL_MPS` | 0.5 m/s | REQ-ACC-41, REQ-ACC-42, REQ-ACC-58 |
| `MIN_ACCEL_MPS2` | 0.3 m/s² | REQ-ACC-50 |
| `GEAR_DIP_MAX_S` | 1.0 s, the maximum | REQ-ACC-50, REQ-ACC-53, REQ-ACC-59 |
| `GEAR_DIP_MAX_LOSS_MPS` | 0.8 m/s (about 3 km/h) | REQ-ACC-50, REQ-ACC-59 |
| `READY_ACCURACY_M` | 5 m | REQ-ACC-21, REQ-ACC-23, REQ-ACC-100 |
| `READY_SUSTAIN_S` | 5 s | REQ-ACC-21 |
| `READY_MIN_SATELLITES` | 6 | REQ-ACC-21 |
| `EXCLUDE_ACCURACY_M` | 10 m | REQ-ACC-87 |
| `MAX_PLAUSIBLE_MPS2` | 30 m/s² | REQ-ACC-100 |
| Minimum fix rate | 5 Hz | REQ-ACC-30, REQ-ACC-102 |
| Vehicle parameter sets | motorcycle, car, bicycle, identical values to start | REQ-ACC-7 |
| `ALERT_HYSTERESIS_KMH` | 5 km/h | REQ-ACC-147 |
| `ALERT_DURATION_S` | 3 s | REQ-ACC-150, REQ-ACC-151 |
| Alert flash rate limit | 3 per second | REQ-ACC-150 |

---

## 14. Non-functional and verification

| ID | Requirement |
|---|---|
| REQ-ACC-130 | Analysis of a one-hour log at 5 Hz shall complete in under 3 seconds on a mid-range Android phone. |
| REQ-ACC-131 | The analysis shall work offline (REQ-STO-6). |
| REQ-ACC-132 | The analysis shall be implemented as pure functions in `src/core`, with unit tests. |
| REQ-ACC-133 | The unit tests shall use synthetic logs with known profiles, including: a clean standing start; a launch with one gear-change dip shorter than the limit; a launch with a dip longer than the limit (which must end the phase); a rolling window started above standstill; a rolling window containing a dip; a cruise after a phase; a stationary start with GPS jitter; a log that ends during acceleration; a braking from 130 km/h to standstill with a brake release; a braking that is interrupted by re-acceleration. |
| REQ-ACC-134 | The results for each synthetic profile shall match the expected figures within a tolerance stated in the test. |
| REQ-ACC-135 | The chart series shall be tested to match the analysis input for the same event. |
| REQ-ACC-136 | Field acceptance: for 0–100 km/h, results shall agree within ±0.1 s of a reference timing on the same run. For the 130–0 km/h braking distance, results shall agree within a tolerance to be set in review. Both targets are to be confirmed, along with the reference method. |

---

## 15. Out of scope for version 1

- Gear detection. GPS cannot see the gearbox, so gear is a label the user may add (D5), not a measurement.
- Pause and Cancel on the screen (D7).
- Vehicle-specific profiles or handicap calculations.
- Wheel-slip, traction and ABS detection. A wheel spin appears as acceleration in the data and is not separated out.
- Targets beyond those listed in §6. New targets can be added later with a definition in this document.
- Wanted-speed alerts on the Acceleration tab, such as a shift-point alert. Only deceleration has an alert in version 1.

---

## 16. Decisions for review

| # | Question | Proposal |
|---|---|---|
| D1 | Ready thresholds (§3.3). Is 5 m accuracy for 5 s, with 6 satellites, the right definition of "very precise"? | Use the proposed values and tune after field testing. |
| D2 | **Resolved 2026-11-25.** Recording rate. Precision matters more than battery use. | Use the highest rate the device offers. |
| D3 | **Resolved 2026-11-25.** Metric list. The user confirmed the list in §6.1 and §6.2. | No further change. |
| D4 | **Partly resolved 2026-11-25.** Gear-dip duration is capped at 1.0 s. Are the speed-loss limit (about 3 km/h) and the brake-release tolerance right? | Keep 0.8 m/s for all vehicles for now. Tune per vehicle (REQ-ACC-7) once there is data. |
| D5 | **Resolved 2026-11-25.** Vehicle type: motorcycle (default), car or bicycle. | Selectable on the Performance screen, and changeable per stored log in the log viewer (REQ-ACC-7). Gear is not recorded in version 1. |
| D6 | **Resolved 2026-11-25.** Rolling windows use acceleration phases that start above standstill (REQ-ACC-53). | Confirmed. |
| D7 | Pause and Cancel on the screen (REQ-ACC-17). | Out of version 1. |
| D8 | Should the PWA include the screen? (REQ-ACC-22, REQ-ACC-33.) | Yes, with an indicative-only notice. |
| D9 | Should the constants in §13 be user-tunable in Settings? | No in version 1. Keep them in one module. |
| D10 | Should performance logs appear in the main-screen statistics panel (REQ-STAT-2, REQ-STAT-3)? | No. The Performance screen shows their results. |
| D11 | **Resolved 2026-11-25.** Exports are allowed, in the form that suits each measurement (§7.1). | Confirmed as §7.1 describes. |
| D12 | Should bicycles see the same targets, with "not reached" where they do not apply? | Yes. |
| D13 | Label of the top-bar button **Performance** on narrow phones: keep the word, abbreviate, or use an icon? | Decide after a screenshot on the target phone. |
| D14 | **Resolved 2026-11-25.** Screen name. | Renamed to **Performance**, with tabs Acceleration and Deceleration. |
| D15 | **Resolved 2026-11-25.** Chart sign by type. | Acceleration charts show positive G. Deceleration charts show negative G. |
| D16 | Chart time origin (REQ-ACC-92). One chart per event, with time zero at the event's start crossing? | Yes. |
| D17 | Braking events from one stop share data (§5.3). Report all four targets from the same stop? | Yes. |
| D23 | **Open.** Android update interval. The community background-geolocation plugin hard-codes a 1 s interval in its Android service (`setInterval(1000)`), so the 5 Hz target (REQ-ACC-30) cannot be reached by configuration. | (a) A small native Capacitor plugin that requests high-rate fixes for performance logs, keeping the foreground-service model. Needs an Android build to verify. (b) A fork of the community plugin. (c) Accept 1 Hz on the APK; every performance result is then flagged low-rate. Proposal: (a). |
| D24 | **Open.** Verification on a device. The screens were checked by render tests and a production build, but not driven in a browser or on a phone. | Test on a phone with a short run on a closed road before relying on the numbers. |
| D18 | Alert timing (REQ-ACC-148). Fire on the first fix at or above the wanted speed, or predict the crossing from recent acceleration to hide the GPS delay? | Predict, so the alert lands near the true crossing. Test against the first-fix method on real runs. |
| D19 | Screen off in the APK (REQ-ACC-154). Should the app try to wake the screen, or only sound and vibrate? | Try to wake the screen where Android permits, and always sound. |
| D20 | Safety. Should the alert be restricted to passenger-operated use, or is the one-time notice enough? | The notice is enough for version 1. The user decides how the phone is used during tests. |
| D21 | Re-arm rule (REQ-ACC-147). Is a 5 km/h drop below the wanted speed the right point to re-arm, or should the alert fire once per stop? | 5 km/h, so each approach alerts once. |
| D22 | **Resolved 2026-11-25.** Does the wanted-speed alert start a braking event? | No. Only actual braking starts an event (REQ-ACC-58). |

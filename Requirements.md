# GPS Logger — Requirements

**Status:** draft 2
**Date:** 2026-11-19
**Related:** [AppType_Analysis.md](AppType_Analysis.md), [Requirements_Analysis.md](Requirements_Analysis.md)

> Draft 2 incorporates the decisions taken on blockers B1–B3, traps T1–T4,
> ambiguities A1–A8 and gaps G1–G9. See
> [Requirements_Analysis.md](Requirements_Analysis.md) §8 for the decision log.

---

## 1. Platform

| ID | Requirement |
|---|---|
| REQ-PLAT-1 | The app shall be built as a PWA (HTML / TypeScript), installable from a web page. |
| REQ-PLAT-2 | The PWA shall subsequently be wrapped with Capacitor and distributed as an Android APK. |
| REQ-PLAT-3 | Both builds shall share one codebase. |
| REQ-PLAT-5 | The recorder shall obtain positions through a single location-source interface, with one implementation per build (browser geolocation for the PWA, background plugin for the APK). The rest of the app shall not depend on which is in use. |
| REQ-PLAT-6 | The location-source interface shall deliver positions as **batches** (an array of fixes per callback), since native background providers may deliver several fixes at once. The browser implementation shall deliver single-element batches. |
| REQ-PLAT-4 | Recording with the screen off and the app in the background is required for real use. This is provided by the APK build (REQ-PLAT-2) only; the PWA build is a development and testing stage and is not expected to record with the screen off. Behaviour for each build is specified in §10. |

## 2. Purpose

| ID | Requirement |
|---|---|
| REQ-GEN-1 | The app shall record GPS position tracks while the user is driving a car, riding a motorbike, cycling, or engaged in any other form of movement. |
| REQ-GEN-2 | Expected speed ranges: bicycle 10–30 km/h, car 30–150 km/h, motorbike 30–200 km/h. |
| REQ-GEN-3 | The app is a recorder. Cleaning up tracks — removing stationary drift, altitude noise and speed outliers — is expected to be done afterwards in other tools, and is not a requirement of this app. |

## 3. Recording controls

The main screen shall provide four recording controls: **Start**, **Stop**, **Pause**, **Cancel**.

### 3.0 Initial state

| ID | Requirement |
|---|---|
| REQ-REC-0 | When the app is opened, only the Start button shall be enabled. The Stop, Pause and Cancel buttons shall be disabled. |

### 3.1 Start

| ID | Requirement |
|---|---|
| REQ-REC-1 | **Start** shall begin GPS logging. |
| REQ-REC-2 | The new log shall be named using the pattern `yyyymmdd-hhmm` (year, month, day, hour, minute) in **UTC**. |
| REQ-REC-3 | After **Start** is pressed, the Start button shall become disabled but remain visually highlighted. The highlight indicates that logging is running, including while the app is still waiting for the first satellite fix (REQ-GPS-1). |
| REQ-REC-4 | After **Start** is pressed, the Stop, Pause and Cancel buttons shall be enabled. |

### 3.2 Stop

| ID | Requirement |
|---|---|
| REQ-REC-5 | **Stop** shall finish GPS logging and save the log to local storage (see §7). No file is written to the filesystem at this point; files are produced by Export (see §4.3). |
| REQ-REC-6 | After **Stop** is pressed, the Stop, Pause and Cancel buttons shall be disabled and the Start button shall be enabled. |

### 3.3 Pause / Re-Start

| ID | Requirement |
|---|---|
| REQ-REC-7 | **Pause** shall pause GPS logging and switch off the GPS receiver, so that no power is consumed while paused. |
| REQ-REC-8 | While paused, the button label shall change to **Re-Start**. |
| REQ-REC-9 | Pressing **Re-Start** shall resume logging into the same log, and the button label shall change back to **Pause**. |
| REQ-REC-9a | Because the receiver was switched off (REQ-REC-7), resuming requires the satellite fix to be reacquired. REQ-GPS-1 and REQ-GPS-2 apply again on resume: no positions are recorded until a fix is available, and the "acquiring signal" indication is shown. |
| REQ-REC-10 | While paused, the Start, Stop and Cancel buttons shall be enabled. |
| REQ-REC-10a | While paused, pressing **Start** shall behave identically to pressing **Re-Start**: logging resumes into the same log. Start shall never create a new log while a log is open. |
| REQ-REC-11 | After logging resumes, the Start button shall be disabled and the Stop and Cancel buttons shall be enabled. |

### 3.4 Cancel

| ID | Requirement |
|---|---|
| REQ-REC-12 | **Cancel** shall stop GPS logging and discard the log. |
| REQ-REC-12a | **Cancel** shall require explicit confirmation before the log is discarded. The action is destructive and cannot be undone. |
| REQ-REC-13 | The log's stored record and all its recorded positions shall be deleted. Any file previously produced by Export and handed to another app is outside the app's control and is not affected. |
| REQ-REC-14 | After **Cancel** is pressed, the Stop, Pause and Cancel buttons shall be disabled and the Start button shall be enabled. |

### 3.5 Interrupted recordings

| ID | Requirement |
|---|---|
| REQ-REC-15 | If the app is terminated while a log is open, that log shall be closed automatically the next time the app is started. |
| REQ-REC-16 | A log closed in this way shall be retained with all positions recorded up to the interruption, and shall be marked **"unfinished"** in the list of logs. |
| REQ-REC-17 | After such a recovery the app shall be in the normal initial state (REQ-REC-0). Recording shall not resume automatically. |

### 3.6 Button state summary

| State | Start | Stop | Pause / Re-Start | Cancel |
|---|---|---|---|---|
| Idle (no recording) — including on app open, REQ-REC-0 | Enabled | Disabled | Disabled | Disabled |
| Recording | Disabled, highlighted | Enabled | Enabled (*Pause*) | Enabled |
| Paused | Enabled (resumes, same as *Re-Start* — REQ-REC-10a) | Enabled | Enabled (*Re-Start*) | Enabled |

## 4. Additional screens

### 4.1 List of logs

| ID | Requirement |
|---|---|
| REQ-NAV-1 | A **List of logs** button shall open a separate screen. |
| REQ-NAV-2 | The screen shall list all recorded logs and allow the user to scroll through them. |
| REQ-NAV-3 | The user shall be able to select a log to view. |
| REQ-NAV-4 | The selected log shall be displayed in the dedicated area at the bottom of the screen, using the tabbed view defined in §4.4. |
| REQ-NAV-5 | The screen shall provide an **Export** button. |
| REQ-NAV-6 | **Export** shall export the selected log in the format configured in Settings (KML or GPX). |
| REQ-NAV-8 | Each log in the list shall have a **Delete** button that deletes that log and all its recorded positions. |
| REQ-NAV-8a | **Delete** shall require explicit confirmation before the log is removed. The action is destructive and cannot be undone. |
| REQ-NAV-9 | Logs closed by the recovery process (REQ-REC-16) shall be visibly marked **"unfinished"** in the list. |

### 4.2 Settings

| ID | Requirement |
|---|---|
| REQ-NAV-7 | A **Settings** button shall open a separate screen on which the settings in section 6 can be changed. |

### 4.3 Export and sharing

| ID | Requirement |
|---|---|
| REQ-EXP-1 | Export shall generate a file from the selected log in the format configured in Settings (KML or GPX). |
| REQ-EXP-2 | The generated file shall be named after the log, with the appropriate extension (e.g. `20261119-0914.gpx`). |
| REQ-EXP-3 | Export shall offer a **Share file with…** action that passes the generated file to the operating system's share sheet. |
| REQ-EXP-4 | The share sheet shall allow the user to send the file to any destination installed on the device. This shall include cloud storage services — **Google Drive**, OneDrive, Dropbox and similar — as well as email, messaging apps and local file storage. |
| REQ-EXP-5 | The app shall not require a Google account, cloud sign-in, or any stored credentials. Cloud destinations are reached through the device's share sheet, not through a direct integration with any cloud provider's API. |
| REQ-EXP-6 | Where the share sheet is unavailable, Export shall fall back to a plain file download. |
| REQ-EXP-7 | Exporting shall not alter or delete the stored log; a log may be exported any number of times and in either format. |
| REQ-EXP-8 | GPX export shall write one `<trkpt>` per recorded position, each carrying `<ele>` and `<time>`. |
| REQ-EXP-9 | KML export is a route export only. It is not required to carry timestamps or per-point data, and a plain `<LineString>` is acceptable. GPX (REQ-EXP-8) is the format that preserves the full log. |
| REQ-EXP-10 | Exported files shall always use the units defined by their file formats — decimal degrees for coordinates and **metres** for altitude — irrespective of the display units chosen in Settings. The unit setting (REQ-SET-1) affects the user interface only and shall not reach the export serialisers. |

### 4.4 Log view tabs

| ID | Requirement |
|---|---|
| REQ-NAV-10 | A selected log shall be presented in three tabs: **Statistics**, **Map** and **Elevation profile**. |
| REQ-NAV-11 | The **Statistics** tab shall show the metrics listed in §5. |
| REQ-NAV-12 | The **Map** tab shall draw the recorded track over a map background. |
| REQ-NAV-13 | The **Elevation profile** tab shall plot recorded altitude against distance travelled. |
| REQ-NAV-14 | The Statistics and Elevation profile tabs shall work with no network connection. The Map tab requires a network connection to fetch map tiles and shall display an explanatory message when offline. |
| REQ-NAV-15 | The Map tab shall be implemented with **Leaflet** using **OpenStreetMap** raster tiles. |
| REQ-NAV-16 | The map shall require no API key, account, or billing arrangement with any map provider. |
| REQ-NAV-17 | OpenStreetMap attribution shall be displayed on the map, as required by the OSM tile usage policy. |
| REQ-NAV-18 | The service worker shall not pre-fetch or bulk-cache map tiles. Tiles may be cached only incidentally as they are viewed, in line with the OSM tile usage policy. |
| REQ-NAV-19 | For display only, the track may be simplified (target ≈2,000 points) to keep map panning responsive. Simplification shall not alter the stored log or any exported file. |
| REQ-NAV-20 | The Elevation profile shall be rendered directly as SVG or canvas, without a charting library dependency. |

## 5. Statistics panel

| ID | Requirement |
|---|---|
| REQ-STAT-1 | The bottom portion of the main screen — at least half the screen height — shall display statistics. The main screen shows statistics only; the tabbed view of §4.4 applies to the log list screen. |
| REQ-STAT-2 | While logging is active, the panel shall show statistics for the current log. |
| REQ-STAT-3 | While logging is not active, the panel shall show statistics for the most recent log. |
| REQ-STAT-14 | Where no logs exist, the panel shall show an empty state and no statistics. |

The panel shall display:

| ID | Metric |
|---|---|
| REQ-STAT-4 | Total tracked distance |
| REQ-STAT-5 | Overall time |
| REQ-STAT-6 | Time while moving |
| REQ-STAT-7 | Average speed |
| REQ-STAT-8 | Maximum speed |
| ~~REQ-STAT-9~~ | *Withdrawn 2026-11-19 — average moving speed removed.* |
| REQ-STAT-10 | Minimum height |
| REQ-STAT-11 | Maximum height |
| REQ-STAT-12 | Gained height |
| REQ-STAT-13 | Dropped height |

### 5.1 Definitions

| ID | Definition |
|---|---|
| REQ-STAT-15 | **Overall time** is the elapsed time from Start to Stop, excluding any intervals during which the log was paused. |
| REQ-STAT-16 | **Time while moving** is the total time during which recorded speed was at least 0.5 m/s (1.8 km/h). |
| REQ-STAT-17 | **Average speed** is total distance divided by overall time. |
| REQ-STAT-18 | **Maximum speed** is the highest speed reported by the device during the log. |
| REQ-STAT-19 | **Gained height** and **dropped height** are the sums of positive and negative altitude changes respectively, computed from recorded altitudes without filtering. These figures include GPS altitude noise and are expected to be refined externally (REQ-GEN-3). |

## 6. Settings

### 6.1 Units

| ID | Requirement |
|---|---|
| REQ-SET-1 | The user shall be able to choose between **kilometres** (default) and **miles**. |
| REQ-SET-2 | The unit selection shall also govern height and speed units: kilometres → metres and km/h; miles → feet and mph. |
| REQ-SET-2a | The unit selection affects displayed values only. Stored positions and exported files are unaffected (REQ-EXP-10). |

### 6.2 GPS sampling frequency

| ID | Requirement |
|---|---|
| REQ-SET-3 | The app shall record position fixes at the rate the device delivers them. No sampling frequency setting shall be offered. |
| REQ-SET-4 | Every fix delivered by the device shall be recorded, subject to §8. |
| ~~REQ-SET-5~~ | *Withdrawn 2026-11-16 — user-selectable 0.5–20 Hz range removed.* |

### 6.3 Export format

| ID | Requirement |
|---|---|
| REQ-SET-6 | The user shall be able to choose the export format. |
| REQ-SET-7 | The available options shall be KML and GPX. |
| REQ-SET-8 | The default export format shall be GPX. |

### 6.4 Settings persistence

| ID | Requirement |
|---|---|
| REQ-SET-9 | Settings shall persist across app restarts. |
| REQ-SET-10 | In the PWA build, settings shall be stored in `localStorage`. |
| REQ-SET-11 | In the APK build, settings shall be stored using native preferences (`@capacitor/preferences`, backed by Android `SharedPreferences`) rather than `localStorage`, so that they survive a WebView data clear and are included in Android's app backup. |
| REQ-SET-12 | Settings shall be accessed through a single interface with one implementation per build, so that the rest of the app is unaware of which store is in use. |

## 7. Storage

| ID | Requirement |
|---|---|
| REQ-STO-1 | Logs shall be stored locally on the device in IndexedDB. |
| REQ-STO-2 | Each position fix shall be committed to storage as it is received, not buffered until the log is stopped. |
| REQ-STO-3 | Log metadata and position fixes shall be held in separate object stores, so that appending a fix does not require rewriting the whole log. |
| REQ-STO-4 | The app shall request persistent storage (`navigator.storage.persist()`) so stored logs are not evicted by the browser. |
| REQ-STO-5 | The Settings screen shall display current storage usage. |
| REQ-STO-6 | The app shall function fully offline. No network connection shall be required to record, view, or export a log. The Map tab (REQ-NAV-12) is the sole exception. |

## 8. GPS signal handling

| ID | Requirement |
|---|---|
| REQ-GPS-1 | After **Start** is pressed, the app shall wait for a valid satellite fix before recording any position. |
| REQ-GPS-2 | While waiting for a fix, the app shall display an "acquiring signal" indication. |
| REQ-GPS-3 | No position shall be recorded while there is no GPS signal. |
| REQ-GPS-4 | Loss and reacquisition of signal shall not be specially marked. The log is a single continuous track; gaps are left to be dealt with in other tools (REQ-GEN-3). |
| REQ-GPS-5 | Speed shall be taken from the value reported by the device where available, rather than derived from successive positions. |
| REQ-GPS-6 | The app shall display a read-only indication of the rate at which position fixes are currently being received (e.g. "1.0 Hz"), so that a healthy or degraded signal is visible to the user. This is an indicator only and is not configurable (REQ-SET-3). |
| REQ-GPS-7 | Fixes that carry no altitude value require no special handling. Height statistics (REQ-STAT-10…13) reflect whatever altitudes were recorded. |

## 9. Permissions

| ID | Requirement |
|---|---|
| REQ-PERM-1 | Where location permission has not been granted, the app shall display a **Permit Location** button in place of the recording controls. |
| REQ-PERM-2 | In the APK build, **Permit Location** shall open the system location settings for the app. |
| REQ-PERM-3 | In the PWA build, where opening system settings is not possible, **Permit Location** shall re-request the permission and, if it has been permanently denied, display instructions for enabling it manually. |

## 10. Continuous recording and screen state

The two builds achieve uninterrupted recording by different mechanisms. The recorder itself shall behave identically in both.

### 10.1 PWA build — screen stays on

| ID | Requirement |
|---|---|
| REQ-BG-1 | While a log is being recorded, the PWA shall hold a screen wake lock (`navigator.wakeLock.request('screen')`) so that the screen does not switch off and recording continues. |
| REQ-BG-2 | The wake lock shall be acquired when recording starts and released when the log is stopped or cancelled. |
| REQ-BG-3 | The browser releases a wake lock automatically whenever the page becomes hidden. The app shall re-acquire it on `visibilitychange` when the page becomes visible again and a log is still open. |
| REQ-BG-4 | The app shall indicate to the user that the screen is being kept on while recording. |
| REQ-BG-5 | Where the Wake Lock API is unavailable, recording shall still function while the app is in the foreground, and the user shall be warned that the log will stop if the screen switches off. |
| REQ-BG-6 | It is accepted that the PWA cannot record while the screen is off or the app is in the background. |

### 10.2 APK build — records with the screen locked

| ID | Requirement |
|---|---|
| REQ-BG-7 | The APK shall continue recording while the screen is off, the device is locked, and the app is in the background. |
| REQ-BG-8 | Recording shall be performed by an Android foreground service, so that the operating system does not suspend it under Doze or app standby. |
| REQ-BG-9 | A persistent notification shall be shown while recording, indicating that a log is in progress. |
| REQ-BG-10 | The APK shall not keep the screen on. No wake lock shall be held; the user is expected to lock the phone and pocket it. |
| REQ-BG-11 | Recording shall continue without loss of positions if the user interface is destroyed by the operating system while the service is still running. |
| REQ-BG-12 | When the app is reopened during an active recording, it shall restore the Recording state and bring the statistics panel up to date with all positions recorded while it was closed. This supersedes REQ-REC-0 for that case. |
| REQ-BG-13 | The app shall request the location permission required for background operation, and shall guide the user to grant "Allow all the time" where the system requires this to be set manually. |
| REQ-BG-14 | The app shall offer to request exemption from battery optimisation, and shall provide guidance for vendor-specific power management where recording is being terminated by the system. |

---

*Note: the source text for REQ-SET-7 / REQ-NAV-6 wrote "KLM"; recorded here as KML (Keyhole Markup Language).*

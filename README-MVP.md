# Room Scanning MVP

This repository contains the first usable implementation of the Room Scanning product specification in `README.md`.

## Public landing page

The responsive landing page at `/` explains the product, the current scan workflow, privacy model, and MVP boundaries. Its primary calls to action open the planner at `/app.html`.

## What works now

- A local-first, installable web planner for one occupied room.
- Editable metric room dimensions, scanned openings, and furniture footprints.
- Import/export of the Room Scanning JSON format.
- A SwiftUI iOS capture companion source using Apple RoomPlan on supported LiDAR devices.
- Provenance labels for measured, estimated, known, and user-confirmed values.
- Furniture positioning by dragging, rotating, locking, adding, and correcting footprints.
- Deterministic candidate generation with boundary, overlap, door-approach, and clear-route checks.
- Balanced, maximum-open-space, easy-cleaning, and daily-comfort planning modes.
- A practical move checklist, assisted-lift cautions, and completion tracking.
- Offline access after the first successful visit through a service worker.
- Local JSON export and a control that clears the app's saved browser data.

## Run and test

The planner is static and has no package dependencies or backend. The repository root is the deployable site root, including the manifest, icon, robots file, and service worker. Serve this directory through HTTPS (or `localhost`) so the service worker can run. The public landing page is `/` and the interactive planner is `/app.html`. For local development use any static file server rooted at this directory.

Run the deterministic geometry tests with:

```sh
node --test
```

The iOS companion is in `ios/RoomScanning`. On macOS with Xcode and XcodeGen, generate the project using `xcodegen generate --spec project.yml`, open the generated project, choose a supported LiDAR iPhone, and run it. End a scan and export `room-scan.json`; import that file into the planner.

## Data format

The iOS companion exports a JSON object with `schemaVersion`, `source`, and `room`. Room dimensions and furniture geometry are in metres. Furniture positions use the room plan's top-left origin. The planner validates dimensions, imports measured properties, and lets the user correct or confirm them before layout generation.

The sample room is clearly marked as example data. The browser does not claim to measure metric depth from an ordinary camera. Until a compatible iOS scan is imported, measurements are user-editable and must be checked.

## Current boundaries

This implements the controlled single-room MVP. It does not yet provide Android capture, web-camera metric scanning, multi-room or whole-home optimization, a cloud account/database, AR preview, full 3D object reconstruction, formal building-code/accessibility certification, or a production iOS device build. The complete product direction, safety expectations, privacy requirements, and later phases remain in the original product specification.

All room state remains in the current browser profile unless a user exports it. Browser storage is not an encrypted vault; users should avoid shared devices and clear local data when appropriate. Raw scan images are not retained by this web planner.



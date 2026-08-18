# Changelog

All notable changes to this project are documented in this file.

## [1.2.0] - 2026-08-18

### Added
- Voice library now grouped by status into four folders under `assets/voice/`:
  `general` (double-click chat), `approval` (awaiting-approval, 10s-throttled),
  `error` (task failed), `done` (task completed). File name is the subtitle.
  Running (green) stays silent; empty groups skip silently.
- 31 new child-voice clips produced from a user-recorded video and shipped
  with the package (7 error / 6 approval / 7 done / 11 general), replacing the
  previous 4 general clips.

### Changed
- `scripts/validate.mjs` now checks every voice group dir is present and
  non-empty instead of a single hard-coded file.

## [1.1.2] - 2026-08-16

### Changed
- All animations now run on a JS frame stepper replicating the Codex V2
  contract's per-frame timing (with a longer hold on the final frame of each
  loop), instead of uniform CSS `steps()`. This makes the motion calmer and
  more natural. Frame timings per row: idle 280/110/110/140/140/320,
  running 120×n+220, waving/jumping 140×n+280, failed 140×7+240,
  waiting/review 150×5+260/280 ms. Look rows keep the 16-frame clockwise
  sweep (250 ms/frame).

## [1.1.1] - 2026-08-16

### Fixed
- Voice loading delay on double-click / completion: each voice file is now
  preloaded into its own `Audio` element when the voice list syncs, so playing
  starts instantly instead of fetching the file on every play. Subtitle timing
  is unchanged (still aligned to the preloaded element's real duration).

## [1.1.0] - 2026-08-16

### Added
- State-driven animations using all 11 Codex V2 atlas rows:
  - Drag direction: drag left → run-left, drag right → run-right, drag up → jump.
  - Task state: project error → sad (failed row), completion → happy jump,
    awaiting approval → waiting pose, done-unread → review pose, own session
    running → working pose.
  - Idle look-around: a continuous 16-frame clockwise sweep across look rows
    9 → 10, played left-to-right.
- Animation state machine (drag > transient event > task state > look > idle)
  with generation counters to prevent stale timers overriding newer states.

## [1.0.0] - 2026-08-16

### Added
- First public release as a persistent DSH web-profile plugin.
- Draggable Foxbell pet in the bottom-right corner of the DSH Web UI.
- Multi-project status monitor: one card per active project with status lights
  (green running / yellow awaiting approval / red failed-or-disconnected /
  blue done-unread).
- Click a project card to switch to that conversation and mark it read;
  done and error cards disappear once opened, and light up again on a fresh
  event.
- Completion voice alert: random `voice/*.m4a` + wave + subtitle aligned to
  audio length.
- Voice interactions: single-click = wave only; double-click = speak + wave;
  clicking a card = switch only (no sound).
- 🦊 show/hide switch next to the sidebar Settings icon, persisted in
  `localStorage`.
- Equal-width multi-line project cards (bold title + status dot + latest
  progress).
- Assets bundled in the package (`assets/`), read at runtime — install & go.

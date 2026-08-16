# Changelog

All notable changes to this project are documented in this file.

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

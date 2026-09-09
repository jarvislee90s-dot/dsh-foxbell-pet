# dsh-foxbell-pet

[中文](README.md) · [English](README.en.md)

A draggable **multi-pet desktop-pet system** for the DeepSeek Harness (DSH) Web UI — bottom-right of the page, with multi-project status monitoring, voice alerts, a full **external pet system** (store / 4-source import / hot-swap / integrity guard), and a 🦊 show/hide switch. One built-in pet, Foxbell the fox, ships inside the package: **install & go** — import more pets anytime and hot-swap with one click.

![Built-in pet Foxbell](reference/桃子衣服粉狐狸形象.png)

> **v2.0.0 targets dsh ≥ 0.1.2-rc.1** (older rc.7/rc.8-era harnesses are no longer supported; see the compatibility table below).
> Starting with this version the status-card color semantics follow MAM: **red = awaiting approval, yellow = running, green = done-unread, dark red + ⚠ = error/disconnected** (v1.x used green/yellow/red/blue). See [CHANGELOG](CHANGELOG.md).

## Screenshots

**Hot swap** — the built-in pet and imported pets are managed side by side; click to switch, effective instantly:

![Switch pet](docs/screenshots/switch-pet.png)

**Right-click menu** — toggles / size / five action bindings (live preview) / switch pet / hide / about:

![Context menu](docs/screenshots/context-menu.png)

**Four import sources** — local folder / zip / Codex pet dir / Petdex online registry:

![Import pet](docs/screenshots/import-codex.png)

## Features

- **Multi-project status monitor** — one card per active project above the pet's head (MAM color semantics):
  - 🔴 `approval` — waiting for your approval (red)
  - 🟡 `running` — in progress (yellow)
  - 🟢 `done` — finished, unread (green; click = confirm & dismiss)
  - 🟥 `error` — turn failed / disconnected (**dark red + ⚠ badge**, clearly distinct from approval red)
- **Click a card to switch sessions** — opens that conversation (`sessions.open`) and marks it read; error/done cards disappear once opened and relight on recurrence.
- **Voice alerts** — completion plays the `done` group, new approval plays `approval` (10s throttle), errors play `error`; subtitle = voice filename, timed to the audio.
- **Voice interactions** — single-click: waves only (silent); double-click: speaks + the configured "double-click action"; card click: switches only (silent).
- **State-driven animations** (all 11 Codex V2 atlas rows; external v1 9-row sheets adapt at runtime) — priority chain: **drag > transient action > task pose > look-around > idle**; drag-direction run/jump, task poses (approval→waiting, running→working), idle 6s triggers a 16-direction look sweep.
- **Drag physics** — gravity fall on release (1400 px/s²), horizontal throw inertia (150ms sampling window), squash-and-bounce landing + a hop (toggleable); the viewport is the work area, with position memory and edge clamping.
- **Right-click menu** — 🔊 sound / 💬 subtitle / 🧲 physics toggles (auto-disabled with tooltips for pets lacking the capability), 📏 three size steps, **five action-binding submenus** (double-click / red / yellow / dark-red / green) with **live preview**, **🔁 switch pet** (current pet checkmarked, click = hot-swap), 🦊 hide, ℹ️ about.
- **External pet system** (ported from MAM v0.3.0) —
  - on-disk store `~/.dsh/foxbell-pet/pets/<id>/`; manifest v2 (atomic write + one `.bak`);
  - **4 import sources**: local folder / zip (host-side safe extraction: ≤100MB total, ≤200 files, path-traversal defense) / Codex pet dir `~/.codex/pets/` / **Petdex online registry** (petdex.dev — both listing and download proxied by the host half: domain allowlist, response size caps, 8s timeout);
  - **unified import wizard**: live pet-id validation (charset / length / reserved `foxbell` / duplicates / Windows reserved device names, enforced both client- and server-side), display name & description, subtitle toggle, voice-group editor (parallel duration probing; 1s < duration < 20s and ≤10MB per file; all four groups complete ⇒ "has voice");
  - **manage dialog**: rename (id synced across folder & manifest), edit display name/description, per-group voice add/remove, subtitle toggle, **safe delete** (after confirmation the folder moves to `~/.dsh/foxbell-pet/.trash/` — never hard-deleted), view folder path; editing the active pet triggers flash-switch protection;
  - **hot swap**: card-style list (built-in foxbell + all external pets) → activation takes effect instantly (sprite/voice/manifest hot-replaced, no page reload);
  - **activation guard**: integrity check on plugin activation and every switch (sheet missing/changed, voices missing/changed/extra, manifest missing); issues ride the state snapshot and open a repair dialog (update manifest / switch back to foxbell / ignore / hide pet); never pops while the pet body is mid-interaction;
  - **voiceless pets**: completion plays animation only, sound toggle disabled with tooltip; **subtitle-less pets**: no speech bubble.
- **Three scale steps** (0.75 / 1 / 1.25) — applied to sprite, cards and menu as a whole (settings card and menu share the same config).
- **Settings card (one card, two sections)** — "Configuration" (sound/subtitle/physics, five action bindings, size) + "Pet management" (current pet, switch/import/manage buttons, Petdex entry); shares one config store with the right-click menu (localStorage + settings scope dual backend, persisted by the host to `~/.dsh/settings.yaml`).
- **🦊 show/hide switch** — sidebar footer (same semantics as v1), persisted in localStorage.
- **Error-code system** — aligned with the MAM PetError table (50 host codes + 8 client-local codes); route errors are uniform `{code, params, detail}` JSON, mapped to zh/en text by the plugin's internal dictionary and rendered inline in dialogs (browser language auto-detected; no harness locale dependency, no toasts).

## Requirements (compatibility)

| Component | Requirement |
|---|---|
| DeepSeek Harness (DSH) | **≥ 0.1.2-rc.1** (Web profile, `dsh web`) |
| rc.1 surfaces used | `session.snapshotEvents()` (B1), `ctx.settings.installSection` (B2), package-edge `dsh.client.inject` semantics (B3 — declared empty: only platform seed modules like react are required) |
| master (0.1.3-alpha.1) | static-diff assessment found no breaking surface (IMPLEMENTATION_NOTES §9) |
| v1.x (rc.7/rc.8 era) | **unsupported** (legacy `session.events` / `installSettingsSection` / `dsh-client-runtime` were removed in rc.1; use plugin v1.3.0 there) |

Built-in assets ship with the package; external pet assets are user-imported.

## Install (one click)

```sh
dsh plugin --profile web add github:jarvislee90s-dot/dsh-foxbell-pet
> Build-script note: since v2 the install runs `prepare` (esbuild). When the dsh
> profile uses pnpm, allow this plugin's build scripts via the profile allowBuilds
> list (pnpm approve-builds or profile config) on first install — otherwise the
> `lib/` artifacts won't be generated.
```

Then **restart `dsh web`** and hard-refresh the browser (**Cmd/Ctrl+Shift+R**). The pet appears bottom-right, the 🦊 toggle beside Settings, and a "foxbell-pet" card in the settings page.

> The pet reads built-in sprite/voices from the package's own `assets/` directory; the external pet store lives in `~/.dsh/foxbell-pet/` (plugin-private, auto-created on first launch).

## Usage

| Interaction | Effect |
|---|---|
| Drag | Move the pet anywhere (direction animations: run left/right, jump when lifted) |
| Release after drag | Gravity fall / throw inertia / squash-and-bounce + hop (disable via "Drop physics") |
| Right-click pet | Menu: toggles / size / five action bindings (live preview) / switch pet / hide / about |
| Single-click pet | Waves (silent) |
| Double-click pet | Speaks a random line + the "double-click action" (subtitle = voice filename) |
| Click a project card | Switch session + mark read (green card confirms & dismisses on click) |
| 🦊 button (sidebar footer) | Show / hide the pet |
| Settings card "Pet management" | Switch / import / manage pets, Petdex gallery entry |

Lights (MAM semantics): **red** approval · **yellow** running · **green** done-unread · **dark red + ⚠** error/disconnected.

## Voice groups

Four fixed groups under `voice/` (built-in: `assets/voice/` in the package; external: `~/.dsh/foxbell-pet/pets/<id>/voice/`). The **filename (minus extension) becomes the subtitle**:

| Folder | Trigger | Notes |
|---|---|---|
| `general/` | double-click | small talk (random, no immediate repeat) |
| `approval/` | approval appears (red) | nagging lines, 10s throttle |
| `error/` | turn error (dark red) | sulky lines |
| `done/` | completion (green) | praise-me lines |

Running (yellow) is silent. Empty groups skip silently; a pet counts as "voiced" only when all four groups are complete.

## Customization (external pets)

- **Import**: settings card → "Import pet" → pick one of four sources (folder / zip / codex / petdex link or search) → configure in the wizard (id / display name / description / subtitles / voice groups) → import → activate now.
- **Asset spec**: Codex V2 sheet `spritesheet.webp` (8 columns; 11 rows 1536×2288 = v2, 9 rows 1536×1872 = v1, auto-detected at runtime), see [docs/SPRITESHEET-CONTRACT.md](docs/SPRITESHEET-CONTRACT.md); audio `.m4a/.mp3/.wav/.ogg/.opus/.flac/.aac`, 1–20s and ≤10MB each.
- **Keep the sprite, change voices**: add/remove per group in the manage dialog, then "Save changes" (manifest backed up & updated automatically).

## Development

```sh
npm install
npm run build      # esbuild: src/host → lib/index.js (ESM), src/client → lib/client.js (single-file iife)
npm run validate   # static checks (legacy checks + bundle purity / declaration parity / route prefix / versions / error-code table / built-in manifest)
npm run typecheck  # tsc --noEmit (client TSX)
npm test           # vitest (pure logic + real-tempdir pipelines + mocked fetch)
```

```
dsh-foxbell-pet/
├── assets/         built-in foxbell assets (sheet + 31 voices + v2 manifest pet.json)
├── lib/            published artifacts (main & ./client entries; esbuild output, committed)
├── src/host/       host half (plain JS: status aggregation/store/import/guard/route family)
├── src/client/     client half (TSX: pet body/menu/settings card/dialogs/error dictionary)
├── test/           vitest suites (real temp dirs, mocked fetch)
├── scripts/        build + validate + built-in manifest generator
├── docs/           sprite contract / QA checklist / screenshots / legacy design docs
├── demo/           standalone offline preview page
├── package.json  dsh.plugin.json  cordis.patch.yml
├── IMPLEMENTATION_NOTES.md   decisions / MAM alignment index / forward-risk assessment
└── README.md  README.en.md  LICENSE  CHANGELOG.md
```

Local dev install: `dsh plugin --profile web add <repo path>` symlinks the repo; after editing `src/`, run `npm run build`, **restart `dsh web`** and hard-refresh.

## License

[MIT](LICENSE)

# dsh-foxbell-pet

[中文](README.md) · [English](README.en.md)

A draggable **Foxbell** desktop pet for the DeepSeek Harness (DSH) Web UI — bottom-right of the page, with multi-project status monitoring, completion voice alerts, and a 🦊 show/hide switch. Assets ship inside the package: **install & go, no manual setup**.

![Foxbell](reference/桃子衣服粉狐狸形象.png)

## Features

- **Multi-project status monitor** — the pet's head shows one card per active project, each with a status light:
  - 🟢 `running` — in progress
  - 🟡 `approval` — waiting for your approval
  - 🔴 `error` — turn failed / disconnected
  - 🔵 `done` — finished, unread
- **Click a card to switch sessions** — opens that conversation in the left sidebar & main area (`sessions.open`), and marks it read. A red/blue card disappears once you've clicked into it; a fresh error lights it up again.
- **Completion voice alert** — when any project finishes, Foxbell jumps happily and plays a random `voice/*.m4a`, subtitle aligned to the audio length.
- **Voice interactions** — single-click the pet: just waves (no sound); double-click: speaks + waves; clicking a project card: only switches (no sound).
- **State-driven animations** (all 11 Codex V2 atlas rows used) — the animation follows interaction and task state:
  - Drag direction: drag left → **run left**, drag right → **run right**, drag up → **jump**;
  - Task state: any project **error** → sad pose, **completion** → happy jump, **awaiting approval** → waiting pose, **done-unread** → review pose, own session running → working pose;
  - While idle it **looks around** (look rows 9→10, a continuous 16-frame left-to-right sweep).
- **🦊 show/hide switch** — a toggle button next to the sidebar Settings icon (like Codex's pet), persisted in `localStorage`.
- **Equal-width card layout** — project bubbles are multi-line cards (bold title + status dot, then up to 2 lines of latest progress), all the same width.

## Requirements

- DeepSeek Harness (DSH) with a Web profile (`dsh web`).
- Assets are bundled in the package — nothing else to download.

## Install (one click)

From anywhere:

```sh
dsh plugin --profile web add github:jarvislee90s-dot/dsh-foxbell-pet
```

Then **restart `dsh web`** and hard-refresh the browser (**Cmd/Ctrl+Shift+R**). The pet appears bottom-right, with the 🦊 toggle beside Settings.

> The pet reads its spritesheet/voices from the package's own `assets/` directory at runtime — no manual placement needed.

## Usage

| Interaction | Effect |
|---|---|
| Drag | Move the pet anywhere |
| Single-click pet | Waving only (no sound) |
| Double-click pet | Speaks a random line + waves (subtitle = the voice name, timed to the audio) |
| Click a project card | Switches to that conversation + marks read (no sound) |
| 🦊 button (sidebar footer) | Show / hide the pet |

Status lights: **green** running · **yellow** awaiting approval · **red** failed/disconnected · **blue** done-unread. Done and error cards hide once you open that conversation; re-occurring status lights it up again.

> ⚠️ The yellow light only appears when the approval policy is `ask` and an approval is actually pending; under `never` approvals auto-reject, so nothing pends.

## Customization

- **Voice**: drop `.m4a`/`.mp4` files into `assets/voice/` of the installed package — the filename becomes the subtitle text. Reinstall/restart to reload.
- **Sprite**: replace `assets/spritesheet.webp` (Codex V2 sheet: 8 columns × 11 rows, 192×208 per frame; rows 0–8 are animations). See [docs/SPRITESHEET-CONTRACT.md](docs/SPRITESHEET-CONTRACT.md).
- **Styles / truncation**: edit `lib/client.js` CSS and the `truncate(…, 24)` calls in `lib/index.js`, then rebuild (`npm run build`) and restart.

## Development

```sh
npm run build     # sync src/ → lib/ (plain JS, no transpile)
npm run validate  # sanity checks: syntax, JSON, forbidden words, assets
```

```
dsh-foxbell-pet/
├── assets/          spritesheet + voices (shipped, read at runtime)
├── lib/             shipped host/client (main + ./client entry)
├── src/             source (same plain JS; build copies to lib/)
├── reference/       design reference image
├── docs/            sprite-sheet contract
├── scripts/         build + validate
├── demo/            standalone sprite preview page
├── package.json  dsh.plugin.json  cordis.patch.yml
└── README.md  README.zh.md  LICENSE  CHANGELOG.md
```

## License

[MIT](LICENSE)

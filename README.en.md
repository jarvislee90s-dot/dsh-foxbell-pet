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
- **Completion voice alert** — when any project finishes, Foxbell plays a random `voice/done/*.m4a` + the **done action** (happy jump by default), subtitle aligned to the audio length.
- **Voice interactions** — single-click the pet: just waves (no sound); double-click: speaks + plays the **double-click action** (waving by default); clicking a project card: only switches (no sound).
- **State-driven animations** (all 11 Codex V2 atlas rows used) — the animation follows interaction and task state:
  - Drag direction: drag left → **run left**, drag right → **run right**, drag up → **jump**;
  - Task state: any project **error** → error action, **completion** → done action, **awaiting approval** → approval action, **done-unread** → review pose, own session running → working pose;
  - While idle it **looks around** (look rows 9→10, a continuous 16-frame left-to-right sweep).
- **🦊 show/hide switch** — a toggle button next to the sidebar Settings icon (like Codex's pet), persisted in `localStorage`.
- **Equal-width card layout** — project bubbles are multi-line cards (bold title + status dot, then up to 2 lines of latest progress), all the same width.
- **Right-click menu** (v1.3.0) — right-click the pet for a menu: 🔊 sound (on = audible) / 💬 subtitle / 🧲 gravity toggles, four-scene action binding (**double-click / yellow / red / blue**), 6 actions to pick (jump/wave/sad/wait/review/work), plus "🦊 hide" and "ℹ️ about".
- **Live action preview** (v1.3.0) — inside any action submenu the pet loops the currently selected action; picking another action switches the preview immediately; "← back" returns to the main menu and stops it.
- **Drag physics** (v1.3.0) — release for **gravity fall**, horizontal **throw inertia**, and a **squash & bounce** on landing (can be disabled; a little hop follows the squash).
- **Position memory** (v1.3.0) — the pet stays where you dropped it after a reload (localStorage, clamped to a 24px right-edge margin).
- **Settings card** (v1.3.0, dsh rc.7+) — a settings-page plugin config section sharing the **same config** as the right-click menu (local `localStorage` + settings scope dual backend, persisted by the host to `~/.dsh/settings.yaml`).

## Efficiency Dashboard (v1.4.0)

Five components + two small enhancements: all aggregation happens host-side and ships with the state snapshot, **zero new permanently-visible UI** (the mini bar only exists while you hover); token numbers are **pure token counts — never converted to money**.

1. **Pace tiers** (duration-pose engine) — the pet's pose follows the event rhythm automatically: active / **long-run "checking the watch"** (turn open but silent ≥3 min, so you notice a hung run) / intense / **loafing** (turn closed and silent ≥15 min, escalating in four steps). Poses switch variants, **never speed**; a tier change plays one short animation; any new event resets immediately.
2. **Token meter** — one counter, three surfaces:
   - **Hover mini bar**: hover the pet for ≈0.5s and a bar appears — pace dial (current tier) + "today × · this session ×" + "N awaiting approval / N running / N done"; **read-only**, disappears when the pointer leaves (right-click "🏷 today's usage" opens it manually; click outside / ESC to close);
   - **Daily-threshold sign**: at 80% / 100% of `dayLimitTokens` the pet holds up a "today you've used X" sign, once per tier — no spamming;
   - **Milestone callout**: crossing a round cumulative-token mark (default 1M, `milestoneUnit`) gets a one-line bubble.
3. **Approval summons chain** — when an approval has been pending ≥5 min (`approvalFlickerMin`) **and the page is hidden**, the tab title rotates "🦊 approval waiting…"; it restores once the approval is decided or you come back. The right-click "🗂 sessions" submenu lists every session (status dot + click to jump).
4. **Summary board** — after a task completes, a temporary "📖 summary" entry appears beside the pet (15s by default) → click it to open a board with this round's recap (sessions / turns / token breakdown / top 3 tools (count + duration) / longest turn / error count); it auto-dismisses after 15s, and ✕ / clicking outside / ESC all close it; hiding the pet hands out one farewell board; right-click "📊 last summary" recalls it anytime.
5. **Expression containers** — content is routed by shape: short numbers → **held sign**, one-liners → speech bubble, details → board; alert voices follow a three-level priority (voice-pack audio > TTS > silence, `ttsEnabled`).

Two small enhancements: **card age tags** — a grey "×s/×m" at the end of each card's activity line, so you can tell "just happened" from "stuck for 5 minutes"; **approval direct-jump** — clicking a card now **smart-jumps**: straight to the approval anchor if one is pending, otherwise to the conversation + mark-as-read.

All of this adds **12 new config keys** (`paceEnabled` / `paceIntenseEvents` / `paceLongrunMin` / `paceLoafStartMin` / `usageEnabled` / `dayLimitTokens` / `milestoneUnit` / `approvalFlickerMin` / `summaryEnabled` / `summaryEntrySec` / `boardTtlSec` / `ttsEnabled`), shared by the settings card and the right-click menu.

### Interaction quick reference (one target, one behavior)

| Click / gesture target | The one behavior |
|---|---|
| Pet body (single-click) | Wave animation (existing) |
| Status card (single-click) | Smart jump: approval pending → approval anchor; otherwise → conversation + mark read |
| 📖 summary entry | Opens the board, then the entry disappears |
| Board ✕ / blank space outside it | Close the board (both equivalent) |
| Mini bar | Not clickable (read-only) |
| New right-click menu items | Today's usage → manual mini bar; last summary → open board; sessions item → smart jump |
| Hover ≈0.5s | Mini bar appears (read-only; gone when the pointer leaves) |
| Drag | Pure physics animation, carries no command (mini bar hides, hover detection pauses) |
| Scroll wheel | Never hijacked over the pet or mini bar — scrolls the page; the board / menu scroll their own content |
| ESC | Closes the topmost overlay, one layer at a time (manual mini bar → board → menu) |

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
| Release after drag | Gravity fall / throw inertia / squash-and-bounce landing + a hop (can disable "gravity") |
| Right-click pet | Opens menu (sound/transcript/gravity toggles, double-click/yellow/red/blue action binding, hide, about) |
| Single-click pet | Waves (no sound) |
| Double-click pet | Speaks a random line + the "double-click action" (waving by default; subtitle = the voice name, timed to the audio) |
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
└── README.md  README.en.md  LICENSE  CHANGELOG.md
```

## License

[MIT](LICENSE)

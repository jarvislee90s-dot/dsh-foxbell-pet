# Changelog

All notable changes to this project are documented in this file.

## [1.3.0] - 2026-08-18

### Added
- 右键菜单：声音/气泡/落地物理开关、双击/黄灯/红灯/蓝灯四场景动作绑定、隐藏、关于
- 四场景动作绑定：双击（dblAction）、待批准黄灯（approvalAction）、报错红灯（errorAction）、完成蓝灯（doneAction），6 种动作可选（跳/挥手/委屈/等待/审查/工作）
- 拖拽物理手感：松手重力坠落、水平抛掷惯性、落地压扁回弹（菜单/设置卡片可关「落地物理」）
- 设置卡片（dsh rc.7+，settings.plugin.item）：与右键菜单读写同一份配置
- 配置持久化：localStorage + settings scope 双后端（~/.dsh/settings.yaml）

### Changed
- 移除「完成时喊」与「戳我动作」独立配置（声音开关已覆盖；单击固定挥手，双击走 dblAction）
- 静音（muted）只拦截发声，不再拦截动作动画（静音 ≠ 静止）
- 「🔊 声音」开关语义修正：开 = 有声（此前 muted 语义反了，显示"开"实际是静音）
- 「💬 气泡」改名「💬 语音字幕」，明确为语音字幕显示开关
- 动作子菜单实时预览：进入子页桌宠循环播当前选中动作，点选其它动作即时预览切换，「← 返回」回主菜单后停止

### Fixed
- 拖拽坠落停止后不再瞬移回右下角：落点 x 记忆到 localStorage（`dyn-pet-foxbell-x`），刷新后停在上次落点

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

# Spritesheet Contract

The pet uses a Codex V2-style sprite sheet: `spritesheet.webp`.

## Layout

Two atlas versions are supported; the runtime adapts automatically
(`spriteVersionNumber`: 1 = v1 nine rows, 2 = v2 eleven rows; probed from the
decoded image size when unknown).

| Item | v1 | v2 |
|---|---|---|
| Columns | 8 | 8 |
| Rows | 9 (no look rows) | 11 |
| Frame size | 192 × 208 px | 192 × 208 px |
| Sheet size | 1536 × 1872 px | 1536 × 2288 px |

Any other size is rejected as invalid (`sheet-bad-size` / import wizard shows
"Invalid sheet size").

## Animation rows (rows 0–8, identical in v1 and v2)

| Row | Animation | Frames | Per-frame durations (ms) |
|---|---|---|---|
| 0 | idle | 6 | 280,110,110,140,140,320 |
| 1 | run-right | 8 | 120×7, 220 |
| 2 | run-left | 8 | 120×7, 220 |
| 3 | waving | 4 | 140×3, 280 |
| 4 | jumping | 5 | 140×4, 280 |
| 5 | failed | 7 | 140×7, 240 |
| 6 | waiting | 6 | 150×5, 260 |
| 7 | running | 6 | 120×5, 220 |
| 8 | review | 6 | 150×5, 280 |

## Look rows (v2 only, rows 9–10)

16-direction clockwise sweep: row 9 columns 0..7 then row 10 columns 0..7,
250 ms per frame, triggered after 6 s of idleness. v1 sheets silently skip the
look animation.

Rendering uses JS frame stepping (`background-position` per frame) — see
`src/client/animations.ts` (`ANIM`, `LOOK_FRAMES`, `frameStyle`).

## Replacing / adding a sprite

- Built-in foxbell: keep the sheet at the v2 spec above, replace
  `assets/spritesheet.webp`, then re-run `node scripts/gen-builtin-manifest.mjs`
  (keeps `assets/pet.json` — the built-in v2 manifest — in sync with disk) and
  reinstall/restart the plugin.
- External pets: import through the wizard (folder / zip / codex / petdex);
  the manifest records `spriteVersionNumber` and `spritesheetSizeBytes`, and the
  activation guard flags later modifications.

## Voice files

`voice/<group>/<file>` with `group ∈ {general, approval, done, error}` (exactly
three path segments; deeper nesting and other group folders are invisible to the
pet system). Extensions: `m4a mp3 wav ogg opus flac aac`. Valid audio is
1 s < duration < 20 s and ≤ 10 MB per file; a pet counts as "voiced" only when
all four groups hold at least one valid file. The **filename (without
extension) becomes the subtitle text** when the pet speaks.

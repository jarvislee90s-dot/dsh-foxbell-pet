# Spritesheet Contract

The pet uses a Codex V2-style sprite sheet: `assets/spritesheet.webp`.

## Layout

| Item | Value |
|---|---|
| Columns | 8 |
| Rows | 11 |
| Frame size | 192 × 208 px |
| Sheet size | 1536 × 2288 px |

## Animation rows (rows 0–8)

| Row | Animation | Frames | Step |
|---|---|---|---|
| 0 | idle | 6 | `0 → -1152px` (x) |
| 3 | waving | 4 | `0 → -768px` (x, y = -624px) |
| 4 | jumping | 5 | `0 → -960px` (x, y = -832px) |

CSS uses `background-size: 1536px 2288px` with `steps(n, end)` per animation
(see the `.dyn-pet-anim-*` rules in `src/client.js`).

## Replacing the sprite

Keep the sheet at the spec above (8 × 11, 192×208 frames) and rows 0–8 as
animations. Replace `assets/spritesheet.webp`, then reinstall/restart the
plugin.

## Voice files

`assets/voice/*.m4a` (or `.mp4`). The **filename (without extension) becomes
the subtitle text** when the pet speaks. Add or remove files freely; the host
loads them at startup.

// animations.ts — Codex V2 图集动画表（MAM petAnimations.ts 原样移植）。
// 8 列 × 11 行（v2）/ 9 行（v1，无 look），每帧 192×208；逐帧时长 + 末帧停顿。

export const FRAME_W = 192;
export const FRAME_H = 208;
export const SHEET_COLS = 8;
export const SHEET_ROWS = 11;

export type PetAnimKey =
  | "idle"
  | "run-right"
  | "run-left"
  | "waving"
  | "jumping"
  | "failed"
  | "waiting"
  | "running"
  | "review"
  | "look";

export const ANIM: Record<Exclude<PetAnimKey, "look">, { row: number; d: number[] }> = {
  idle: { row: 0, d: [280, 110, 110, 140, 140, 320] },
  "run-right": { row: 1, d: [120, 120, 120, 120, 120, 120, 120, 220] },
  "run-left": { row: 2, d: [120, 120, 120, 120, 120, 120, 120, 220] },
  waving: { row: 3, d: [140, 140, 140, 280] },
  jumping: { row: 4, d: [140, 140, 140, 140, 280] },
  failed: { row: 5, d: [140, 140, 140, 140, 140, 140, 140, 240] },
  waiting: { row: 6, d: [150, 150, 150, 150, 150, 260] },
  running: { row: 7, d: [120, 120, 120, 120, 120, 220] },
  review: { row: 8, d: [150, 150, 150, 150, 150, 280] },
};

// look 行 9→10：16 向顺时针连续扫视（行9 列0..7 → 行10 列0..7）
// 用 0 - col*W 而非 -(col)*W：i=0 时后者会产生 -0（vitest toEqual 区分 ±0）
export const LOOK_FRAMES = Array.from({ length: 16 }, (_, i) => ({
  x: 0 - (i % SHEET_COLS) * FRAME_W,
  y: 0 - (i < 8 ? 9 : 10) * FRAME_H,
}));

/** 帧样式：background-position/size（scale 作用于精灵与图集整体；rows=9 时 v1 图集） */
export function frameStyle(
  anim: PetAnimKey,
  frame: number,
  lookFrame: number,
  scale: number,
  rows: 9 | 11 = 11
): { backgroundPosition: string; backgroundSize: string } {
  const w = FRAME_W * scale;
  const h = FRAME_H * scale;
  let x: number;
  let y: number;
  if (anim === "look") {
    const f = LOOK_FRAMES[Math.max(0, Math.min(LOOK_FRAMES.length - 1, lookFrame))];
    x = f.x * scale;
    y = f.y * scale;
  } else {
    const def = ANIM[anim];
    const i = ((frame % def.d.length) + def.d.length) % def.d.length;
    x = -i * w;
    y = -def.row * h;
  }
  return {
    backgroundPosition: `${x}px ${y}px`,
    backgroundSize: `${w * SHEET_COLS}px ${h * rows}px`,
  };
}

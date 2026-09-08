// physics.ts — 拖拽/投掷/坠落纯逻辑（MAM usePetWindow.ts 的数值语义移植到 DOM 定位）。
// Tauri 窗口几何 → 视口为工作区：ground = 视口底 - 精灵高；位置 = 精灵左上角 {x,y}。
// 常量与 MAM 完全一致：GRAVITY 1400 px/s²、DAMP 0.86^(dt·60)、MIN_VX 24、dt 上限 0.05、
// 采样窗 150ms、方向阈值 movedY<-8 / |movedX|>6。

export const GRAVITY = 1400;
export const DAMP = 0.86;
export const MIN_VX = 24;
export const MAX_DT = 0.05;
export const SAMPLE_WINDOW_MS = 150;
export const DIR_UP_THRESHOLD = -8;
export const DIR_X_THRESHOLD = 6;

export interface Sample { t: number; x: number; y: number }

/** 采样窗维护：push 新样本并弹出 150ms 窗口之外的旧样本 */
export function pushSample(samples: Sample[], t: number, x: number, y: number): void {
  samples.push({ t, x, y });
  while (samples.length > 0 && t - samples[0].t > SAMPLE_WINDOW_MS) samples.shift();
}

/** 投掷速度：窗口首末样本差分（vx px/s；vy0 恒 0，垂直只受重力） */
export function throwVelocity(samples: Sample[]): number {
  if (samples.length < 2) return 0;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const dt = (last.t - first.t) / 1000;
  return dt > 0 ? (last.x - first.x) / dt : 0;
}

/** 拖拽方向动画判定（MAM onPointerMove 同款阈值，按采样窗增量） */
export function dragDirection(movedX: number, movedY: number): "jumping" | "run-left" | "run-right" | null {
  if (movedY < DIR_UP_THRESHOLD) return "jumping";
  if (movedX < -DIR_X_THRESHOLD) return "run-left";
  if (movedX > DIR_X_THRESHOLD) return "run-right";
  return null;
}

export interface FallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  landed: boolean;
  rest: boolean;
}

/**
 * 坠落单步积分（MAM stepFall 同款）：
 *   vy += g·dt;  y += vy·dt + ½·g·dt²（用旧 vy 的恒加速度精确积分）
 *   vx *= DAMP^(dt·60);  x += vx·dt
 *   y ≥ ground → 钳到 ground 并置 landed；landed 且 |vx|<MIN_VX → rest
 * x 同时钳制在视口内（DOM 工作区边界）。
 */
export function stepFall(s: FallState, dtRaw: number, groundY: number, minX: number, maxX: number): FallState {
  const dt = Math.min(MAX_DT, dtRaw);
  let vy = s.vy + GRAVITY * dt;
  let y = s.y + s.vy * dt + 0.5 * GRAVITY * dt * dt;
  let vx = s.vx * Math.pow(DAMP, dt * 60);
  let x = s.x + vx * dt;
  let landed = s.landed;
  if (y >= groundY) {
    y = groundY;
    landed = true;
  }
  if (x < minX) { x = minX; vx = 0; }
  if (x > maxX) { x = maxX; vx = 0; }
  const rest = landed && Math.abs(vx) < MIN_VX;
  return { x, y, vx, vy, landed, rest };
}

/** 视口工作区几何：地面 y（精灵顶）与 x 钳制范围 */
export function viewportBounds(vw: number, vh: number, frameW: number, frameH: number, bottomMargin: number) {
  return {
    groundY: vh - bottomMargin - frameH,
    minX: 0,
    maxX: Math.max(0, vw - frameW),
  };
}

/** 位置钳制（启动恢复/窗口缩放时用；MAM clampToWorkArea 同语义） */
export function clampPos(x: number, y: number, frameW: number, frameH: number, vw: number, vh: number, bottomMargin: number) {
  const b = viewportBounds(vw, vh, frameW, frameH, bottomMargin);
  return {
    x: Math.max(b.minX, Math.min(b.maxX, x)),
    y: Math.max(0, Math.min(b.groundY, y)),
  };
}

/** 落地压扁回弹时序（MAM onLand）：60ms 压扁 → 240ms 回弹 → +260ms 清过渡并补跳 1500ms */
export const SQUASH_TIMING = {
  squashMs: 60,
  squashScaleY: 0.55,
  bounceMs: 240,
  bounceEasing: "cubic-bezier(.34,1.56,.64,1)",
  settleMs: 260,
  hopAnimMs: 1500,
} as const;

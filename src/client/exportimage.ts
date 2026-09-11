// exportimage.ts — v2.2 R8 canvas 导出（1200×675 PNG）：标题/hero/趋势折线/口径网格/模型行/宠物立绘+评语。
// 绘制顺序固定（brief 骨架）：暖纸底 → 标题 → hero → 蓝紫渐变趋势折线（#3BA7FF→#8D6BFF）→
// 网格前 4 行 → 模型前 3 行 → 底部立绘（sprite 为空时静默跳过，headless/图集缺失不崩）→ 气泡评语。
import { ANIM } from "./animations";

export interface ExportInput {
  title: string; hero: string; grid: [string, string][]; models: { name: string; val: string }[];
  points: { label: string; value: number }[];
  quote: string; poseRow: number; frameCols: number;
  sprite: HTMLImageElement | null; frameW: number; frameH: number;
}

// ---- 姿态/精灵装配（DashboardPanel 调用；resolvePoseRow/maxAnimCols 纯函数可直测）----

/** pose 配置 → 图集行号：'random' → 按 ANIM 键随机行首帧；未知键兜底第 0 行（idle）。
 *  注：姿态选择作用于行号（spec R8 的 per-pet 变体清单为规格级 nicety，plan 钉死 ANIM 键集）。 */
export function resolvePoseRow(pose: string): number {
  const keys = Object.keys(ANIM) as (keyof typeof ANIM)[];
  if (pose === "random") return ANIM[keys[Math.floor(Math.random() * keys.length)]].row;
  return ANIM[pose as keyof typeof ANIM]?.row ?? 0;
}

/** 帧列数 = ANIM 各行 d 数组最长者（宿主图集 8 列；不读常量以兼容未来行定义变化） */
export function maxAnimCols(): number {
  return Math.max(...Object.values(ANIM).map((a) => a.d.length));
}

/** runtime.spriteUrl → 已解码 Image；无 url/加载失败/超时 → null（导出继续，无立绘） */
export function loadSprite(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((res) => {
    const img = new Image();
    const timer = setTimeout(() => { img.src = ""; res(null); }, 8000);
    img.onload = () => { clearTimeout(timer); res(img); };
    img.onerror = () => { clearTimeout(timer); res(null); };
    img.src = url;
  });
}

// ---- 绘制工具 ----

/** 趋势折线：#3BA7FF→#8D6BFF 水平渐变 stroke + 同渐变淡面积 + 数据点（少于 2 点不画） */
function drawTrend(c: CanvasRenderingContext2D, points: { label: string; value: number }[], x: number, y: number, w: number, h: number): void {
  if (points.length < 2) return;
  const max = Math.max(1, ...points.map((p) => p.value));
  const pts = points.map((p, i) => ({ px: x + (w * i) / (points.length - 1), py: y + h * (1 - p.value / max) }));
  const grad = c.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, "#3BA7FF");
  grad.addColorStop(1, "#8D6BFF");
  c.beginPath();
  c.moveTo(pts[0].px, y + h);
  for (const p of pts) c.lineTo(p.px, p.py);
  c.lineTo(pts[pts.length - 1].px, y + h);
  c.closePath();
  c.globalAlpha = 0.12;
  c.fillStyle = grad;
  c.fill();
  c.globalAlpha = 1;
  c.beginPath();
  pts.forEach((p, i) => (i === 0 ? c.moveTo(p.px, p.py) : c.lineTo(p.px, p.py)));
  c.strokeStyle = grad;
  c.lineWidth = 3;
  c.lineJoin = "round";
  c.lineCap = "round";
  c.stroke();
  for (const p of pts) {
    c.beginPath();
    c.arc(p.px, p.py, 3, 0, Math.PI * 2);
    c.fillStyle = "#8D6BFF";
    c.fill();
  }
}

/** 圆角矩形路径（气泡底） */
function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** 按宽折行（逐字符度量，CJK 友好；显式 \n 强制换行） */
function wrapText(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number): void {
  let line = "";
  let cy = y;
  for (const ch of text) {
    if (ch === "\n" || c.measureText(line + ch).width > maxW) {
      c.fillText(line, x, cy);
      cy += lineH;
      line = ch === "\n" ? "" : ch;
    } else {
      line += ch;
    }
  }
  if (line) c.fillText(line, x, cy);
}

export async function exportDashboardImage(input: ExportInput): Promise<Blob> {
  const W = 1200, H = 675;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#fdf9f3"; c.fillRect(0, 0, W, H);            // 暖纸底
  c.fillStyle = "#2b2b2b"; c.font = "600 30px system-ui"; c.fillText(input.title, 48, 64);
  c.font = "700 64px system-ui"; c.fillText(input.hero, 48, 160);
  c.font = "400 15px system-ui"; c.fillStyle = "#7a6a58";
  drawTrend(c, input.points, 48, 200, W - 96, 150);           // 蓝紫渐变折线（createLinearGradient #3BA7FF→#8D6BFF）
  let y = 400;
  c.fillStyle = "#2b2b2b";
  for (const [k, v] of input.grid.slice(0, 4)) { c.font = "400 16px system-ui"; c.fillText(k, 48, y); c.font = "600 16px system-ui"; c.fillText(v, 300, y); y += 30; }
  y += 8;
  for (const m of input.models.slice(0, 3)) { c.font = "500 15px system-ui"; c.fillText(`${m.name}  ${m.val}`, 48, y); y += 26; }
  // 底部立绘 + 气泡评语（sprite 为 null 时静默跳过——图集缺失/加载失败不阻塞导出）
  if (input.sprite && input.frameW > 0 && input.frameH > 0) {
    const scale = Math.min(200 / input.frameH, 1);
    const dw = input.frameW * scale, dh = input.frameH * scale;
    c.drawImage(input.sprite, 0, input.poseRow * input.frameH, input.frameW, input.frameH, W - dw - 64, H - dh - 48, dw, dh);
  }
  roundRect(c, W - 560, H - 160, 440, 88, 16); c.fillStyle = "#ffffff"; c.fill();
  c.fillStyle = "#4a3b2a"; c.font = "500 18px system-ui";
  wrapText(c, input.quote, W - 544, H - 128, 400, 24);
  return await new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("canvas toBlob returned null"))), "image/png"));
}

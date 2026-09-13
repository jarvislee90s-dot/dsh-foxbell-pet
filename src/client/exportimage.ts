// exportimage.ts — v2.2.1 导出卡（720×1600 竖版浅色，对齐 Codex++ 导出卡版式）：
// 头部（标题+日期范围）→ hero 累计 Token（完整千分位）→ 指标行（label/value）→ 趋势卡 →
// 按 Model 分布（全名+进度条，不截断）→ 工具调用 2×2 → 聊天式底部（评语气泡在左、宠物立绘右下完整可见）→ 页脚。
// 金额/价格元素一律不出现。sprite 为空时静默跳过立绘（headless/图集缺失不崩）。
import { ANIM } from "./animations";

export interface ExportInput {
  rangeLabel: string;                              // 近 7 日 · 09/06–09/12
  hero: string;                                    // 累计 Token 完整千分位
  heroSub: string;                                 // 请求 N 次 · 命中率 Z% · 更新 HH:MM:SS
  metrics: [string, string][];                     // 五口径指标行（不含金额）
  trendTitle: string;                              // 近 7 日趋势
  peakLabel: string;                               // 峰值 X
  points: { label: string; value: number }[];
  models: { name: string; val: string; share: number }[]; // share 0..1（≤6，全名）
  tools2x2: [string, string][];                    // [调用总数, X][平均耗时, X][Top 工具次数, X][Top 工具总耗时, X]
  quote: string;
  poseRow: number; frameW: number; frameH: number;
  sprite: HTMLImageElement | null;
}

// ---- 姿态/精灵装配（DashboardPanel 调用；resolvePoseRow/maxAnimCols 纯函数可直测）----

/** pose 配置 → 图集行号：'random' → 按 ANIM 键随机行首帧；未知键兜底第 0 行（idle）。 */
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

/** 工具 2×2 指标由 DashboardPanel 的 toolsMetrics 装配后传入（本文件只负责绘制）。 */

// ---- 版式常量（720×1600 竖版）----
const W = 720;
const PET_H = 360;            // 导出立绘固定高（不随内容压缩）
let H = 2016;                 // 上界；工具区结束后按内容定稿（见下）
const M = 24;                 // 页边距
const CARD = { x: M, y: M, w: W - M * 2, get h() { return H - M * 2; }, r: 24 };
const INK = "#1f2937";        // 主文字
const SUB = "#6b7280";        // 次文字
const FAINT = "#9ca3af";      // 页脚
const LINE = "#eceef2";       // 分隔线
const ACCENT_A = "#3BA7FF";   // 蓝紫渐变（与页内趋势图同源）
const ACCENT_B = "#8D6BFF";
const PAD = 32;               // 卡内左右留白
const CW = CARD.w - PAD * 2;  // 卡内容宽

// ---- 绘制工具 ----

function roundRectPath(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawTrendCard(c: CanvasRenderingContext2D, points: { label: string; value: number }[], x: number, y: number, w: number, h: number): void {
  c.fillStyle = "#f7f8fa";
  roundRectPath(c, x - 16, y - 24, w + 32, h + 52, 14);
  c.fill();
  if (points.length < 2) {
    c.fillStyle = SUB;
    c.font = "400 15px system-ui";
    c.fillText("暂无趋势数据", x, y + h / 2);
    return;
  }
  const max = Math.max(1, ...points.map((p) => p.value));
  const pts = points.map((p, i) => ({ px: x + (w * i) / (points.length - 1), py: y + h * (1 - p.value / max) }));
  const grad = c.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, ACCENT_A);
  grad.addColorStop(1, ACCENT_B);
  // 面积
  c.beginPath();
  c.moveTo(pts[0].px, y + h);
  for (const p of pts) c.lineTo(p.px, p.py);
  c.lineTo(pts[pts.length - 1].px, y + h);
  c.closePath();
  c.globalAlpha = 0.12;
  c.fillStyle = grad;
  c.fill();
  c.globalAlpha = 1;
  // 折线
  c.beginPath();
  pts.forEach((p, i) => (i === 0 ? c.moveTo(p.px, p.py) : c.lineTo(p.px, p.py)));
  c.strokeStyle = grad;
  c.lineWidth = 3;
  c.lineJoin = "round";
  c.lineCap = "round";
  c.stroke();
  // 数据点 + x 轴标签
  c.textAlign = "center";
  pts.forEach((p, i) => {
    c.beginPath();
    c.arc(p.px, p.py, i === pts.length - 1 ? 4.5 : 3.2, 0, Math.PI * 2);
    c.fillStyle = "#ffffff";
    c.fill();
    c.strokeStyle = grad;
    c.lineWidth = 1.6;
    c.stroke();
    // v2.2.1 轴标签抽稀（与 TrendChart 同规则）：>14 点按步长（目标 ~12 个），月初/首末必显
    const n = points.length;
    const stride = Math.ceil(n / 12);
    if (n <= 14 || i === 0 || i === n - 1 || points[i].label.endsWith("月") || i % stride === 0) {
      c.fillStyle = SUB;
      c.font = "400 13px system-ui";
      c.fillText(points[i].label, Math.min(Math.max(p.px, x + 14), x + w - 14), y + h + 22);
    }
  });
  c.textAlign = "left";
}

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
  // v2.2.1 两遍绘制：第一遍干跑只推进 y（不画），定稿 H；第二遍正式绘制。
  const paint = (draw: boolean): number => {
    let yy = 298;
    yy += input.metrics.length * 38 + 34 + 6;      // 指标行 + 分隔
    yy += 176 + 34;                                 // 趋势卡
    yy += 32 + (input.models.length === 0 ? 48 : input.models.length * 48) + 34; // 模型区
    yy += 30 + (58 + 10) * 2 + 26;                  // 工具 2×2
    yy += 24 + PET_H;                               // 宠物区（顶锚间距 24 + 立绘满高）
    return yy + 30 + 12;                            // 页脚区
  };
  H = Math.max(1560, paint(false));
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const c = cv.getContext("2d")!;

  // 背景 + 白卡
  c.fillStyle = "#f5f6f8"; c.fillRect(0, 0, W, H);
  c.fillStyle = "#ffffff";
  roundRectPath(c, CARD.x, CARD.y, CARD.w, CARD.h, CARD.r);
  c.fill();
  c.strokeStyle = "#e8e5df"; c.lineWidth = 1; c.stroke();

  // —— 头部：标题 + 日期范围 ——
  c.fillStyle = INK; c.font = "700 28px system-ui";
  c.fillText("用量看板", PAD, 78);
  c.font = "500 18px system-ui"; c.fillStyle = SUB;
  c.textAlign = "right";
  c.fillText(input.rangeLabel, W - PAD, 74);
  c.textAlign = "left";
  c.strokeStyle = LINE; c.beginPath(); c.moveTo(PAD, 100); c.lineTo(W - PAD, 100); c.stroke();

  // —— hero：累计 Token（完整千分位；字号对比收敛：56 上限，不再 72 压场）——
  c.fillStyle = SUB; c.font = "500 16px system-ui";
  c.fillText("累计 Token", PAD, 136);
  c.fillStyle = INK;
  const heroSize = input.hero.length > 12 ? 48 : input.hero.length > 9 ? 56 : 64;
  c.font = `750 ${heroSize}px system-ui`;
  c.fillText(input.hero, PAD - 2, 206);
  c.fillStyle = SUB; c.font = "400 15px system-ui";
  c.fillText(input.heroSub, PAD, 242);
  c.strokeStyle = LINE; c.beginPath(); c.moveTo(PAD, 270); c.lineTo(W - PAD, 270); c.stroke();

  // —— 指标行（label 左 / value 右）——
  let y = 298;
  for (const [k, v] of input.metrics) {
    c.fillStyle = "#4b5563"; c.font = "400 19px system-ui";
    c.fillText(k, PAD, y);
    c.fillStyle = INK; c.font = "600 20px system-ui";
    c.textAlign = "right";
    c.fillText(v, W - PAD, y);
    c.textAlign = "left";
    y += 38;
  }
  c.strokeStyle = LINE; c.beginPath(); c.moveTo(PAD, y + 2); c.lineTo(W - PAD, y + 2); c.stroke();
  y += 34;

  // —— 趋势卡 ——
  c.fillStyle = INK; c.font = "600 20px system-ui";
  c.fillText(input.trendTitle, PAD, y + 24);
  c.fillStyle = SUB; c.font = "400 14px system-ui";
  c.textAlign = "right"; c.fillText(input.peakLabel, W - PAD, y + 24); c.textAlign = "left";
  drawTrendCard(c, input.points, PAD + 16, y + 58, CW - 32, 120);
  y += 216; // 图卡底(含 x 轴标签)与下节标题的呼吸间距（修复 9/6 标签与标题拥挤）
  c.strokeStyle = LINE; c.beginPath(); c.moveTo(PAD, y); c.lineTo(W - PAD, y); c.stroke();
  y += 34;

  // —— 按 Model 分布（全名不截断）——
  c.fillStyle = INK; c.font = "600 20px system-ui";
  c.fillText("按 Model 分布", PAD, y);
  y += 32;
  if (input.models.length === 0) {
    c.fillStyle = SUB; c.font = "400 15px system-ui";
    c.fillText("暂无数据", PAD, y + 16);
    y += 48;
  } else {
    for (const m of input.models) {
      c.fillStyle = INK; c.font = "600 17px system-ui";
      c.fillText(m.name, PAD, y + 15);
      c.fillStyle = "#374151"; c.font = "500 15px system-ui";
      c.textAlign = "right"; c.fillText(m.val, W - PAD, y + 15); c.textAlign = "left";
      const barY = y + 26, barW = CW;
      c.fillStyle = "#eceef2";
      roundRectPath(c, PAD, barY, barW, 8, 4); c.fill();
      const fillW = Math.max(barW * 0.04, barW * Math.min(1, Math.max(0, m.share)));
      if (fillW > 0) {
        const bg = c.createLinearGradient(PAD, 0, PAD + barW, 0);
        bg.addColorStop(0, ACCENT_A); bg.addColorStop(1, ACCENT_B);
        c.fillStyle = bg;
        roundRectPath(c, PAD, barY, fillW, 8, 4); c.fill();
      }
      y += 48;
    }
  }
  c.strokeStyle = LINE; c.beginPath(); c.moveTo(PAD, y + 2); c.lineTo(W - PAD, y + 2); c.stroke();
  y += 36;

  // —— 工具调用 2×2 ——
  c.fillStyle = INK; c.font = "600 20px system-ui";
  c.fillText("工具调用", PAD, y);
  y += 30;
  const cellW = (CW - 12) / 2, cellH = 58;
  input.tools2x2.forEach(([k, v], i) => {
    const cx = PAD + (i % 2) * (cellW + 12), cy = y + Math.floor(i / 2) * (cellH + 10);
    c.fillStyle = "#f7f8fa";
    roundRectPath(c, cx, cy, cellW, cellH, 10); c.fill();
    c.fillStyle = SUB; c.font = "400 15px system-ui";
    c.fillText(k, cx + 14, cy + 23);
    c.fillStyle = INK; c.font = "600 18px system-ui";
    c.fillText(v, cx + 14, cy + 47);
  });
  y += (cellH + 10) * 2 + 26;
  // v2.2.1：H 定稿（此时 y 已知）——H = 内容底(工具区) + 立绘满高(360) + 间距(26) + 页脚区(40+M+16)
  H = Math.max(1560, y + 24 + PET_H + 24 + 30 + 12); // 内容底(宠物脚)+24 → 页脚 → 底距 12

  // —— 聊天式底部：宠物立绘（右）+ 评语气泡（紧贴宠物头部左侧，像从它嘴里说出）——
  // v2.2.1：立绘固定高（PET_H，不随上方内容压缩——用户报告"导出后宠物变小"根因）；
  // 主界面「宠物大小」设置只影响桌面精灵，不参与导出（独立画布绘制）。
  const petW = input.sprite && input.frameH > 0 && input.frameW > 0 ? PET_H * (input.frameW / input.frameH) : 0;
  const petX = W - PAD - petW;
  const petY = y + 24; // 顶部锚定：紧跟工具区（间距 24px），不留大片空白
  // 气泡：宽度自适应文本（上限 340），白底+淡暖影+渐变描边，右缘距宠物 18px，垂直对齐宠物头部
  c.font = "500 19px system-ui";
  const longestLine = (() => {
    const lines: string[] = [];
    let line = "";
    for (const ch of input.quote) {
      if (ch === "\n" || c.measureText(line + ch).width > 340 - 44) { lines.push(line); line = ch === "\n" ? "" : ch; }
      else line += ch;
    }
    if (line) lines.push(line);
    return lines;
  })();
  const textW = Math.max(0, ...longestLine.map((l) => c.measureText(l).width));
  const bubbleW = Math.min(340, Math.max(150, textW + 44), petX - 18 - PAD);
  const bubbleX = petX - 18 - bubbleW;
  const bubbleH = Math.max(60, 20 * 2 + longestLine.length * 27 - (27 - 19));
  const bubbleY = petY + PET_H * 0.1;
  // 淡影
  c.save();
  c.shadowColor = "rgba(122, 74, 43, 0.18)";
  c.shadowBlur = 14;
  c.shadowOffsetY = 4;
  c.fillStyle = "#fffdf9";
  roundRectPath(c, bubbleX, bubbleY, bubbleW, bubbleH, 16);
  c.fill();
  c.restore();
  // 渐变描边
  const bStroke = c.createLinearGradient(bubbleX, bubbleY, bubbleX + bubbleW, bubbleY + bubbleH);
  bStroke.addColorStop(0, "rgba(59, 167, 255, 0.45)");
  bStroke.addColorStop(1, "rgba(141, 107, 255, 0.45)");
  c.strokeStyle = bStroke; c.lineWidth = 1.5;
  roundRectPath(c, bubbleX, bubbleY, bubbleW, bubbleH, 16);
  c.stroke();
  // 尾巴（指向宠物）
  const tailY = bubbleY + bubbleH / 2;
  c.beginPath();
  c.moveTo(bubbleX + bubbleW, tailY - 10);
  c.quadraticCurveTo(bubbleX + bubbleW + 16, tailY, bubbleX + bubbleW, tailY + 10);
  c.closePath();
  c.fillStyle = "#fffdf9"; c.fill();
  c.strokeStyle = bStroke; c.stroke();
  c.fillStyle = "#4a3b2a"; c.font = "500 19px system-ui";
  longestLine.forEach((line, i) => c.fillText(line, bubbleX + 20, bubbleY + 20 + 16 + i * 27));
  // 立绘最后画（与气泡已按几何分离：气泡右缘 ≤ petX-18）
  if (input.sprite && input.frameW > 0 && input.frameH > 0 && petW > 0) {
    c.drawImage(input.sprite, 0, input.poseRow * input.frameH, input.frameW, input.frameH, petX, petY, petW, PET_H);
  }

    // —— 收尾：按内容底裁掉多余卡身（重刷页底色+补卡底线），页脚贴内容底 ——
  const cardBottom = CARD.y + CARD.h;
  const contentBottom = Math.max(petY + PET_H, y) + 8;
  if (contentBottom + 16 < cardBottom) {
    c.fillStyle = "#f5f6f8";
    c.fillRect(CARD.x, contentBottom, CARD.w, cardBottom - contentBottom);
  }
  c.strokeStyle = "#e8e5df"; c.lineWidth = 1;
  c.beginPath(); c.moveTo(CARD.x, contentBottom); c.lineTo(CARD.x + CARD.w, contentBottom); c.stroke();
  const footY = contentBottom + 30;
  c.fillStyle = FAINT; c.font = "400 15px system-ui";
  c.fillText("纯 token · 含子代理 · 本地聚合", PAD, footY);
  c.textAlign = "right";
  c.fillText("DSH · Foxbell 用量看板", W - PAD, footY);
  c.textAlign = "left";

  // v2.2.1 裁尾：页脚以下若有多余画布（上界 2016 残留），刷页底色收边
  const below = footY + 12;
  if (below < H) {
    c.fillStyle = "#f5f6f8";
    c.fillRect(0, below, W, H - below);
  }

    return await new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("canvas toBlob returned null"))), "image/png"));
}

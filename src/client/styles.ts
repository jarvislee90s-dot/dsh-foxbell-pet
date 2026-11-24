// styles.ts — 样式 CSS 内联注入（构建时经 esbuild 打进 bundle，运行时 <style> 落地）。
// v1.3.0 类名全部保留（dyn-pet-*），新增对话框/管理/切换/守卫系列。

/* ---- v2.2 迷你条钻取按钮（Task10 R6 铁律修订最小实现）：容器 .dyn-pet-mini 保持 pointer-events:none
   不动（区域外点击照旧穿透），仅此子元素开 auto——迷你条内唯一可点元素，点击展开黑板 ---- */
export const MINI_DETAIL_CSS = `
.dyn-pet-mini-detail { pointer-events: auto; cursor: pointer; margin-top: 2px; text-align: right; font-size: 11px; color: #8a6d3b; opacity: .85; }
.dyn-pet-mini-detail:hover { opacity: 1; text-decoration: underline; }
`;

const CSS = `
.dyn-pet-root { position: fixed; z-index: 2147483000; pointer-events: auto; user-select: none; -webkit-user-select: none; touch-action: none; }
.dyn-pet-sprite { width: 192px; height: 208px; background-repeat: no-repeat; cursor: grab; }
.dyn-pet-sprite.dragging { cursor: grabbing; }
.dyn-pet-top {
  position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; pointer-events: none; z-index: 3;
  width: fit-content;
}
.dyn-pet-proj {
  pointer-events: auto; cursor: pointer; display: flex; align-items: flex-start;
  background: rgba(255, 252, 248, 0.97); border: 1px solid rgba(122, 74, 43, 0.3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.14);
  line-height: 1.45; width: 100%; box-sizing: border-box;
}
.dyn-pet-proj:hover { border-color: rgba(122, 74, 43, 0.65); }
.dyn-pet-dot { border-radius: 50%; flex: none; }
.dyn-pet-proj-body { min-width: 0; }
.dyn-pet-proj-title { font-weight: 700; color: #7a4a2b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dyn-pet-proj-line { color: #a07050; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dyn-pet-age { color: #c4a484; }
.dyn-pet-proj-more { pointer-events: none; color: #a07050; background: rgba(255, 252, 248, 0.9); border-radius: 999px; padding: 2px 8px; }
.dyn-pet-bubble {
  position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.96); color: #7a4a2b; border: 1px solid rgba(122, 74, 43, 0.35);
  line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18); pointer-events: none; z-index: 2;
}
/* 举牌（v1.4.0 .dyn-pet-sign 移植）：字号/内边距/圆角由 Sign.tsx 内联 px() 缩放下发 */
.dyn-pet-sign {
  position: absolute; bottom: 85%; left: 60%; transform: rotate(-4deg);
  background: #fffbe8; border: 1px solid rgba(122, 74, 43, 0.45); color: #7a4a2b; font-weight: 600;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15); pointer-events: none; z-index: 3; white-space: nowrap;
}
.dyn-pet-toggle {
  display: inline-flex; align-items: center; gap: 4px; background: transparent; border: none;
  color: #8b7355; font-size: 12px; cursor: pointer; padding: 4px 6px; border-radius: 8px;
}
.dyn-pet-toggle:hover { background: rgba(122, 74, 43, 0.08); }
.dyn-pet-toggle-icon { font-size: 14px; line-height: 1; }
.dyn-pet-toggle.off .dyn-pet-toggle-icon { filter: grayscale(1); opacity: 0.45; }
.dyn-pet-toggle-text { font-size: 12px; line-height: 1; }
.dyn-pet-menu-wrap { position: fixed; }
.dyn-pet-menu { background: rgba(30,30,34,.96); color:#eee; line-height:1.9; border-radius:10px; padding:4px 0; min-width:170px; box-shadow:0 6px 20px rgba(0,0,0,.4); cursor:default; user-select:none; position: relative; }
.dyn-pet-menu-item { padding: 3px 14px; cursor: pointer; }
.dyn-pet-menu-item:hover { background: rgba(255,255,255,.08); }
.dyn-pet-menu-item.sel { color: #fbbf24; }
.dyn-pet-menu-row { display:flex; align-items:center; justify-content:space-between; gap:10px; padding: 3px 14px; cursor: pointer; }
.dyn-pet-menu-row.disabled { opacity: .5; cursor: not-allowed; }
.dyn-pet-menu-btn { background:#3f3f46; color:#eee; border:none; border-radius:6px; font-size:12px; padding:1px 10px; cursor:pointer; }
.dyn-pet-menu-btn.on { background:#16a34a; }
.dyn-pet-menu-sub { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:3px 14px; cursor:pointer; }
.dyn-pet-menu-sub:hover { background:rgba(255,255,255,.08); }
.dyn-pet-menu-val { color:#a1a1aa; font-size:12px; }
.dyn-pet-menu-divider { height:1px; margin:4px 10px; background:rgba(255,255,255,.12); }
.dyn-pet-card { list-style:none; border:0.5px solid var(--dsw-alias-border-l4, rgba(0,0,0,.1)); border-radius:16px; background:var(--dsw-alias-bg-layer-3, #fff); transition:border-color .16s, background .16s; }
.dyn-pet-card:hover { border-color:var(--dsw-alias-label-dimmed, rgba(0,0,0,.25)); }
.dyn-pet-card.open { background:var(--dsw-alias-bg-layer-2, #fff); border-color:var(--dsw-alias-label-dimmed, rgba(0,0,0,.25)); }
.dyn-pet-card-header { width:100%; appearance:none; border:0; background:none; font:inherit; color:inherit; text-align:left; cursor:pointer; display:flex; align-items:center; gap:12px; padding:14px 16px; border-radius:12px; }
.dyn-pet-card-headtext { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; }
.dyn-pet-card-name { font-size:15px; font-weight:600; line-height:1.4; color:var(--dsw-alias-label-primary, #1f1f1f); }
.dyn-pet-card-desc { font-size:13px; line-height:1.5; color:var(--dsw-alias-label-tertiary, #8a8a8a); }
.dyn-pet-card-chevron { flex:none; color:var(--dsw-alias-label-tertiary, #8a8a8a); transition:transform .16s; }
.dyn-pet-card-chevron.open { transform:rotate(180deg); }
.dyn-pet-card-body { border-top:0.5px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08)); margin:0 16px; padding-bottom:8px; }
.dyn-pet-settings { padding: 8px 12px; font-size: 13px; color: #333; display: flex; flex-direction: column; gap: 6px; min-width: 240px; }
.dyn-pet-settings-section { font-weight: 700; margin-top: 14px; padding-bottom: 2px; border-bottom: 1px solid rgba(122,74,43,.18); color:#7a4a2b; }
.dyn-pet-settings-row { position: relative; }
.dyn-pet-info { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; margin-left: 6px; border: 1px solid rgba(122,74,43,.4); border-radius: 999px; font-size: 10px; font-style: italic; font-weight: 700; color: #8a6d3b; cursor: help; vertical-align: 1px; user-select: none; }
.dyn-pet-info:hover { background: rgba(122,74,43,.12); }
/* v2.2.1：自绘说明气泡——hover 即现（原生 title 有约 1s 延迟且部分环境不弹） */
.dyn-pet-info { position: relative; }
.dyn-pet-info:hover::after {
  content: attr(data-tip);
  position: absolute;
  top: calc(100% + 8px);
  left: calc(100% + 10px);
  width: min(320px, 60vw);
  background: rgba(30, 26, 22, .96);
  color: #f3ece2;
  font-size: 13px; font-style: normal; font-weight: 400; line-height: 1.55;
  padding: 10px 14px; border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,.35);
  white-space: normal;
  z-index: 2147483600;
  pointer-events: none;
  text-align: left;
  transform: none;
}
.dyn-pet-settings-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.dyn-pet-settings-row select { max-width: 140px; }
/* ---- v2.1 设置卡草稿态（v1.4.0 client.js L1098-1109 移植：头部状态字/口径注/保存条/无效数字红框）---- */
.dyn-pet-settings-dirty { flex: none; color: #b45309; font-size: 12px; }
.dyn-pet-settings-saved { flex: none; color: #16a34a; font-size: 12px; }
.dyn-pet-settings-note { color: #999; font-size: 11px; line-height: 1.5; }
.dyn-pet-settings-savebar { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 6px; }
.dyn-pet-settings-discard { background: transparent; color: #8b7355; border: 1px solid #d6c7b2; border-radius: 8px; padding: 4px 12px; font-size: 12px; cursor: pointer; }
.dyn-pet-settings-save { background: #16a34a; color: #fff; border: none; border-radius: 8px; padding: 5px 18px; font-size: 13px; cursor: pointer; }
.dyn-pet-settings-save:disabled { background: #c9bdae; cursor: default; }
.dyn-pet-settings-row.bad input { border: 1px solid #ef4444; border-radius: 4px; }
/* ---- v2.2 R8 设置卡导出评语文本域（Task 14）---- */
.dyn-pet-settings-quote { flex: 1; max-width: 220px; border: 1px solid rgba(122,74,43,.35); border-radius: 6px; padding: 4px 6px; font-size: 12px; color: #3b2f23; background: #fff; font-family: inherit; line-height: 1.4; resize: vertical; box-sizing: border-box; }
.dyn-pet-settings-actions { justify-content: flex-start; flex-wrap: wrap; }
.dyn-pet-scale-group { display: inline-flex; gap: 4px; }
.dyn-pet-scale-btn { border:1px solid rgba(122,74,43,.35); background:#fff; color:#7a4a2b; border-radius:8px; font-size:12px; padding:2px 10px; cursor:pointer; }
.dyn-pet-scale-btn.on { background:#7a4a2b; color:#fff; }
.dyn-pet-current-pet { color:#7a4a2b; }
.dyn-pet-petdex-link { color:#b45309; font-size:12px; text-decoration:none; }
.dyn-pet-petdex-link:hover { text-decoration:underline; }
.dyn-pet-modal-mask { position: fixed; inset: 0; z-index: 2147483100; background: rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; pointer-events:auto; }
.dyn-pet-modal { background:#fffdf9; color:#3b2f23; border-radius:12px; box-shadow:0 12px 40px rgba(0,0,0,.35); width:420px; max-width:92vw; max-height:86vh; display:flex; flex-direction:column; font-size:13px; }
.dyn-pet-modal.wide { width:640px; }
.dyn-pet-modal-head { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-bottom:1px solid rgba(122,74,43,.15); font-weight:700; color:#7a4a2b; }
.dyn-pet-modal-x { background:transparent; border:none; cursor:pointer; color:#a07050; font-size:14px; }
.dyn-pet-modal-body { padding:12px 14px; overflow-y:auto; display:flex; flex-direction:column; gap:10px; max-height:64vh; }
.dyn-pet-modal-foot { padding:10px 14px; border-top:1px solid rgba(122,74,43,.15); display:flex; justify-content:flex-end; gap:8px; }
.dyn-pet-btn { border:1px solid rgba(122,74,43,.35); background:#fff; color:#7a4a2b; border-radius:8px; font-size:12px; padding:4px 12px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
.dyn-pet-btn:disabled { opacity:.5; cursor:not-allowed; }
.dyn-pet-btn.primary { background:#7a4a2b; color:#fff; border-color:#7a4a2b; }
.dyn-pet-btn.danger { background:#b91c1c; color:#fff; border-color:#b91c1c; }
.dyn-pet-inline-error { background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; border-radius:8px; padding:6px 10px; font-size:12px; white-space:pre-wrap; }
.dyn-pet-inline-ok { background:#f0fdf4; border:1px solid #bbf7d0; color:#15803d; border-radius:8px; padding:6px 10px; font-size:12px; }
.dyn-pet-spinner { width:12px; height:12px; border:2px solid rgba(122,74,43,.25); border-top-color:#7a4a2b; border-radius:50%; display:inline-block; animation:dyn-pet-spin .8s linear infinite; }
@keyframes dyn-pet-spin { to { transform: rotate(360deg); } }
.dyn-pet-hint { color:#a07050; font-size:12px; }
.dyn-pet-bad { color:#b91c1c; font-size:12px; }
.dyn-pet-warn { color:#b45309; }
.dyn-pet-badge { background:rgba(122,74,43,.12); color:#7a4a2b; border-radius:999px; padding:0 8px; font-size:11px; }
.dyn-pet-tabs { display:flex; gap:6px; }
.dyn-pet-tabs button { border:1px solid rgba(122,74,43,.35); background:#fff; color:#7a4a2b; border-radius:8px 8px 0 0; padding:4px 12px; cursor:pointer; font-size:12px; }
.dyn-pet-tabs button.on { background:#7a4a2b; color:#fff; }
.dyn-pet-codex-list, .dyn-pet-petdex-list { display:flex; flex-direction:column; gap:4px; max-height:220px; overflow-y:auto; }
.dyn-pet-codex-row { display:flex; align-items:center; gap:8px; padding:5px 10px; border:1px solid rgba(122,74,43,.2); border-radius:8px; cursor:pointer; }
.dyn-pet-codex-row:hover { border-color:rgba(122,74,43,.55); }
.dyn-pet-codex-row.sel { border-color:#7a4a2b; background:rgba(122,74,43,.08); }
.dyn-pet-local { display:flex; flex-direction:column; gap:8px; align-items:flex-start; }
.dyn-pet-petdex-row { display:flex; gap:6px; }
.dyn-pet-petdex-row input { flex:1; }
.dyn-pet-import-config { display:flex; flex-direction:column; gap:10px; }
.dyn-pet-import-preview { display:flex; align-items:center; gap:10px; }
.dyn-pet-sheet-thumb { width:96px; height:104px; background-repeat:no-repeat; border:1px solid rgba(122,74,43,.25); border-radius:8px; flex:none; }
.dyn-pet-import-fields { display:flex; flex-direction:column; gap:6px; }
.dyn-pet-field { display:flex; align-items:center; gap:8px; }
.dyn-pet-field > span:first-child { flex:none; width:130px; color:#7a4a2b; }
.dyn-pet-field input { flex:1; border:1px solid rgba(122,74,43,.35); border-radius:8px; padding:4px 8px; font-size:12px; min-width:0; }
.dyn-pet-dirpath { flex:1; font-size:11px; color:#a07050; word-break:break-all; background:rgba(122,74,43,.06); border-radius:6px; padding:3px 6px; }
.dyn-pet-checkline { display:flex; align-items:center; gap:6px; font-size:12px; color:#7a4a2b; }
.dyn-pet-voice-editor { display:flex; flex-direction:column; gap:8px; }
.dyn-pet-voice-group { border:1px solid rgba(122,74,43,.18); border-radius:8px; padding:6px 8px; }
.dyn-pet-voice-group-head { display:flex; align-items:center; justify-content:space-between; gap:8px; color:#7a4a2b; font-weight:600; }
.dyn-pet-voice-row { display:flex; align-items:center; gap:8px; padding:2px 0; }
.dyn-pet-voice-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dyn-pet-voice-badge { background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; border-radius:999px; font-size:11px; padding:0 8px; cursor:pointer; flex:none; }
.dyn-pet-voice-summary { font-size:12px; color:#a07050; }
.dyn-pet-voice-summary.ok { color:#15803d; }
.dyn-pet-switch-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.dyn-pet-switch-card { border:1px solid rgba(122,74,43,.25); border-radius:10px; padding:8px; cursor:pointer; display:flex; flex-direction:column; gap:6px; align-items:center; }
.dyn-pet-switch-card:hover { border-color:rgba(122,74,43,.6); }
.dyn-pet-switch-card.active { border-color:#7a4a2b; background:rgba(122,74,43,.07); }
.dyn-pet-switch-thumb { width:48px; height:52px; background-repeat:no-repeat; border-radius:6px; }
.dyn-pet-switch-name { font-weight:600; color:#7a4a2b; display:flex; gap:6px; align-items:center; }
.dyn-pet-switch-meta { display:flex; gap:8px; align-items:center; font-size:12px; }
.dyn-pet-mismatch { display:flex; flex-direction:column; gap:8px; }
.dyn-pet-mismatch-title { font-weight:700; color:#b45309; }
.dyn-pet-mismatch-actions { display:flex; gap:8px; flex-wrap:wrap; }
.dyn-pet-issue-list { margin:0; padding-left:18px; max-height:160px; overflow-y:auto; color:#7a4a2b; }
.dyn-pet-guard-fatal { color:#b91c1c; }
.dyn-pet-guard-actions { display:flex; gap:8px; flex-wrap:wrap; }
.dyn-pet-manage-list { display:flex; flex-direction:column; gap:6px; }
.dyn-pet-manage-panel { display:flex; flex-direction:column; gap:8px; }
.dyn-pet-manage-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.dyn-pet-delete-confirm { display:inline-flex; gap:8px; align-items:center; }
.dyn-pet-import-done { color:#15803d; font-weight:600; }
/* ---- v2.1 迷你条（v1.4.0 client.js L1110-1117 原样移植；7e16d62：行内换行不截断）----
   CSS 留 scale=1 版式，实际字号/内边距/宽度由 MiniBar.tsx 内联 px() 缩放下发（与 Sign.tsx 同口径） */
.dyn-pet-mini-wrap { position: absolute; left: 100%; top: 12px; margin-left: 12px; z-index: 4; }
.dyn-pet-mini { width: 248px; background: rgba(255,252,248,0.97); border: 1px solid rgba(122,74,43,0.3); border-radius: 10px; padding: 8px 10px; font-size: 12px; color: #7a4a2b; line-height: 1.6; box-shadow: 0 2px 8px rgba(0,0,0,0.14); pointer-events: none; }
.dyn-pet-mini-dial { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.dyn-pet-mini-bar { flex: 1; height: 6px; border-radius: 999px; background: rgba(122,74,43,0.15); overflow: hidden; }
.dyn-pet-mini-bar i { display: block; height: 100%; background: linear-gradient(90deg,#f59e0b,#ef4444); border-radius: 999px; transition: width .4s ease; }
.dyn-pet-mini-bar i.longrun { background: linear-gradient(90deg,#3BA7FF,#8D6BFF); }
.dyn-pet-mini-bar i.loaf { background: linear-gradient(90deg,#7c8aa0,#a8b4c4); }
.dyn-pet-mini-tier { font-weight: 700; white-space: nowrap; font-size: 14px; }
.dyn-pet-mini-tier.mood-busy { color: #b45309; }
.dyn-pet-mini-tier.mood-longrun { color: #6d5bd0; }
.dyn-pet-mini-tier.mood-loaf { color: #8fa3b8; }
.dyn-pet-mini-row { white-space: normal; word-break: break-word; }
.dyn-pet-mini-dim { color: #a07050; font-size: 11px; }
${MINI_DETAIL_CSS}
/* ---- v2.1 小黑板 + 📖 限时入口（v1.4.0 client.js L1118-1123 原样移植；行 normal 换行 per 7e16d62）----
   黑板为 310px 固定版式（fixed 右下挂点与 scale 缩放由 Pet.tsx boardLayer 内联下发） */
.dyn-pet-board { width: 310px; background: linear-gradient(160deg, #26362e, #1e2b25 60%, #22302a); color: rgba(255,255,255,.92); border: 6px solid #9c7a55; border-radius: 10px; padding: 10px 12px 8px; font-size: 12.5px; line-height: 1.7; box-shadow: 0 6px 20px rgba(0,0,0,0.35); }
.dyn-pet-board.farewell { border: 1px solid rgba(251,191,36,0.5); }
.dyn-pet-board-head { display: flex; justify-content: space-between; align-items: center; font-weight: 700; margin-bottom: 4px; }
.dyn-pet-board-x { background: transparent; border: none; color: rgba(255,255,255,.75); cursor: pointer; font-size: 13px; padding: 0 2px; }
.dyn-pet-board-x:hover { color: #fff; }
.dyn-pet-board-row { white-space: normal; word-break: break-word; }
.dyn-pet-board-row + .dyn-pet-board-kv, .dyn-pet-board-kv + .dyn-pet-board-kv { border-top: 1px dashed rgba(255,255,255,.18); }
.dyn-pet-board-kv { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding: 3px 0; }
.dyn-pet-board-kv .k { min-width: 0; }
/* v2.2.2：数值段可收缩（原 flex:none 使长值整体溢出板宽被裁切）；短值右对齐观感不变 */
.dyn-pet-board-kv .v { flex: 1 1 auto; min-width: 0; }
.dyn-pet-board-kv .k { flex: none; color: rgba(255,255,255,.55); font-size: 11px; }
.dyn-pet-board-kv .v { text-align: right; word-break: break-word; color: rgba(255,255,255,.92); text-shadow: 0 0 3px rgba(255,255,255,.18); }
/* v2.2.2 工具行逐条目换行：entry 为 inline-block（整体换行单元，不在「（共 X 分钟）」内部断行；
   单条目超宽时其内部照常软换行兜底），sep 间的空格是唯一换行点 */
.dyn-pet-board-kv-tools .entry { display: inline-block; }
/* v2.2.1 黑板模型行与大看板对齐口径统一：名称左对齐 + 数值右对齐固定宽 */
.dyn-pet-board-model .v { flex: 1 1 auto; display: flex; align-items: baseline; gap: 10px; text-align: left; }
.dyn-pet-board-model { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.dyn-pet-board-model .nm { flex: 1 1 auto; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dyn-pet-board-model .num { flex: none; min-width: 64px; text-align: right; font-variant-numeric: tabular-nums; }
/* ---- v2.2 黑板加料（Task 11 R4）：sparkline 行（行内 flex：灰字 11px 标签 + 趋势图占余宽）；
   入口行右对齐——.dyn-pet-board 非 flex 容器，用 text-align 而非 align-self（Task10 教训）；
   入口行是黑板内第二个可点元素（容器无 pointer-events 限制，显式 auto 保点击） */
.dyn-pet-board-spark { display: flex; align-items: center; gap: 6px; }
.dyn-pet-board-spark-label { flex: none; color: rgba(255,255,255,.55); font-size: 11px; }
.dyn-pet-board-open { text-align: right; pointer-events: auto; cursor: pointer; color: rgba(255,255,255,.75); }
.dyn-pet-board-open:hover { text-decoration: underline; color: #fff; }
/* 粉笔槽：木质横条 + 一支粉笔 + 一块板擦（纯 CSS 装饰，讨喜不喧宾） */
.dyn-pet-board-tray { position: relative; height: 9px; margin: 10px -2px 2px; background: linear-gradient(#c39a6b, #9c7a55); border-radius: 3px; box-shadow: 0 2px 4px rgba(0,0,0,.3); }
.dyn-pet-board-tray::before { content: ""; position: absolute; left: 22px; top: -4px; width: 30px; height: 5px; background: #f5f2ea; border-radius: 2px; box-shadow: 0 1px 1px rgba(0,0,0,.25); }
.dyn-pet-board-tray::after { content: ""; position: absolute; right: 18px; top: -7px; width: 44px; height: 10px; background: #6b7484; border-radius: 2px; border-top: 3px solid #e8e5df; }
.dyn-pet-entry { position: absolute; right: -8px; top: -6px; background: #fffbe8; border: 1px solid rgba(122,74,43,0.5); color: #7a4a2b; font-size: 12px; font-weight: 600; border-radius: 999px; padding: 3px 10px; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.15); z-index: 3; }
/* ---- v2.2 L3 大看板（Task 12，spec R5 Codex++ 排版：padding 16 / hero 28px 加粗 / 网格两列 /
   card 圆角 10px 次级背景 / model-bar 通栏 5px 圆角 / 胶囊选项卡）。
   面板语义（6.6 规则 7）：面板自滚——overflow:auto + height:100%，滚动不穿透外层 ---- */
.dyn-pet-dash { padding: 20px 28px; overflow: auto; height: 100%; box-sizing: border-box; color: #3b2f23; font-size: 16px; line-height: 1.6; max-width: 1020px; margin: 0 auto; background: var(--dsh-color-background, #fff); }
.dyn-pet-dash-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.dyn-pet-dash-head h2 { margin: 0; font-size: 20px; font-weight: 700; color: #7a4a2b; }
.dyn-pet-dash-tabs { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dyn-pet-dash-tab { border: 1px solid rgba(122,74,43,.35); background: #fff; color: #7a4a2b; border-radius: 999px; padding: 4px 14px; font-size: 13px; cursor: pointer; }
.dyn-pet-dash-tab.is-active { background: #7a4a2b; color: #fff; border-color: #7a4a2b; }
.dyn-pet-dash-dates { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #7a4a2b; }
.dyn-pet-dash-dates input { border: 1px solid rgba(122,74,43,.35); border-radius: 6px; padding: 2px 4px; font-size: 12px; color: #3b2f23; background: #fff; }
.dyn-pet-dash-rangehint { color: #b45309; font-style: normal; font-size: 11px; }
/* ---- v2.2 R8 大看板头部导出按钮（Task 14）：复制文本 / 导出图片 ---- */
.dyn-pet-dash-actions { display: flex; align-items: center; gap: 6px; }
.dyn-pet-dash-actbtn.is-active { background: rgba(122,74,43,.14); }
.dyn-pet-dash-quotebar { display: flex; align-items: center; gap: 8px; padding: 8px 2px 2px; }
.dyn-pet-dash-quotebar input { flex: 1; min-width: 0; height: 30px; border: 1px solid rgba(122,74,43,.35); border-radius: 8px; padding: 0 10px; font-size: 13px; background: #fff; color: inherit; }
.dyn-pet-dash-quotebar input:focus { outline: none; border-color: rgba(122,74,43,.6); }
.dyn-pet-dash-actbtn { border: 1px solid rgba(122,74,43,.35); background: #fff; color: #7a4a2b; border-radius: 999px; padding: 3px 12px; font-size: 12px; cursor: pointer; }
.dyn-pet-dash-actbtn:hover { background: rgba(122,74,43,.08); }
.dyn-pet-dash-hero { padding: 10px 2px 6px; }
.dyn-pet-dash-hero-label { font-size: 14px; color: #a07050; }
.dyn-pet-dash-hero-num { font-size: 40px; font-weight: 750; color: #7a4a2b; line-height: 1.2; letter-spacing: .5px; font-variant-numeric: tabular-nums; }
.dyn-pet-dash-weekhit { font-size: 15px; color: #a07050; }
.dyn-pet-dash-rows { display: grid; grid-template-columns: 1fr 1fr; column-gap: 56px; margin: 10px 0 14px; }
.dyn-pet-dash-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 9px 2px; border-bottom: 1px solid rgba(122,74,43,.12); min-width: 0; }
.dyn-pet-dash-row span { font-size: 16px; color: #6b7280; }
.dyn-pet-dash-row strong { font-size: 16px; font-weight: 600; color: #1f2937; font-variant-numeric: tabular-nums; }
.dyn-pet-dash-card { border: 1px solid rgba(122,74,43,.16); border-radius: 10px; background: var(--dsh-color-background, #fff); padding: 10px 12px; margin-bottom: 12px; }
.dyn-pet-dash-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; font-size: 17px; font-weight: 700; color: #7a4a2b; }
.dyn-pet-dash-meta { font-size: 14px; font-weight: 400; color: #a07050; }
.dyn-pet-dash-trendwrap { position: relative; }
.dyn-pet-dash-trendhit { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.dyn-pet-dash-tooltip { position: absolute; transform: translate(-50%, -130%); background: rgba(47,42,38,.94); color: #f3e9dc; font-size: 11px; padding: 3px 8px; border-radius: 6px; pointer-events: none; white-space: nowrap; z-index: 2; }
.dyn-pet-dash-model { display: grid; grid-template-columns: var(--model-name-w, 200px) var(--model-val-w, 84px) 1fr; align-items: center; gap: 12px; padding: 5px 0; font-size: 16px; }
/* v2.2.1 进度条等长：名称列/数值列宽由 Panel 内 JS 以「最长行」实测写入 CSS 变量，所有行进度条起点一致 */
.dyn-pet-dash-model-name { flex: none; min-width: 0; max-width: 100%; color: #7a4a2b; font-weight: 600; white-space: normal; overflow-wrap: anywhere; line-height: 1.35; }
.dyn-pet-dash-model-val { text-align: right; color: #a07050; font-variant-numeric: tabular-nums; }
.dyn-pet-dash-model-bar { flex: 1; height: 5px; border-radius: 999px; background: rgba(122,74,43,.12); overflow: hidden; }
.dyn-pet-dash-model-bar i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg,#3BA7FF,#8D6BFF); }
.dyn-pet-dash-tools { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; max-width: 640px; }
.dyn-pet-dash-toolcell { border: 1px solid rgba(122,74,43,.15); border-radius: 10px; background: rgba(255,252,248,.65); padding: 6px 10px; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.dyn-pet-dash-toolcell span { font-size: 14px; color: #6b7280; }
.dyn-pet-dash-toolcell strong { font-size: 17px; font-weight: 600; color: #1f2937; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dyn-pet-dash-empty { color: #a07050; font-size: 12px; padding: 4px 0; }
.dyn-pet-dash-foot { color: #a07050; font-size: 14px; padding-top: 2px; }
/* ---- Native usage/cost/speed extension: same main column, DSH theme tokens + Foxbell fallbacks. ---- */
.dyn-pet-dash-shell { height: 100%; min-height: 0; display: flex; flex-direction: column; color: var(--dsh-color-text, #3b2f23); }
.dyn-pet-dash-page-tabs { flex: none; display: flex; gap: 8px; padding: 12px 28px 0; max-width: 1020px; width: 100%; box-sizing: border-box; margin: 0 auto; }
.dyn-pet-dash-page { flex: 1 1 auto; min-height: 0; }
.dyn-pet-dash-page[hidden] { display: none; }
.dyn-pet-dash-actbtn:disabled { opacity: .45; cursor: not-allowed; }
.dyn-pet-dash-actions { flex-wrap: wrap; }
.dyn-pet-dash-notice { color: var(--dsh-color-text-secondary, #806b59); font-size: 12px; margin: 5px 0; }
.dyn-pet-dash-error { color: var(--dsh-color-danger, #a43232); background: color-mix(in srgb, currentColor 8%, transparent); border-radius: 8px; padding: 7px 10px; margin: 7px 0; font-size: 13px; }
.dyn-pet-dash-collapse { width: 100%; border: 0; background: transparent; cursor: pointer; text-align: left; padding: 0; }
.dyn-pet-dash-card-head select, .dyn-pet-speed-filters input, .dyn-pet-speed-filters select { border: 1px solid color-mix(in srgb, currentColor 25%, transparent); border-radius: 7px; background: var(--dsh-color-background, #fff); color: inherit; padding: 4px 7px; font: inherit; font-size: 12px; }
.dyn-pet-dash-tab:focus-visible, .dyn-pet-dash-actbtn:focus-visible, .dyn-pet-speed-series-row:focus-visible { outline: 2px solid var(--dsh-color-primary, #3ba7ff); outline-offset: 2px; }
.dyn-pet-cost-head, .dyn-pet-cost-row { display: grid; grid-template-columns: minmax(160px,1.6fr) minmax(96px,1fr) minmax(76px,.8fr) 82px 40px; gap: 10px; align-items: start; }
.dyn-pet-cost-head { color: var(--dsh-color-text-secondary, #806b59); font-size: 11px; padding: 8px 2px 3px; }
.dyn-pet-cost-row { padding: 8px 2px; border-top: 1px solid color-mix(in srgb, currentColor 10%, transparent); font-size: 13px; }
.dyn-pet-cost-row > span:first-child { min-width: 0; white-space: normal; overflow-wrap: anywhere; line-height: 1.35; }
.dyn-pet-cost-row strong { display: flex; flex-direction: column; font-variant-numeric: tabular-nums; }
.dyn-pet-cost-row small { color: var(--dsh-color-text-secondary, #806b59); font-weight: 400; }
.dyn-pet-cost-provider { color: var(--dsh-color-text-secondary, #806b59); font-size: 12px; font-weight: 700; padding-top: 7px; }
.dyn-pet-cost-detail { padding: 6px 8px 10px; background: color-mix(in srgb, currentColor 4%, transparent); border-radius: 7px; font-size: 11px; }
.dyn-pet-cost-detail-row { display: grid; grid-template-columns: 1.3fr .7fr 1fr .8fr 1fr; gap: 5px; padding-top: 5px; }
.dyn-pet-price-dialog-focus { display: contents; }
.dyn-pet-price-rule { border: 1px solid color-mix(in srgb, currentColor 18%, transparent); border-radius: 8px; margin: 0 0 10px; padding: 9px; }
.dyn-pet-price-rule-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.dyn-pet-price-rule label, .dyn-pet-price-cells label { display: flex; flex-direction: column; gap: 3px; font-size: 11px; }
.dyn-pet-price-rule input, .dyn-pet-price-rule select { min-width: 0; border: 1px solid color-mix(in srgb, currentColor 25%, transparent); border-radius: 6px; background: var(--dsh-color-background, #fff); color: inherit; padding: 5px; }
.dyn-pet-price-cells { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 7px; margin: 7px 0; }
.dyn-pet-price-windows { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; margin: 7px 0; }
.dyn-pet-price-windows input { width: 52px; }
.dyn-pet-speed-current { display: grid; grid-template-columns: auto auto 1fr; align-items: baseline; gap: 12px; padding: 10px 2px; }
.dyn-pet-speed-current strong { font-size: 25px; }
.dyn-pet-speed-current small { color: var(--dsh-color-text-secondary, #806b59); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dyn-pet-speed-filters { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 10px; }
.dyn-pet-speed-filters input { flex: 1 1 180px; }
.dyn-pet-speed-layout { display: grid; grid-template-columns: minmax(190px,280px) minmax(0,1fr); gap: 12px; align-items: start; }
.dyn-pet-speed-series { order: 1; display: flex; flex-direction: column; gap: 5px; }
.dyn-pet-speed-detail { order: 2; min-width: 0; }
.dyn-pet-speed-series-row { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; border: 1px solid color-mix(in srgb, currentColor 14%, transparent); border-radius: 8px; background: transparent; color: inherit; padding: 8px; text-align: left; cursor: pointer; }
.dyn-pet-speed-series-row.is-active { border-color: var(--dsh-color-primary, #3ba7ff); background: color-mix(in srgb, currentColor 6%, transparent); }
.dyn-pet-speed-series-row span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dyn-pet-speed-series-row small { color: var(--dsh-color-text-secondary, #806b59); }
.dyn-pet-speed-metrics { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 7px; margin-bottom: 8px; }
.dyn-pet-speed-metrics > div { display: flex; flex-direction: column; border: 1px solid color-mix(in srgb, currentColor 12%, transparent); border-radius: 8px; padding: 7px; min-width: 0; }
.dyn-pet-speed-metrics span, .dyn-pet-speed-metrics small { color: var(--dsh-color-text-secondary, #806b59); font-size: 11px; }
.dyn-pet-speed-metrics strong { font-size: 18px; }
.dyn-pet-speed-chart { position: relative; min-width: 0; }
.dyn-pet-speed-chart svg { display: block; width: 100%; height: auto; min-height: 210px; overflow: visible; }
.dyn-pet-speed-grid { stroke: color-mix(in srgb, currentColor 12%, transparent); stroke-width: 1; }
.dyn-pet-speed-axis { fill: var(--dsh-color-text-secondary, #806b59); font-size: 10px; font-variant-numeric: tabular-nums; }
.dyn-pet-speed-line { stroke: var(--dsh-color-primary, #3ba7ff); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.dyn-pet-speed-mark { fill: var(--dsh-color-primary, #3ba7ff); stroke: var(--dsh-color-background, #fff); stroke-width: 2; }
.dyn-pet-speed-crosshair { stroke: var(--dsh-color-text-secondary, #806b59); stroke-width: 1; pointer-events: none; }
.dyn-pet-speed-chart circle[role="button"] { cursor: pointer; }
.dyn-pet-speed-chart circle[role="button"]:focus-visible { outline: none; stroke: var(--dsh-color-primary, #3ba7ff); stroke-width: 2; }
.dyn-pet-speed-tooltip { display: flex; flex-direction: column; gap: 2px; position: absolute; right: 10px; top: 10px; max-width: min(360px,90%); padding: 8px 10px; border-radius: 8px; background: var(--dsh-color-elevated, rgba(47,42,38,.94)); color: var(--dsh-color-text, #f3e9dc); font-size: 11px; pointer-events: none; }
.dyn-pet-speed-table { margin-top: 8px; font-size: 11px; }
.dyn-pet-speed-table table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.dyn-pet-speed-table th, .dyn-pet-speed-table td { text-align: left; border-bottom: 1px solid color-mix(in srgb, currentColor 10%, transparent); padding: 4px; }
.dyn-pet-dash-shell { container: foxbell-dashboard / inline-size; }
@container foxbell-dashboard (max-width: 760px) {
  .dyn-pet-dash { padding: 14px; }
  .dyn-pet-speed-layout { display: flex; flex-direction: column; }
  .dyn-pet-speed-detail { order: 1; width: 100%; }
  .dyn-pet-speed-series { order: 2; width: 100%; }
  .dyn-pet-speed-metrics { grid-template-columns: 1fr 1fr; }
  .dyn-pet-cost-head, .dyn-pet-cost-row { grid-template-columns: minmax(0,1.2fr) minmax(0,1fr) minmax(0,.8fr) minmax(0,.7fr) auto; gap: 4px; }
  .dyn-pet-cost-row > * { min-width: 0; overflow-wrap: anywhere; }
  .dyn-pet-cost-detail-row { grid-template-columns: 1fr 1fr; }
  .dyn-pet-price-cells { grid-template-columns: 1fr 1fr; }
  .dyn-pet-speed-current { grid-template-columns: 1fr auto; }
  .dyn-pet-speed-current small { grid-column: 1 / -1; }
}
@media (forced-colors: active) {
  .dyn-pet-speed-line, .dyn-pet-speed-mark { stroke: CanvasText; }
  .dyn-pet-speed-mark { fill: CanvasText; }
}
/* ---- v2.2 侧栏看板入口图标（Task 13 R6）：sidebar.panellist 条目（dashboardSidebarEntry 门控注册）---- */
.dyn-pet-sideicon { font-size: 20px; text-align: center; padding: 6px 0; cursor: pointer; user-select: none; -webkit-user-select: none; }
`;

const STYLE_ID = "dyn-pet-styles";

export function adoptStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID) !== null) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

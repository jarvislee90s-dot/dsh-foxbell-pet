// styles.ts — 样式 CSS 内联注入（构建时经 esbuild 打进 bundle，运行时 <style> 落地）。
// v1.3.0 类名全部保留（dyn-pet-*），新增对话框/管理/切换/守卫系列。
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
.dyn-pet-proj-more { pointer-events: none; color: #a07050; background: rgba(255, 252, 248, 0.9); border-radius: 999px; padding: 2px 8px; }
.dyn-pet-bubble {
  position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.96); color: #7a4a2b; border: 1px solid rgba(122, 74, 43, 0.35);
  line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18); pointer-events: none; z-index: 2;
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
.dyn-pet-settings { padding: 8px 12px; font-size: 13px; color: #333; display: flex; flex-direction: column; gap: 6px; min-width: 240px; }
.dyn-pet-settings-section { font-weight: 700; margin-top: 4px; padding-bottom: 2px; border-bottom: 1px solid rgba(122,74,43,.18); color:#7a4a2b; }
.dyn-pet-settings-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.dyn-pet-settings-row select { max-width: 140px; }
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

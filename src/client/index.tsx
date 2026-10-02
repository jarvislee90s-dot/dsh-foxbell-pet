// index.tsx — 客户端半入口（__ModuleLoader__ bundle，esbuild cjs + banner/footer 包装）。
// 槽位：shell.overlay（宠物本体 + 对话框宿主）/ sidebar.footer.action（🦊 开关）/
//       settings.plugin.item key='foxbell-pet'（0.1 设置卡，与宿主 installSection ns 配对）/
//       settings.section id='foxbell-pet'（0.2 设置整节，v2.3 起双槽位并注）/
//       main key='foxbell-dashboard'（L3 用量大看板，Task 13）/
//       sidebar.panellist id='foxbell-dashboard'（📊 入口，dashboardSidebarEntry 门控）。
// 防御式注入：slots/sessions/layout 任一不在场时静默降级，不抛错、不影响宿主。
// v2.3（dsh 0.2 适配）：settingsScope 客户端服务已删除 → 配置后端改为
// createHttpSettingsScope()（settings/describe+update RPC 适配器，ns 自动发现）。
import React from "react";
import { Pet } from "./Pet";
import { PetToggle } from "./PetToggle";
import { SettingsCard } from "./SettingsCard";
import { DialogHost } from "./dialogs/DialogHost";
import { DashboardPanel } from "./DashboardPanel";
import { appStore, cfgStore, PANEL_ID, petStore, reportVisible, schedulePoll, setPanelSwitcher } from "./store";
import { startVoiceOwnership } from "./voiceowner";
import { t } from "./i18n";
import { adoptStyles } from "./styles";
import { createHttpSettingsScope } from "./config";

interface SlotsLike {
  inject(key: string, cb: () => (() => void) | Iterable<() => void>): () => void;
  register(options: Record<string, unknown>, component: (props: never) => unknown): () => void;
}

interface ClientCtx {
  get(name: string): unknown;
  /** 回调式可选注入（cordis）：deps 中服务在场（当下或之后注册）才执行 cb，缺席永不执行且不抛错 */
  inject?(deps: string[], cb: (c: { layout?: { selectPanel(id: string): void } }) => void): void;
  timeout?(fn: () => void, ms: number): () => void;
  interval?(fn: () => void, ms: number): () => void;
  effect?(fn: () => void | (() => void)): void;
}

/** sessions 服务（客户端半）快照形状双兼容：
 *  rc.1：list.getSnapshot() → { current }（当前选中会话 id）。
 *  0.2：list.getSnapshot() → { ids, byId: { [id]: { retainedBy: { mainView } } } }，
 *       「当前会话」= mainView 保留计数 > 0 的会话（dsh-client-ui-layout 同口径）。
 *  封装成选择器函数供 Pet 组件订阅；服务/字段缺失时恒返回 undefined（防御式）。 */
function makeUseSessions(ctx: ClientCtx): (sel: (s: { current?: string }) => unknown) => unknown {
  const svc = ctx.get("sessions") as { list?: { getSnapshot?: () => unknown; subscribe?: (fn: () => void) => () => void } } | undefined;
  const list = svc && typeof svc === "object" ? svc.list : undefined;
  const ok = !!list && typeof list.getSnapshot === "function";
  const read = (): { current?: string } => {
    try {
      const snap = list?.getSnapshot?.() as Record<string, unknown> | null | undefined;
      if (!snap || typeof snap !== "object") return { current: undefined };
      if (typeof snap.current === "string" && snap.current.length > 0) return { current: snap.current };
      const byId = snap.byId;
      if (byId && typeof byId === "object") {
        for (const [id, row] of Object.entries(byId as Record<string, { retainedBy?: { mainView?: unknown } } | undefined>)) {
          const n = row?.retainedBy?.mainView;
          if (typeof n === "number" && n > 0) return { current: id };
        }
      }
      return { current: undefined };
    } catch {
      return { current: undefined };
    }
  };
  // 恒定 hook（内部 useState/useEffect 无条件调用）：服务缺席时退化为一次性 undefined 读取
  return function useSessions(sel: (s: { current?: string }) => unknown): unknown {
    const [value, setValue] = React.useState(() => (ok ? sel(read()) : undefined));
    React.useEffect(() => {
      if (!ok) return;
      const sync = () => setValue(sel(read()));
      sync();
      return typeof list?.subscribe === "function" ? list.subscribe(sync) : undefined;
    }, []);
    return value;
  };
}

function OverlayEntry(props: Record<string, unknown>): React.ReactElement {
  const ctx = props.ctx as ClientCtx;
  const useSessions = props.useSessions as (sel: (s: { current?: string }) => unknown) => unknown;
  return (
    <>
      <Pet ctx={ctx} useSessions={useSessions} />
      <DialogHost />
    </>
  );
}

export function apply(ctx: ClientCtx): void {
  const slots = (ctx.get("slots") ?? (ctx as unknown as { slots?: unknown }).slots) as SlotsLike | undefined;
  if (slots === undefined) return; // TUI/无 slots：静默不激活 UI
  adoptStyles();
  reportVisible(petStore.visible);
  appStore.start();
  startVoiceOwnership(); // v2.2.1：唯一发声方选主（多标签页仅持锁页播放自动播报，防语音重叠）
  // P4：页签显隐切换立刻重排轮询节奏（可见回 1.5s / 隐藏降 5s）；无 document 环境（TUI/测试）守卫
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", schedulePoll);
  }

  // 配置后端：settingsScope 服务（0.1）已删除 → HTTP RPC 适配器（0.1/0.2 线缆形状
  // 一致，ns 自动发现；绑定失败或宿主无 settings 时降级 localStorage）。
  const scope = createHttpSettingsScope();
  if (typeof ctx.effect === "function") ctx.effect(() => appStore.attachSettings(scope));
  else appStore.attachSettings(scope);

  const useSessions = makeUseSessions(ctx);
  slots.inject("shell.overlay", () =>
    slots.register(
      { name: "shell.overlay", id: "foxbell-pet", order: 100 },
      (props) => React.createElement(OverlayEntry, Object.assign({}, props as Record<string, unknown>, { ctx, useSessions })),
    ),
  );
  slots.inject("sidebar.footer.action", () =>
    slots.register(
      { name: "sidebar.footer.action", id: "foxbell-pet-toggle", order: 100, label: () => "Foxbell" },
      (props) => React.createElement(PetToggle, props as { wide?: boolean }),
    ),
  );
  // 0.1：settings.plugin.item 按 key（settings 命名空间）派发的卡片槽（未声明则不运行）
  slots.inject("settings.plugin.item", () =>
    slots.register(
      { name: "settings.plugin.item", key: "foxbell-pet" },
      () => React.createElement(SettingsCard),
    ),
  );


  // ---- v2.2 R6（Task 13）：L3 大看板注册 + 钻取开关闸 + 侧栏入口门控 ----
  // layout 是可选注入（旧宿主可能无此服务；cordis 对未在 inject 声明的服务做 ctx.get/属性访问，
  // 服务缺席时直接抛错——rc.2 E2E 实锤：`cannot get property "layout" without inject`，
  // ?? 兜底根本没机会执行，整插件 apply 失败、宠物完全不挂载）。
  // 改用 ctx.inject 回调式可选注入（与宿主 index.js 的 settings 同款）：服务在场（当下或之后注册）
  // 才回调注入 switcher；缺席时回调不执行，openDashboardPanel 恒 false（调用方静默降级，spec R6）。
  // 不把 "layout" 加进 export inject（非硬依赖，不能因它阻塞加载）。
  if (typeof ctx.inject === "function") {
    ctx.inject(["layout"], (c) => {
      const layout = c && c.layout;
      if (layout && typeof layout.selectPanel === "function") setPanelSwitcher((id) => layout.selectPanel(id));
    });
  }

  // main 是按 key（面板 id）派发的主列槽：宿主 layout.selectPanel('foxbell-dashboard') 时挂载 DashboardPanel
  slots.inject("main", () =>
    slots.register(
      { name: "main", key: PANEL_ID },
      () => React.createElement(DashboardPanel),
    ),
  );

  // v2.2.1：sidebar.panellist 侧栏入口开关已移除——入口已有右键菜单 + 黑板链，
  // 且 rc.2 实测侧栏图标不投影（上游子槽生命周期），固定不注册侧栏图标。

  // 0.2：settings.section 整节注册（与 @deepseek-ai/dsh-client-ui-agent-preset 同款；
  // label 走本地 i18n thunk，renderSlot 只回调 thunk，无需 locale 命名空间）
  slots.inject("settings.section", () =>
    slots.register(
      { name: "settings.section", id: "foxbell-pet", order: 30, label: () => t("settings.cardTitle") },
      () => React.createElement(SettingsCard),
    ),
  );
}

// 模块级服务 inject：仅硬依赖 slots；timer/sessions/settingsScope 全部防御式 ctx.get
// （v1.3.0 的 inject:['slots','timer'] 中 timer 仅用于 later/interval，v2 改用 window 计时器，
//  卸载清理集中在组件 effect，语义等价）。
export const inject = ["slots"];

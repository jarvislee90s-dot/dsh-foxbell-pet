// index.tsx — 客户端半入口（__ModuleLoader__ bundle，esbuild cjs + banner/footer 包装）。
// 槽位：shell.overlay（宠物本体 + 对话框宿主）/ sidebar.footer.action（🦊 开关）/
//       settings.plugin.item key='foxbell-pet'（设置卡，与宿主 installSection ns 配对）。
// 防御式注入：slots/settingsScope/sessions 任一不在场时静默降级，不抛错、不影响宿主。
import React from "react";
import { Pet } from "./Pet";
import { PetToggle } from "./PetToggle";
import { SettingsCard } from "./SettingsCard";
import { DialogHost } from "./dialogs/DialogHost";
import { appStore, petStore, reportVisible } from "./store";
import { adoptStyles } from "./styles";

interface SlotsLike {
  inject(key: string, cb: () => (() => void) | Iterable<() => void>): () => void;
  register(options: Record<string, unknown>, component: (props: never) => unknown): () => void;
}

interface ClientCtx {
  get(name: string): unknown;
  timeout?(fn: () => void, ms: number): () => void;
  interval?(fn: () => void, ms: number): () => void;
  effect?(fn: () => void | (() => void)): void;
}

/** sessions 服务（客户端半，rc.1 契约）：`ctx.sessions.list` 是 ObservableSnapshot<SessionListState>
 *  （getSnapshot()/subscribe()），`current` 即当前选中会话 id（session-controller service.ts）。
 *  v1 时代槽位 props 携带 useSessions hook 的形态在 rc.1 无先例，改为直接读 list 快照——
 *  封装成选择器函数供 Pet 组件订阅；服务/字段缺失时恒返回 undefined（防御式）。 */
function makeUseSessions(ctx: ClientCtx): (sel: (s: { current?: string }) => unknown) => unknown {
  const svc = ctx.get("sessions") as { list?: { getSnapshot?: () => unknown; subscribe?: (fn: () => void) => () => void } } | undefined;
  const list = svc && typeof svc === "object" ? svc.list : undefined;
  const ok = !!list && typeof list.getSnapshot === "function";
  const read = () => {
    try {
      const snap = list?.getSnapshot?.() as { current?: string } | null | undefined;
      return snap && typeof snap === "object" ? snap : { current: undefined };
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

  // settingsScope（rc.1 仍在）：配置双后端接线；不在场时纯 localStorage（v1.3.0 语义）
  const settingsScope = ctx.get("settingsScope") as
    | { bind(spec: { namespace: string }): import("./config").SettingsScopeLike }
    | undefined;
  if (settingsScope !== undefined) {
    try {
      const scope = settingsScope.bind({ namespace: "foxbell-pet" });
      if (typeof ctx.effect === "function") ctx.effect(() => appStore.attachSettings(scope));
      else appStore.attachSettings(scope);
    } catch { /* 绑定失败：降级 localStorage */ }
  }

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
  // settings.plugin.item 是按 key（settings 命名空间）派发的卡片槽，
  // key 必须与宿主 installSection 的 ns 一致（'foxbell-pet'）
  slots.inject("settings.plugin.item", () =>
    slots.register(
      { name: "settings.plugin.item", key: "foxbell-pet" },
      () => React.createElement(SettingsCard),
    ),
  );
}

// 模块级服务 inject：仅硬依赖 slots；timer/sessions/settingsScope 全部防御式 ctx.get
// （v1.3.0 的 inject:['slots','timer'] 中 timer 仅用于 later/interval，v2 改用 window 计时器，
//  卸载清理集中在组件 effect，语义等价）。
export const inject = ["slots"];

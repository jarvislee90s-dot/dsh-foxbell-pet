// useLang.ts — 语言订阅钩子（React 消费侧；与 i18n.ts 的零 react 依赖解耦）。
// 语言切换（locale 服务 → setLang）时，挂了本钩子的组件子树立即重渲染，
// 其渲染期 t() 自然取到新语言。锚点：OverlayEntry（宠物/黑板/迷你条/菜单/对话框全子树）、
// DashboardPanel、SettingsCard（后两者是独立槽入口，不经 OverlayEntry）。
import { useSyncExternalStore } from "react";
import { langStore, type Lang } from "./i18n";

export function useLang(): Lang {
  return useSyncExternalStore(langStore.subscribe, langStore.getSnapshot);
}

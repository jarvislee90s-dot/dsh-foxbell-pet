// dialogs/host.ts — 对话框宿主：全局单例挂载点（shell.overlay 层内渲染 DialogHost），
// 菜单/设置卡/守卫通过 openDialog() 唤起。不引入 toast；错误一律内联呈现于对话框。
import type { GuardIssue, ActivateResult } from "../api";

export type DialogKind = "switch" | "import" | "manage" | "guard" | null;

export interface GuardDialogProps {
  targetId: string;
  issues: GuardIssue[];
  fatal?: boolean;
  plan?: ActivateResult["plan"];
  onResolved?(choice: "update" | "ignore" | "foxbell" | "hide"): void;
}

export interface DialogRequest {
  kind: Exclude<DialogKind, null>;
  props: Record<string, unknown>;
}

type Listener = (req: DialogRequest | null) => void;
const listeners = new Set<Listener>();
let current: DialogRequest | null = null;

export function openDialog(kind: Exclude<DialogKind, null>, props: Record<string, unknown> = {}): void {
  current = { kind, props };
  for (const l of [...listeners]) l(current);
}

export function closeDialog(): void {
  current = null;
  for (const l of [...listeners]) l(null);
}

export function subscribeDialogs(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function currentDialog(): DialogRequest | null {
  return current;
}

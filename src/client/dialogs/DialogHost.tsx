// dialogs/DialogHost.tsx — 对话框挂载点：订阅 openDialog/closeDialog，渲染当前对话框。
// 挂在 shell.overlay 槽（与宠物本体同层），任何入口（菜单/设置卡/守卫）都可唤起。
// 渲染经 portal 直挂 document.body：shell.overlay 的容器层 z-index 低（~20），
// DSH 设置弹窗（z-index 1000+）会压住同层弹窗；portal 脱离该 stacking context 后
// mask 自身的 2147483100 才生效，保证任何宿主弹窗之上。
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { closeDialog, currentDialog, subscribeDialogs, type DialogRequest, type GuardDialogProps } from "./host";
import { SwitchDialog } from "./SwitchDialog";
import { ImportDialog } from "./ImportDialog";
import { ManageDialog } from "./ManageDialog";
import { GuardDialog } from "./GuardDialog";

export function DialogHost(): React.ReactElement | null {
  const [req, setReq] = useState<DialogRequest | null>(currentDialog());
  useEffect(() => subscribeDialogs(setReq), []);
  if (!req) return null;
  let dialog: React.ReactElement;
  switch (req.kind) {
    case "switch":
      dialog = <SwitchDialog onClose={closeDialog} />;
      break;
    case "import":
      dialog = <ImportDialog onClose={closeDialog} />;
      break;
    case "manage":
      dialog = <ManageDialog onClose={closeDialog} />;
      break;
    case "guard":
      dialog = <GuardDialog {...(req.props as unknown as GuardDialogProps)} onClose={closeDialog} />;
      break;
    default:
      return null;
  }
  return createPortal(dialog, document.body);
}
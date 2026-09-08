// dialogs/DialogHost.tsx — 对话框挂载点：订阅 openDialog/closeDialog，渲染当前对话框。
// 挂在 shell.overlay 槽（与宠物本体同层），任何入口（菜单/设置卡/守卫）都可唤起。
import React, { useEffect, useState } from "react";
import { closeDialog, currentDialog, subscribeDialogs, type DialogRequest, type GuardDialogProps } from "./host";
import { SwitchDialog } from "./SwitchDialog";
import { ImportDialog } from "./ImportDialog";
import { ManageDialog } from "./ManageDialog";
import { GuardDialog } from "./GuardDialog";

export function DialogHost(): React.ReactElement | null {
  const [req, setReq] = useState<DialogRequest | null>(currentDialog());
  useEffect(() => subscribeDialogs(setReq), []);
  if (!req) return null;
  switch (req.kind) {
    case "switch":
      return <SwitchDialog onClose={closeDialog} />;
    case "import":
      return <ImportDialog onClose={closeDialog} />;
    case "manage":
      return <ManageDialog onClose={closeDialog} />;
    case "guard":
      return <GuardDialog {...(req.props as unknown as GuardDialogProps)} onClose={closeDialog} />;
    default:
      return null;
  }
}

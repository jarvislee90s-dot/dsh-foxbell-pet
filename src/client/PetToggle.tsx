// PetToggle.tsx — 侧栏底部 🦊 显隐开关（sidebar.footer.action；语义与 v1.3.0 相同，回归项）。
import React, { useEffect, useState } from "react";
import { petStore } from "./store";

export function PetToggle(props: { wide?: boolean }): React.ReactElement {
  const wide = props.wide;
  const [on, setOn] = useState(petStore.visible);
  useEffect(() => petStore.subscribe(() => setOn(petStore.visible)), []);
  return (
    <button
      className={"dyn-pet-toggle" + (on ? " on" : " off")}
      title={on ? "隐藏Foxbell桌宠" : "显示Foxbell桌宠"}
      onClick={(e) => { e.stopPropagation(); petStore.set(!petStore.visible); }}
    >
      <span className="dyn-pet-toggle-icon">🦊</span>
      {wide ? <span className="dyn-pet-toggle-text">{on ? "隐藏" : "显示"}</span> : null}
    </button>
  );
}

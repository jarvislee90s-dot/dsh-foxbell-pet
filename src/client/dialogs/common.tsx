// dialogs/common.tsx — 对话框共用壳与小组件（自绘，深色主题；不引入 toast）。
import React from "react";
import { t } from "../i18n";

export function Modal(props: {
  title: string;
  onClose(): void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}): React.ReactElement {
  return (
    <div className="dyn-pet-modal-mask" onPointerDown={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div className={"dyn-pet-modal" + (props.wide ? " wide" : "")} role="dialog" aria-label={props.title}>
        <div className="dyn-pet-modal-head">
          <span>{props.title}</span>
          <button className="dyn-pet-modal-x" onClick={props.onClose} aria-label={t("common.close")}>✕</button>
        </div>
        <div className="dyn-pet-modal-body">{props.children}</div>
        {props.footer ? <div className="dyn-pet-modal-foot">{props.footer}</div> : null}
      </div>
    </div>
  );
}

export function Btn(props: {
  onClick(): void;
  disabled?: boolean;
  kind?: "primary" | "danger" | "plain";
  children: React.ReactNode;
  title?: string;
}): React.ReactElement {
  return (
    <button
      className={"dyn-pet-btn " + (props.kind ?? "plain")}
      disabled={props.disabled}
      title={props.title}
      onClick={(e) => { e.stopPropagation(); props.onClick(); }}
    >
      {props.children}
    </button>
  );
}

export function InlineError(props: { msg: string | null }): React.ReactElement | null {
  if (!props.msg) return null;
  return <div className="dyn-pet-inline-error" role="alert">{props.msg}</div>;
}

export function InlineOk(props: { msg: string | null }): React.ReactElement | null {
  if (!props.msg) return null;
  return <div className="dyn-pet-inline-ok">{props.msg}</div>;
}

export function Spinner(): React.ReactElement {
  return <span className="dyn-pet-spinner" aria-hidden />;
}

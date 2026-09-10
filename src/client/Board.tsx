// Board.tsx — 小黑板（组件④）：v1.4.0 client.js Board 组件移植（L978-994）+ 客户端双语行拼装。
// 纯展示：宿主 dashboard.summary 驱动；无 summary 返回 null（无数据不弹，farewell 同样如此——源语义）。
// 关闭四路：✕ 在此；点外部/ESC 由 Pet 统一收口（均走 closeBoard，同时取消 ttl 定时器）；
// 自动消失由调用方（Pet.openBoard）的 ttl 定时器负责——Board 内不消费 ttlSec，仅作契约形状保留（与源一致）。
// 样式 310px 固定版式（.dyn-pet-board*，源 CSS 原样移植；行 normal 换行 per 7e16d62），不随 scale 缩放。
import type { ReactElement } from "react";
import { t } from "./i18n";
import type { DashboardSnapshot } from "./api";
import { boardRows } from "./boardrows";

export type BoardMode = "manual" | "farewell"; // manual：菜单/📖入口打开；farewell：关宠分发

export function Board(props: {
  dash: DashboardSnapshot | null;
  mode: BoardMode;
  ttlSec?: number;
  onClose(): void;
}): ReactElement | null {
  const s = (props.dash && props.dash.summary) || null;
  if (!s) return null; // 无 summary 不弹（farewell 同样如此——源 Board 原语义）
  return (
    <div className={"dyn-pet-board" + (props.mode === "farewell" ? " farewell" : "")}>
      <div className="dyn-pet-board-head">
        <span>{props.mode === "farewell" ? t("dash.farewellTitle") + " 🦊" : t("dash.summaryTitle")}</span>
        <button
          className="dyn-pet-board-x"
          onClick={(e) => { e.stopPropagation(); props.onClose(); }}
        >✕</button>
      </div>
      {boardRows(s).map((text, i) => (
        <div key={i} className="dyn-pet-board-row">{text}</div>
      ))}
      {/* 二期预留（issue #4 F38/F40/F41/F42/F45）：周报/缓存率趋势/失败率/耗时漂移/导出行在此追加（spec §9） */}
    </div>
  );
}

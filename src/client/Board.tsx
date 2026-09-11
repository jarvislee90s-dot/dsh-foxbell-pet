// Board.tsx — 小黑板（组件④）：v1.4.0 client.js Board 组件移植（L978-994）+ 客户端双语行拼装。
// 纯展示：宿主 dashboard.summary 驱动；无 summary 返回 null（无数据不弹，farewell 同样如此——源语义）。
// 关闭四路：✕ 在此；点外部/ESC 由 Pet 统一收口（均走 closeBoard，同时取消 ttl 定时器）；
// 自动消失由调用方（Pet.openBoard）的 ttl 定时器负责——Board 内不消费 ttlSec，仅作契约形状保留（与源一致）。
// 样式 310px 版式（.dyn-pet-board*，源 CSS 原样移植；行 normal 换行 per 7e16d62）；scale 缩放由
// 调用方（Pet 的 boardLayer 包装层 transform）承担——契约接口地图「位置与字号随三档缩放」适配点。
import type { ReactElement } from "react";
import { t } from "./i18n";
import type { DashboardSnapshot } from "./api";
import { boardRows } from "./boardrows";
import { fmtTokens, shortModel } from "./format";
import { TrendChart, lastN } from "./TrendChart";

export type BoardMode = "manual" | "farewell"; // manual：菜单/📖入口打开；farewell：关宠分发

export function Board(props: {
  dash: DashboardSnapshot | null;
  mode: BoardMode;
  ttlSec?: number;
  onClose(): void;
  /** v2.2 R4：入口行「查看完整看板 →」（L3 大看板开板回调；缺席时整行不渲染——面板切换在 Task 13 落地） */
  onOpenPanel?: () => void;
}): ReactElement | null {
  const s = (props.dash && props.dash.summary) || null;
  if (!s) return null; // 无 summary 不弹（farewell 同样如此——源 Board 原语义）
  const u = (props.dash && props.dash.usage) || null;
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
      {/* ---- v2.2 Task 11 加料三行（行序：既有行 → sparkline 行 → 模型 Top3 行 → 入口行；R4/R10）----
          防御式读取：trend/models 为 v2.2 增量字段，旧宿主缺省即整行跳过 */}
      {u && u.trend && u.trend.days ? (
        <div className="dyn-pet-board-row dyn-pet-board-spark">
          <span className="dyn-pet-board-spark-label">{t("dash.trend7")}</span>
          <TrendChart points={lastN(u.trend.days, 7)} width={270} height={44} />
        </div>
      ) : null}
      {u && Array.isArray(u.models) && u.models.length > 0 ? (
        <div className="dyn-pet-board-row dyn-pet-mini-dim">{t("dash.models") + " " + u.models.slice(0, 3).map((m) => `${shortModel(m.model || m.route)} ${fmtTokens(m.requestTotal)}`).join(" · ") + (u.models.length > 3 ? " " + t("dash.moreN", { n: String(u.models.length - 3) }) : "")}</div>
      ) : null}
      {props.onOpenPanel ? (
        <div className="dyn-pet-board-open" onClick={(e) => { e.stopPropagation(); props.onOpenPanel!(); }}>{t("dash.openPanel")} →</div>
      ) : null}
      {/* 二期预留（issue #4 F38/F40/F41/F42/F45）：周报/缓存率趋势/失败率/耗时漂移/导出行在此追加（spec §9） */}
    </div>
  );
}

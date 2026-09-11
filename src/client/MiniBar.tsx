// MiniBar.tsx — 五口径迷你条 + 节奏表盘（v1.4.0 client.js MiniBar 组件逐行移植，L996-1028）。
// 只读为主：容器 CSS pointer-events:none（区域外点击照旧穿透）；v2.2 R6 铁律修订——唯一例外
// 是尾部 .dyn-pet-mini-detail「详情 »」钻取按钮（pointer-events:auto，onDetail 在位时渲染，
// 点击开黑板 = L2 主链）。状态计数走 countsFromDash（宿主 dash.usage.counts 全量口径优先，
// 缺省/畸形回退本地 cards 计数；Task10 R10 follow-up）。
// 行文案经 t()（五口径名词逐字 = dash.* 键）；表盘档位标签由客户端按 pace.tier 查 dash.tier.*，
// 宿主下发的 zh pace.label 仅作未知档位兜底（v2.1 契约：PACE_LABELS 不再直发到 UI）。
// usageOn（Fix E 语义）只门控用量行（今日/缓存/你的输入/本会话标题），表盘行与状态计数行不受它管。
// v2 适配：字号/内边距/圆角/宽度走 px() 内联缩放（与 Sign.tsx/状态卡同款 v2 缩放口径，CSS 留 scale=1 版式）。
import type { ReactElement } from "react";
import { fmtTokens } from "./format";
import { t } from "./i18n";
import type { DashboardSnapshot, PaceSnapshot, PaceTier, ProjectCard } from "./api";
import { countsFromDash } from "./statuscards";
import type { PetScale } from "./config";

export type MiniMode = "hover" | "manual";

/** 档位→表盘宽度%（源 TIER_PCT 原表）；顺带充当已知档位注册表（未知 tier → 20% + 宿主 label 兜底） */
const TIER_PCT: Record<PaceTier, number> = {
  intense: 100, active: 65, longrun: 50, idle: 20, loaf1: 12, loaf2: 8, loaf3: 5, loaf4: 3,
};

/** 表盘档位标签：已知档位 → t("dash.tier.<tier>")；未知/缺档位 → 宿主 label → "—"（源 pace.label || '—'） */
function tierLabel(pace: PaceSnapshot | null): string {
  if (pace && TIER_PCT[pace.tier] !== undefined) return t(`dash.tier.${pace.tier}`);
  return (pace && pace.label) || "—";
}

export function MiniBar(props: {
  dash: DashboardSnapshot | null;
  cards: ProjectCard[];
  mode: MiniMode;
  scale: PetScale;
  /** cfg.usageEnabled（Fix E）：只门控用量行 */
  usageOn: boolean;
  /** v2.2 R6：提供时渲染尾部「详情 »」钻取按钮行（迷你条唯一可点元素 → 开黑板） */
  onDetail?: () => void;
}): ReactElement {
  const { dash, cards, mode, scale, usageOn } = props;
  const px = (v: number) => Math.round(v * scale);
  const pace = (dash && dash.pace) || null;
  const u = (dash && dash.usage) || null;
  const day = (u && u.day) || { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  // 五口径（2026-09-10 用户裁定，源注释原样）：请求输入=全文累计（uncached+命中）；命中/未命中/产出为真值；用户输入为宿主启发式估算
  const reqTotal = u && u.requestTotal !== undefined ? u.requestTotal : (day.inputTokens || 0) + (day.cacheReadTokens || 0);
  const hit = u && u.cacheHitRate !== undefined ? u.cacheHitRate : 0;
  const sess = u ? u.session : null;
  const sessReq = sess
    ? (sess.requestTotal !== undefined ? sess.requestTotal : (sess.inputTokens || 0) + (sess.cacheReadTokens || 0))
    : null;
  // 状态计数（v2.2 R10 follow-up 函数化）：宿主 usage.counts 优先，缺省回退本地 cards 计数
  const counts = countsFromDash(dash, cards);
  // 状态计数行（源拼接结构原样：计数为 0 的段整体省略，全 0 → dash.noActive）
  const countsText =
    (counts.approval ? counts.approval + " " + t("dash.countApproval") + " · " : "")
    + (counts.running ? counts.running + " " + t("dash.countRunning") + " · " : "")
    + (counts.done ? counts.done + " " + t("dash.countDone") : "")
    || t("dash.noActive");

  return (
    <div
      className="dyn-pet-mini"
      data-mode={mode}
      style={{ width: px(248), padding: `${px(8)}px ${px(10)}px`, borderRadius: px(10), fontSize: px(12) }}
    >
      <div className="dyn-pet-mini-dial" style={{ gap: px(8), marginBottom: px(4) }}>
        <div className="dyn-pet-mini-bar" style={{ height: px(6) }}>
          <i style={{ width: ((pace && TIER_PCT[pace.tier]) || 20) + "%" }} />
        </div>
        <span className="dyn-pet-mini-tier">{tierLabel(pace)}</span>
      </div>
      {usageOn ? (
        <>
          <div className="dyn-pet-mini-row">
            {t("dash.today") + " " + t("dash.requestInput") + " " + fmtTokens(reqTotal)
              + " · " + t("dash.hit") + " " + (hit * 100).toFixed(1) + "%"}
          </div>
          <div className="dyn-pet-mini-row">
            {t("dash.cacheHit") + " " + fmtTokens(day.cacheReadTokens || 0)
              + " · " + t("dash.output") + " " + fmtTokens(day.outputTokens || 0)}
          </div>
          {/* 含子代理为口径说明、恒定出现（源无条件拼接：userEst 估算含子代理 token） */}
          <div className="dyn-pet-mini-row dyn-pet-mini-dim" style={{ fontSize: px(11) }}>
            {t("dash.yourInput") + " ~" + fmtTokens(u ? u.userEst || 0 : 0)
              + t("dash.estimateSuffix") + " · " + t("dash.withSubagents")}
          </div>
        </>
      ) : null}
      <div className="dyn-pet-mini-row">{countsText}</div>
      {usageOn && sess && sess.title ? (
        <div className="dyn-pet-mini-row dyn-pet-mini-dim" style={{ fontSize: px(11) }}>
          {t("dash.sessionReq") + " " + t("dash.request") + " "
            + (sessReq !== null ? fmtTokens(sessReq) : "—") + " · " + sess.title}
        </div>
      ) : null}
      {/* v2.2 R6 钻取按钮（迷你条唯一可点元素）：pointerdown 亦拦下（与 .dyn-pet-entry 同模式）——
          否则冒泡到 root 的 onPointerDown 会先关掉 hover 迷你条/起拖拽，click 永不落地 */}
      {props.onDetail ? (
        <div
          className="dyn-pet-mini-detail"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); props.onDetail!(); }}
        >
          {t("dash.detail")} »
        </div>
      ) : null}
      {/* 二期预留（issue #4 F10）：sparkline 迷你趋势行挂此（spec §9） */}
    </div>
  );
}

// Sign.tsx — 警报举牌（v1.4.0 client.js L880 渲染 + L1066 样式原样移植）。
// 容器分工（spec 6.2）：数字类警报走举牌（里程碑一句话走气泡，见 Pet.tsx showBubble 分流）。
// v2 适配：字号/内边距/圆角走 px() 内联缩放（与状态卡/气泡同款 v2 缩放口径，CSS 留 scale=1 版式）。
import type { ReactElement } from "react";

export function Sign(props: { text: string; scale: number }): ReactElement {
  const { text, scale } = props;
  const px = (v: number) => Math.round(v * scale);
  return (
    <div
      className="dyn-pet-sign"
      style={{ fontSize: px(12), padding: `${px(4)}px ${px(10)}px`, borderRadius: px(6) }}
    >
      🏷 {text}
    </div>
  );
}

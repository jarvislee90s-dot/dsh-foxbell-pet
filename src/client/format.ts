// format.ts — token 万/亿格式化（宿主 formatTokens 原样移植：src/host/dashboard.js L92-101，
// 与 v1.4.0 client.js L1009 迷你条 fmt 在正有限域逐位等价；负数/非有限按宿主口径归 "0" 更安全）。
// 契约：客户端 fmtTokens 与宿主 formatTokens 对同一数值必须渲染同一字符串（test/client-logic.test.ts 逐值恒等校验）。
// 尾零规则（源）：万档 toFixed(1) 只剥 ".0"；亿档 toFixed(2) 剥全部尾零（含小数点，"1.00"→"1"、"1.20"→"1.2"）。

export function fmtTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 10000) return String(Math.round(n));
  if (n < 100000000) {
    const v = (n / 10000).toFixed(1);
    return (v.endsWith(".0") ? v.slice(0, -2) : v) + "万";
  }
  const v = (n / 100000000).toFixed(2);
  return v.replace(/\.?0+$/, "") + "亿";
}

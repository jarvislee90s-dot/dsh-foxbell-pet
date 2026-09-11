// quotes.ts — v2.2 R8 导出评语池：纯规则匹配（无 LLM），zh/en 双池（各 10 条）；自定义模板优先。
// pickQuote 聚合输入由 DashboardPanel 从当前视图数据推导（hero 合计/窗口命中率/趋势末两日/模型数/
// 快照 pace 档位 loaf*）；fillQuote 模板占位符 {range}/{tokens}/{hitPct}/{models}（spec R8 命名，
// plan Self-Review ⑦ 固定 {hitPct}——{hit} 是 QuoteVars 的变量键名，非占位符）。
export interface QuoteAgg { total: number; hitPct: number; trendUp: boolean | null; multiModel: boolean; loaf: boolean }
export interface QuoteVars { range: string; tokens: string; hit: string; models: string }

const POOL: Record<"zh" | "en", { when: (a: QuoteAgg) => boolean; text: string }[]> = {
  zh: [
    { when: (a) => a.hitPct >= 0.9, text: "缓存吃得干干净净，省钱小能手！" },
    { when: (a) => a.hitPct > 0 && a.hitPct < 0.5, text: "缓存有点冷，上下文还在热身。" },
    { when: (a) => a.total >= 1_000_000, text: "百万俱乐部又添一日。" },
    { when: (a) => a.total === 0, text: "今天还没开工，日志本空空的。" },
    { when: (a) => a.total < 100_000, text: "今天很节制，尾巴都翘起来了。" },
    { when: (a) => a.trendUp === true, text: "用量在爬坡，我在看着呢。" },
    { when: (a) => a.trendUp === false, text: "用量在收敛，干得漂亮。" },
    { when: (a) => a.multiModel, text: "多线作战，指挥若定。" },
    { when: (a) => a.loaf, text: "今天有点闲，摸鱼使我快乐。" },
    { when: () => true, text: "又是好好干活的一天。" },
  ],
  en: [
    { when: (a) => a.hitPct >= 0.9, text: "Cache hit like a pro!" },
    { when: (a) => a.hitPct > 0 && a.hitPct < 0.5, text: "Cache still warming up." },
    { when: (a) => a.total >= 1_000_000, text: "Another day in the million club." },
    { when: (a) => a.total === 0, text: "Nothing logged yet today." },
    { when: (a) => a.total < 100_000, text: "Lean day. Tail's up!" },
    { when: (a) => a.trendUp === true, text: "Usage is climbing, I'm watching." },
    { when: (a) => a.trendUp === false, text: "Usage is tapering. Nice." },
    { when: (a) => a.multiModel, text: "Multi-model ops, fully in control." },
    { when: (a) => a.loaf, text: "Quiet day. Loaf mode." },
    { when: () => true, text: "Another good day's work." },
  ],
};

export function fillQuote(tpl: string, v: QuoteVars): string {
  return tpl.split("{range}").join(v.range).split("{tokens}").join(v.tokens).split("{hitPct}").join(v.hit).split("{models}").join(v.models);
}

export function pickQuote(a: QuoteAgg, lang: "zh" | "en", custom?: string, vars?: QuoteVars): string {
  if (custom && custom.trim()) return fillQuote(custom.trim(), vars ?? { range: "", tokens: "", hit: "", models: "" });
  for (const r of POOL[lang]) if (r.when(a)) return r.text;
  return POOL[lang][POOL[lang].length - 1].text;
}

// cost-csv.js — 与费用行消费同一快照的纯 USD CSV 序列化器。
export const COST_CSV_COLUMNS = Object.freeze([
  'source_id',
  'observed_provider',
  'model_id',
  'normalized_model_id',
  'token_usage',
  'estimated_usd',
  'status',
  'priced_tokens',
  'unpriced_tokens',
  'coverage_rate',
  'pricing_provider',
  'pricing_model',
  'pricing_snapshot_id',
  'price_updated_at',
  'pricing_basis',
  'price_rule_kind',
  'time_price_daily_fallback',
  'range_from',
  'range_to',
])

// 外部文本即使以控制符 / 空白开头也检查公式候选；数值列不添加文本前缀。
export function csvTextCell(raw) {
  const value = String(raw ?? '')
  const safe = /^(?:[\t\r\n]|\s*[=+\-@])/.test(value) ? `'${value}` : value
  return `"${safe.replaceAll('"', '""')}"`
}

function valueCell(raw) {
  return raw === null || raw === undefined ? '' : String(raw)
}

function isoCell(raw) {
  if (!Number.isFinite(raw) || !Number.isFinite(new Date(raw).getTime())) return ''
  return new Date(raw).toISOString()
}

export function serializeCostCsv(snapshot) {
  const lines = [COST_CSV_COLUMNS.join(',')]
  for (const row of snapshot?.rows || []) {
    const usd = row.usd || {}
    const values = [
      valueCell('dsh'),
      csvTextCell(row.route?.provider),
      csvTextCell(row.route?.model),
      csvTextCell(row.normalizedModel),
      valueCell(row.tokenUsage),
      valueCell(usd.amount),
      valueCell(usd.status),
      valueCell(usd.pricedTokens),
      valueCell(usd.unpricedTokens),
      valueCell(usd.coverageRate),
      csvTextCell(row.pricingProvider),
      csvTextCell(row.pricingModel),
      valueCell(snapshot?.pricingSnapshotId),
      isoCell(row.priceUpdatedAt),
      valueCell(row.pricingBasis),
      valueCell(row.priceRuleKind),
      valueCell(row.timePriceDailyFallback === true),
      isoCell(snapshot?.span?.from),
      isoCell(snapshot?.span?.to),
    ]
    lines.push(values.join(','))
  }
  return `${lines.join('\r\n')}\r\n`
}

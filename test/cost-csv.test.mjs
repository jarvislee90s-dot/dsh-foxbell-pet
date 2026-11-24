import { describe, expect, it } from 'vitest'
import { COST_CSV_COLUMNS, csvTextCell, serializeCostCsv } from '../src/host/cost-csv.js'

function parseCsv(text) {
  const rows = [[]]
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') quoted = false
      else field += char
      continue
    }
    if (char === '"') quoted = true
    else if (char === ',') {
      rows.at(-1).push(field)
      field = ''
    } else if (char === '\r' && text[i + 1] === '\n') {
      rows.at(-1).push(field)
      rows.push([])
      field = ''
      i++
    } else field += char
  }
  if (field || rows.at(-1).length) rows.at(-1).push(field)
  return rows.filter(row => row.length > 0 && (row.length > 1 || row[0] !== ''))
}

function snapshot() {
  return {
    pricingSnapshotId: 'synthetic-snapshot-id',
    span: { from: 0, to: 86_400_000, grain: 'day' },
    rows: [
      {
        route: { provider: '=HYPERLINK("x")', model: 'line 1\n"line 2"' },
        normalizedModel: '+synthetic-model',
        tokenUsage: null,
        usd: { amount: null, status: 'unpriced', pricedTokens: 0, unpricedTokens: null, coverageRate: null },
        pricingProvider: null,
        pricingModel: null,
        priceUpdatedAt: null,
        pricingBasis: 'none',
        priceRuleKind: 'none',
        timePriceDailyFallback: false,
      },
      {
        route: { provider: 'fixture-provider', model: 'fixture-model' },
        normalizedModel: 'fixture-model',
        tokenUsage: 1_000_000,
        usd: { amount: '0', status: 'priced', pricedTokens: 1_000_000, unpricedTokens: 0, coverageRate: 1 },
        pricingProvider: 'fixture-provider',
        pricingModel: 'fixture-model',
        priceUpdatedAt: 1_793_721_800_000,
        pricingBasis: 'manual',
        priceRuleKind: 'fixed',
        timePriceDailyFallback: false,
      },
    ],
  }
}

describe('serializeCostCsv', () => {
  it('uses the exact Foxbell column order, CRLF and no total row', () => {
    const csv = serializeCostCsv(snapshot())
    const rows = parseCsv(csv)
    expect(rows[0]).toEqual(COST_CSV_COLUMNS)
    expect(rows).toHaveLength(3)
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csv.replaceAll('\r\n', '')).not.toContain('\n\r')
    expect(rows[1]).toHaveLength(19)
    expect(rows[2]).toHaveLength(19)
  })

  it('keeps null amounts and unknown coverage empty while preserving a real zero', () => {
    const rows = parseCsv(serializeCostCsv(snapshot()))
    const index = Object.fromEntries(COST_CSV_COLUMNS.map((name, i) => [name, i]))
    expect(rows[1][index.estimated_usd]).toBe('')
    expect(rows[1][index.token_usage]).toBe('')
    expect(rows[1][index.unpriced_tokens]).toBe('')
    expect(rows[1][index.coverage_rate]).toBe('')
    expect(rows[1][index.price_updated_at]).toBe('')
    expect(rows[1][index.range_from]).toBe('1970-01-01T00:00:00.000Z')
    expect(rows[1][index.range_to]).toBe('1970-01-02T00:00:00.000Z')
    expect(rows[2][index.estimated_usd]).toBe('0')
    expect(rows[2][index.coverage_rate]).toBe('1')
    expect(rows[2][index.source_id]).toBe('dsh')
  })

  it('escapes quotes/newlines and protects formula-shaped external text', () => {
    const csv = serializeCostCsv(snapshot())
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    expect(csv).toContain('"line 1\n""line 2"""')
    expect(csv).toContain('"\'+synthetic-model"')
    const rows = parseCsv(csv)
    expect(rows[1][1]).toBe('\'=HYPERLINK("x")')
    expect(rows[1][2]).toBe('line 1\n"line 2"')
  })

  it.each(['=1+1', '+cmd', '-2', '@SUM(1)', ' \t=1', '\n=1', '\r@x'])('prefixes formula candidate %j', value => {
    const cell = csvTextCell(value)
    expect(cell.startsWith('"\'') || cell.startsWith(`"'`)).toBe(true)
    expect(parseCsv(`${cell}\r\n`)[0][0]).toBe(`'${value}`)
  })

  it('does not alter ordinary external text', () => {
    expect(csvTextCell('fixture/model')).toBe('"fixture/model"')
    expect(csvTextCell(null)).toBe('""')
  })
})

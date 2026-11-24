import { spawnSync } from "node:child_process"
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openRuleStore, priceBand, resolveRule, validateRules } from '../src/host/price-rules.js'

const roots = []
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

const prices = { inputTokens: '2', cacheReadTokens: null, cacheWriteTokens: null, outputTokens: '8' }
const fixed = { model: 'synthetic-model', provider: null, currency: 'USD', kind: 'fixed', prices }
const fridayWindow = {
  model: 'synthetic-model', provider: null, currency: 'USD', kind: 'time', zone: 'utc',
  windows: [{ start: 23, end: 2 }], peak: prices, offpeak: { ...prices, inputTokens: '1' },
}

describe('validateRules', () => {
  it('accepts explicit zero and normalizes blank cells', () => {
    const [rule] = validateRules([{ ...fixed, prices: { ...prices, inputTokens: '0', outputTokens: '' } }])
    expect(rule.prices.inputTokens).toBe('0')
    expect(rule.prices.outputTokens).toBeNull()
  })

  it.each(['1e3', '-1', '0.0000000001', '.5', '1.', `${'9'.repeat(400)}`])('rejects invalid price %s', value => {
    expect(() => validateRules([{ ...fixed, prices: { ...prices, inputTokens: value } }])).toThrow()
  })

  it('requires at least one price and unique provider/model keys', () => {
    expect(() => validateRules([{ ...fixed, prices: { inputTokens: '', cacheReadTokens: null, cacheWriteTokens: null, outputTokens: null } }])).toThrow()
    expect(() => validateRules([fixed, fixed])).toThrow(/重复|pricing-rules-invalid/)
  })

  it('rejects zero-length, illegal and colliding windows including midnight overflow', () => {
    expect(() => validateRules([{ ...fridayWindow, windows: [{ start: 2, end: 2 }] }])).toThrow()
    expect(() => validateRules([{ ...fridayWindow, windows: [{ start: 24, end: 2 }] }])).toThrow()
    expect(() => validateRules([{ ...fridayWindow, windows: [{ start: 23, end: 2 }, { start: 1, end: 3 }] }])).toThrow(/重叠|pricing-rules-invalid/)
    expect(() => validateRules([{ ...fridayWindow, windows: [{ start: 8, end: 12 }, { start: 12, end: 18 }] }])).not.toThrow()
  })
})

describe('resolveRule / priceBand', () => {
  it('prefers provider-scoped rules over global rules without matching another provider', () => {
    const providerRule = { ...fixed, provider: 'fixture-provider' }
    expect(resolveRule([fixed, providerRule], { provider: 'fixture-provider', model: 'raw-model' }, 'synthetic-model')).toBe(providerRule)
    expect(resolveRule([fixed, providerRule], { provider: 'other', model: 'raw-model' }, 'synthetic-model')).toBe(fixed)
    expect(resolveRule([providerRule], { provider: null, model: null }, 'synthetic-model')).toBeNull()
  })

  it('uses the starting workday for Friday midnight overflow and excludes the end hour', () => {
    expect(priceBand(fridayWindow, Date.parse('2026-11-20T23:00:00Z'))).toBe('peak')
    expect(priceBand(fridayWindow, Date.parse('2026-11-21T01:00:00Z'))).toBe('peak')
    expect(priceBand(fridayWindow, Date.parse('2026-11-21T02:00:00Z'))).toBe('offpeak')
    expect(priceBand(fridayWindow, Date.parse('2026-11-21T23:00:00Z'))).toBe('offpeak')
    expect(priceBand(fridayWindow, Date.parse('2026-11-23T01:00:00Z'))).toBe('offpeak')
    expect(priceBand(fridayWindow, null)).toBe('dailyFallback')
  })

  it('converts UTC Friday 17:00 to Shanghai Saturday 01:00 before selecting the band', () => {
    const shanghai = { ...fridayWindow, zone: 'asiaShanghai' }
    expect(priceBand(shanghai, Date.parse('2026-11-20T17:00:00Z'))).toBe('peak')
    expect(priceBand(shanghai, Date.parse('2026-11-20T18:00:00Z'))).toBe('offpeak')
  })
})

describe('openRuleStore', () => {
  it('increments revisions and rejects stale saves without overwriting the valid file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foxbell-rules-'))
    roots.push(root)
    const file = path.join(root, 'pricing', 'rules.json')
    const store = openRuleStore(file)
    expect(store.get()).toEqual({ revision: 0, rules: [] })
    expect(store.save(0, [fixed])).toMatchObject({ revision: 1 })
    const before = fs.readFileSync(file, 'utf8')
    expect(() => store.save(0, [])).toThrow(expect.objectContaining({ status: 409 }))
    expect(fs.readFileSync(file, 'utf8')).toBe(before)
    expect(store.save(1, [])).toEqual({ revision: 2, rules: [] })
  })

  it('rejects stale saves from a second store opened on the same file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foxbell-rules-shared-'))
    roots.push(root)
    const file = path.join(root, 'rules.json')
    const web = openRuleStore(file)
    const desktop = openRuleStore(file)
    expect(desktop.get().revision).toBe(0)
    web.save(0, [fixed])
    expect(() => desktop.save(0, [])).toThrow(expect.objectContaining({ status: 409 }))
    expect(desktop.get()).toEqual(web.get())
    expect(desktop.get().rules).toHaveLength(1)
  })

  it('can save after a crashed writer left its claim behind', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foxbell-rules-exited-'))
    roots.push(root)
    const file = path.join(root, 'rules.json')
    const exited = spawnSync(process.execPath, ['-e', 'process.exit(0)'])
    expect(exited.status).toBe(0)
    fs.mkdirSync(file + '.writers')
    fs.writeFileSync(path.join(file + '.writers', `${exited.pid}-1`), '')
    expect(openRuleStore(file).save(0, [fixed]).revision).toBe(1)
  })

  it('reports corrupt disk JSON and never silently replaces it', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foxbell-rules-corrupt-'))
    roots.push(root)
    const file = path.join(root, 'rules.json')
    fs.writeFileSync(file, '{broken')
    const store = openRuleStore(file)
    expect(store.get().error.code).toBe('pricing-store-corrupt')
    expect(() => store.save(0, [fixed])).toThrow(/pricing-store-corrupt/)
    expect(fs.readFileSync(file, 'utf8')).toBe('{broken')
  })
})

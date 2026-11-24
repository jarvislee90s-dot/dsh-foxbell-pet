import { describe, expect, it } from 'vitest'
import { fmtMoney, fmtTokens } from '../src/client/format'
import { axisTicks } from '../src/client/TrendChart'

describe('token display rule', () => {
  it('keeps exact counts below ten thousand', () => {
    expect(fmtTokens(0)).toBe('0')
    expect(fmtTokens(9999)).toBe('9999')
    expect(fmtTokens(1234)).toBe('1234')
  })

  it('switches to 万 at ten thousand and 亿 at one hundred million', () => {
    expect(fmtTokens(10000)).toBe('1万')
    expect(fmtTokens(12345)).toBe('1.2万')
    expect(fmtTokens(99999999)).toBe('10000万')
    expect(fmtTokens(100000000)).toBe('1亿')
    expect(fmtTokens(123456789)).toBe('1.23亿')
  })
})

describe('money display rule', () => {
  it('always shows two decimals for a finite amount', () => {
    expect(fmtMoney('10.75')).toBe('10.75')
    expect(fmtMoney('10')).toBe('10.00')
    expect(fmtMoney('0.000000004')).toBe('0.00')
    expect(fmtMoney('2.005')).toBe('2.01')
  })

  it('renders an unknown amount as an em dash rather than zero', () => {
    expect(fmtMoney(null)).toBe('—')
    expect(fmtMoney('')).toBe('—')
  })
})

describe('trend chart axis', () => {
  it('produces ascending ticks including zero and the rounded maximum', () => {
    const ticks = axisTicks(12345, 3)
    expect(ticks[0]).toBe(0)
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(12345)
    expect(ticks).toHaveLength(3)
    expect([...ticks].sort((a, b) => a - b)).toEqual(ticks)
  })

  it('never divides by zero for an all-zero series', () => {
    const ticks = axisTicks(0, 3)
    expect(ticks.every((v) => Number.isFinite(v))).toBe(true)
    expect(ticks[ticks.length - 1]).toBeGreaterThan(0)
  })
})

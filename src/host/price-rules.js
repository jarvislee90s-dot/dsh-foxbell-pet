// price-rules.js — 手动固定价 / 工作日分时价的校验、匹配与原子修订存储。
import fs from 'node:fs'
import path from 'node:path'
import { PetError } from './errors.js'

export const PRICE_BUCKETS = ['inputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'outputTokens']
export const MAX_PRICE_RULES = 200
export const MAX_PRICE_WINDOWS = 24

const PRICE_RE = /^\d+(\.\d{1,9})?$/
const WEEKDAYS = new Map(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => [day, index]))
const ZONES = { local: undefined, asiaShanghai: 'Asia/Shanghai', utc: 'UTC' }
const formatters = new Map()
let tmpCounter = 0

function invalid(detail) {
  return new PetError('pricing-rules-invalid', detail)
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function normalizePrice(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw !== 'string' || !PRICE_RE.test(raw) || !Number.isFinite(Number(raw))) {
    throw invalid(`价格须为非负十进制字符串，最多 9 位小数: ${String(raw)}`)
  }
  const [whole, fraction = ''] = raw.split('.')
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '')
  const normalizedFraction = fraction.replace(/0+$/, '')
  return normalizedFraction ? `${normalizedWhole}.${normalizedFraction}` : normalizedWhole
}

function normalizeCells(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw invalid('价格桶必须是对象')
  const cells = {}
  for (const bucket of PRICE_BUCKETS) cells[bucket] = normalizePrice(raw[bucket])
  return cells
}

function hasPrice(cells) {
  return PRICE_BUCKETS.some(bucket => cells[bucket] !== null)
}

function normalizeWindows(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_PRICE_WINDOWS) {
    throw invalid(`分时窗口数量须为 1–${MAX_PRICE_WINDOWS}`)
  }
  const windows = raw.map(window => {
    if (!window || typeof window !== 'object' || Array.isArray(window)) throw invalid('分时窗口必须是对象')
    const { start, end } = window
    if (!Number.isInteger(start) || start < 0 || start > 23 || !Number.isInteger(end) || end < 0 || end > 24) {
      throw invalid('分时窗口边界必须是整点：start 0–23，end 0–24')
    }
    if (start === end) throw invalid('分时窗口不能为零长度')
    return { start, end }
  })

  // 周一为小时 0。周五跨午夜会落到周六，周六自身不展开窗口。
  const expanded = []
  for (let day = 0; day < 5; day++) {
    for (const { start, end } of windows) {
      const from = day * 24 + start
      const to = start < end ? day * 24 + end : day * 24 + 24 + end
      expanded.push({ from, to })
    }
  }
  expanded.sort((a, b) => a.from - b.from || a.to - b.to)
  for (let i = 1; i < expanded.length; i++) {
    if (expanded[i].from < expanded[i - 1].to) throw invalid('分时窗口不得重叠（含跨午夜溢出）')
  }
  return windows.sort((a, b) => a.start - b.start || a.end - b.end)
}

export function validateRules(raw) {
  if (!Array.isArray(raw)) throw invalid('计价规则必须是数组')
  if (raw.length > MAX_PRICE_RULES) throw invalid(`计价规则最多 ${MAX_PRICE_RULES} 条`)
  const seen = new Set()
  return raw.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw invalid('计价规则必须是对象')
    if (typeof item.model !== 'string' || item.model.trim().length === 0) throw invalid('规则 model 不能为空')
    const model = item.model.trim()
    if (item.provider !== null && (typeof item.provider !== 'string' || item.provider.trim().length === 0)) {
      throw invalid('规则 provider 必须是 null 或非空字符串')
    }
    const provider = item.provider === null ? null : item.provider.trim()
    if (item.currency !== 'USD' && item.currency !== 'CNY') throw invalid('规则币种必须是 USD 或 CNY')
    const key = JSON.stringify([provider, model])
    if (seen.has(key)) throw invalid(`同一供应商 / 模型的规则重复: ${key}`)
    seen.add(key)
    const base = { model, provider, currency: item.currency }
    if (item.kind === 'fixed') {
      const prices = normalizeCells(item.prices)
      if (!hasPrice(prices)) throw invalid('固定价至少填写一个有效价格桶')
      return { ...base, kind: 'fixed', prices }
    }
    if (item.kind === 'time') {
      if (!Object.hasOwn(ZONES, item.zone)) throw invalid('分时区必须是 local、asiaShanghai 或 utc')
      const windows = normalizeWindows(item.windows)
      const peak = normalizeCells(item.peak)
      const offpeak = normalizeCells(item.offpeak)
      if (!hasPrice(peak) && !hasPrice(offpeak)) throw invalid('分时价至少填写一个有效价格桶')
      return { ...base, kind: 'time', zone: item.zone, windows, peak, offpeak }
    }
    throw invalid('规则 kind 必须是 fixed 或 time')
  })
}

export function resolveRule(rules, route, normalizedModel) {
  if (!Array.isArray(rules) || typeof normalizedModel !== 'string') return null
  const candidates = rules.filter(rule => rule && rule.model === normalizedModel)
  const provider = route && typeof route.provider === 'string' ? route.provider : null
  if (provider !== null) {
    const scoped = candidates.filter(rule => rule.provider === provider)
    if (scoped.length > 1) return null
    if (scoped.length === 1) return scoped[0]
  }
  const global = candidates.filter(rule => rule.provider === null)
  return global.length === 1 ? global[0] : null
}

function formatterFor(zone) {
  if (!formatters.has(zone)) {
    formatters.set(zone, new Intl.DateTimeFormat('en-GB', {
      timeZone: ZONES[zone], weekday: 'short', hour: '2-digit', hourCycle: 'h23',
    }))
  }
  return formatters.get(zone)
}

function wallHour(at, zone) {
  const parts = formatterFor(zone).formatToParts(new Date(at))
  const weekday = parts.find(part => part.type === 'weekday')?.value
  const hour = Number(parts.find(part => part.type === 'hour')?.value)
  const day = WEEKDAYS.get(weekday)
  if (day === undefined || !Number.isInteger(hour)) throw invalid('无法解析分时区墙钟时间')
  return { day, hour }
}

const isWorkday = day => day >= 0 && day <= 4

export function priceBand(rule, at) {
  if (rule?.kind === 'fixed') return 'fixed'
  if (rule?.kind !== 'time') return 'dailyFallback'
  if (at === null || !Number.isFinite(at)) return 'dailyFallback'
  const { day, hour } = wallHour(at, rule.zone)
  for (const { start, end } of rule.windows) {
    const inWindow = start < end
      ? isWorkday(day) && start <= hour && hour < end
      : (isWorkday(day) && hour >= start) || (isWorkday((day + 6) % 7) && hour < end)
    if (inWindow) return 'peak'
  }
  return 'offpeak'
}

function conflict(revision) {
  return new PetError('revision-conflict', `计价规则修订冲突，当前 revision=${revision}`)
}

function readSnapshot(file) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return { revision: 0, rules: [], error: null }
    return { revision: 0, rules: [], error: { code: 'pricing-store-read-failed', detail: error.message } }
  }
  try {
    const raw = JSON.parse(text)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw invalid('规则快照必须是对象')
    if (!Number.isSafeInteger(raw.revision) || raw.revision < 0) throw invalid('规则 revision 非法')
    return { revision: raw.revision, rules: validateRules(raw.rules), error: null }
  } catch (error) {
    return {
      revision: 0,
      rules: [],
      error: { code: 'pricing-store-corrupt', detail: String(error?.message || error) },
    }
  }
}

export function openRuleStore(file) {
  return {
    get() {
      const state = readSnapshot(file)
      const snapshot = { revision: state.revision, rules: clone(state.rules) }
      if (state.error) snapshot.error = { code: state.error.code, detail: 'Unable to read pricing rules' }
      return snapshot
    },
    save(expectedRevision, rules) {
      const normalized = validateRules(rules)
      const dir = path.dirname(file)
      const writers = file + '.writers'
      const id = `${process.pid}-${Date.now()}${tmpCounter++}`
      const claim = path.join(writers, id)
      const tmp = path.join(dir, `.rules-${id}.tmp`)
      let claimed = false
      try {
        fs.mkdirSync(writers, { recursive: true, mode: 0o700 })
        // Register before looking for other writers. Overlapping attempts may both
        // fail safely; claims belonging to a dead process do not block a restart.
        fs.writeFileSync(claim, '', { flag: 'wx', mode: 0o600 })
        claimed = true
        for (const other of fs.readdirSync(writers)) {
          if (other === id) continue
          const match = /^([1-9]\d*)-\d+$/.exec(other)
          if (!match) continue
          try { process.kill(Number(match[1]), 0) } catch (error) {
            if (error?.code === 'ESRCH') {
              try { fs.rmSync(path.join(writers, other), { force: true }) } catch { /* ignored */ }
              continue
            }
          }
          throw new PetError('revision-conflict', 'Another host is saving pricing rules')
        }
        const state = readSnapshot(file)
        if (state.error) throw new PetError(state.error.code, `Unable to read pricing rules (${state.error.code})`)
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== state.revision) throw conflict(state.revision)
        const next = { revision: state.revision + 1, rules: normalized }
        fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
        fs.renameSync(tmp, file)
        return clone(next)
      } catch (error) {
        if (error instanceof PetError) throw error
        throw new PetError('pricing-store-write-failed', 'Unable to save pricing rules')
      } finally {
        if (claimed) {
          try { fs.rmSync(tmp, { force: true }) } catch { /* best effort */ }
          try { fs.rmSync(claim, { force: true }) } catch { /* process exit also releases the claim */ }
        }
      }
    },
  }
}

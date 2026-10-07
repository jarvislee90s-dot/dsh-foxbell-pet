// v2.4（Issue #9）回归：子代理会话用量并入看板口径。
// 背景：agents.roots() 只返回顶层 agent（DSH 契约），子代理会话（header.origin='subagent'）
// 与已收尾会话从不进入折叠集合——「含子代理」文案失真。修复后引擎经 noteCorpusSession
// 接收非根会话折叠（corpus 采集器从 sessionQuery 全语料喂入），聚合时并入 extraFolds。
import { describe, it, expect } from 'vitest'
import { aggregateFold, createStateEngine, foldEntry, scanSession } from '../src/host/state.js'
import { dateKeyOf } from '../src/host/dashboard.js'
import { createCorpusCollector, CORPUS_WINDOW_MS } from '../src/host/corpus.js'

const NOW = new Date(2026, 8, 11, 12, 0, 0, 0).getTime() // 本地 2026-09-11 12:00
const DAY = dateKeyOf(NOW)
const MIN = 60 * 1000

const ev = (type, seq, time, data) => ({ type, seq, time, data })

/** 主会话事件：今日 input=1000/output=400/cacheRead=3000 */
function mainEvents() {
  return [
    ev('turn/start', 1, NOW - 60 * 1000, { turn: 1 }),
    ev('assistant/message', 2, NOW - 40 * 1000, { turn: 1, step: 1, usage: { inputTokens: 1000, outputTokens: 400, cacheReadTokens: 3000, cacheWriteTokens: 0 } }),
  ]
}
/** 子代理事件：今日 input=2000/output=800/cacheRead=1000（Issue 场景：扇出的子会话） */
function subEvents() {
  return [
    ev('assistant/message', 1, NOW - 30 * 1000, { turn: 0, step: 0, usage: { inputTokens: 2000, outputTokens: 800, cacheReadTokens: 1000, cacheWriteTokens: 0 } }),
  ]
}

function makeSession(events) {
  return { snapshotEvents: () => events.slice() }
}

function engineHarness(roots, sessions) {
  return createStateEngine({
    roots: () => roots,
    getSession: (id) => sessions.get(id),
    getTitle: () => undefined,
    now: () => NOW,
  })
}

describe('aggregateFold extraFolds（非根会话用量并入）', () => {
  const mainEntry = {
    id: 'main', title: 'main',
    scan: scanSession(makeSession(mainEvents()), null, 0),
    folded: foldEntry(mainEvents()),
    recentCount: 0,
  }
  const subFold = foldEntry(subEvents())

  it('usage 五桶/grandTotal/models/trend 并入 extraFolds；hero（dayTotal 口径）= 主+子之和', () => {
    const dash = aggregateFold([mainEntry], {}, NOW, { dayTotal: 0, grandTotal: 0 }, [subFold])
    expect(dash.usage.day).toEqual({ inputTokens: 3000, outputTokens: 1200, cacheReadTokens: 4000, cacheWriteTokens: 0 })
    expect(dash.usage.requestTotal).toBe(7000)
    expect(dash.usage.grandTotal).toBe(8200)
    expect(dash.usage.models).toEqual([
      { route: '未知', provider: '', model: '', requestTotal: 7000, cacheRead: 4000, outputTokens: 1200 },
    ])
    const todayBucket = dash.usage.trend.days.find((d) => d.key === DAY)
    expect(todayBucket.dayTotal).toBe(8200)
    expect(todayBucket.requestTotal).toBe(7000)
  })

  it('scan 侧不并入：approvals/perSessionMetrics（summary.sessions）仍只算 roots 条目', () => {
    const dash = aggregateFold([mainEntry], {}, NOW, { dayTotal: 0, grandTotal: 0 }, [subFold])
    expect(dash.summary.sessions).toBe(1)
    expect(dash.approvals).toEqual([])
  })

  it('extraFolds 缺省（undefined/非数组）→ 行为与旧签名逐字段一致', () => {
    const a = aggregateFold([mainEntry], {}, NOW, { dayTotal: 0, grandTotal: 0 })
    const b = aggregateFold([mainEntry], {}, NOW, { dayTotal: 0, grandTotal: 0 }, undefined)
    expect(a).toEqual(b)
  })
})

describe('createStateEngine noteCorpusSession/compute（Issue #9 定案场景）', () => {
  it('主会话 + N 子代理：hero 五桶 = 两者之和（修复前该用例红——子代理被整条丢弃）', () => {
    const sessions = new Map([['main', makeSession(mainEvents())]])
    const eng = engineHarness([{ id: 'main', status: 'running' }], sessions)
    eng.noteCorpusSession('sub-1', subEvents(), false)
    eng.noteCorpusSession('sub-2', subEvents(), false)
    eng.compute()
    const u = eng.dashboard().usage
    expect(u.day).toEqual({ inputTokens: 5000, outputTokens: 2000, cacheReadTokens: 5000, cacheWriteTokens: 0 })
    expect(u.grandTotal).toBe(12000)
    expect(u.requestTotal).toBe(10000)
  })

  it('与 roots 双计排除：corpus 条目 id 若同时是本轮 root，只按 boardEntries 计一次', () => {
    const both = mainEvents()
    const sessions = new Map([['main', makeSession(both)]])
    const eng = engineHarness([{ id: 'main', status: 'running' }], sessions)
    eng.noteCorpusSession('main', both, false) // 采集竞态：同 id 既在 roots 又进了 corpus
    eng.compute()
    const u = eng.dashboard().usage
    expect(u.day.inputTokens).toBe(1000) // 不翻倍
    expect(u.grandTotal).toBe(4400)
  })

  it('rangeSummary 并入 corpus 折叠（/dashboard/range 与快照同口径）', () => {
    const sessions = new Map([['main', makeSession(mainEvents())]])
    const eng = engineHarness([{ id: 'main', status: 'running' }], sessions)
    eng.noteCorpusSession('sub-1', subEvents(), false)
    eng.compute()
    const range = eng.rangeSummary(DAY, DAY)
    expect(range.totals.requestTotal).toBe(7000)
    expect(range.totals.outputTokens).toBe(1200)
  })

  it('corpusNeedsColdRead：无条目→true；fromLive 折叠→true（缺终态事件）；冷折叠→false', () => {
    const eng = engineHarness([], new Map())
    expect(eng.corpusNeedsColdRead('ghost')).toBe(true)
    eng.noteCorpusSession('live-sub', subEvents(), true)
    expect(eng.corpusNeedsColdRead('live-sub')).toBe(true)
    eng.noteCorpusSession('cold-sub', subEvents(), false)
    expect(eng.corpusNeedsColdRead('cold-sub')).toBe(false)
  })

  it('pruneCorpus：只删 corpus 标记条目，root 条目与未列名 id 不受影响', () => {
    const sessions = new Map([['main', makeSession(mainEvents())]])
    const eng = engineHarness([{ id: 'main', status: 'running' }], sessions)
    eng.noteCorpusSession('sub-1', subEvents(), false)
    eng.compute()
    eng.pruneCorpus(new Set(['main'])) // sub-1 已从存储消失
    eng.compute()
    const u = eng.dashboard().usage
    expect(u.day.inputTokens).toBe(1000) // 子代理折叠被清掉
    // root 条目不被 prune 误删
    expect(u.grandTotal).toBe(4400)
  })

  it('同指纹重复 noteCorpusSession 不重折（fp 缓存语义）', () => {
    const eng = engineHarness([], new Map())
    eng.noteCorpusSession('sub', subEvents(), false)
    const first = eng.rangeSummary(DAY, DAY).totals.requestTotal
    eng.noteCorpusSession('sub', subEvents(), false) // 同 events 再喂
    expect(eng.rangeSummary(DAY, DAY).totals.requestTotal).toBe(first)
  })

  it('fork/续跑谱系不双计继承前缀：子会话用量折叠只吃自身事件（父会话经 corpus 计）', () => {
    // 父会话 2 条事件（input=100/300）已被收尾，经 corpus 采集
    const parentEvents = [
      ev('assistant/message', 1, NOW - 90 * 1000, { turn: 0, step: 0, usage: { inputTokens: 100, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } }),
      ev('assistant/message', 2, NOW - 80 * 1000, { turn: 0, step: 1, usage: { inputTokens: 300, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } }),
    ]
    // fork 子会话：继承父日志前缀 2 条 + 自身 1 条（input=50）——snapshotEvents 返回完整日志
    const childSession = {
      snapshotEvents: () => parentEvents.concat([
        ev('assistant/message', 3, NOW - 10 * 1000, { turn: 0, step: 2, usage: { inputTokens: 50, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } }),
      ]),
      inheritedEventCount: 2,
    }
    const eng = engineHarness([{ id: 'child', status: 'running' }], new Map([['child', childSession]]))
    eng.noteCorpusSession('parent', parentEvents, false)
    eng.compute()
    // 父(100+300) + 子自身(50)；修复前子会话把继承前缀再计一遍 → 900
    expect(eng.dashboard().usage.day.inputTokens).toBe(450)
  })

  it('trend 节流门感知 corpus 到达：同一整点内子代理折叠落地后趋势图随之下刷新', () => {
    const sessions = new Map([['main', makeSession(mainEvents())]])
    const eng = engineHarness([{ id: 'main', status: 'running' }], sessions)
    eng.compute()
    const trendBefore = eng.dashboard().usage.trend
    const before = trendBefore.days.find((d) => d.key === DAY).dayTotal
    eng.noteCorpusSession('sub-1', subEvents(), false)
    eng.compute() // 同整点、roots 无重扫——修复前 trend 复用缓存，hero 与趋势图口径分裂
    const trendAfter = eng.dashboard().usage.trend
    const after = trendAfter.days.find((d) => d.key === DAY).dayTotal
    expect(after).toBe(before + 3800) // 子代理 dayTotal 并入趋势
  })

  it('corpusStats 诊断（真机验收观测点）：folds 只数 corpus 条目，rev 随写入/裁剪推进', () => {
    const eng = engineHarness([], new Map())
    expect(eng.corpusStats.folds).toBe(0)
    eng.noteCorpusSession('sub-1', subEvents(), false)
    eng.noteCorpusSession('sub-2', subEvents(), false)
    expect(eng.corpusStats.folds).toBe(2)
    const rev = eng.corpusStats.rev
    expect(rev).toBeGreaterThanOrEqual(2)
    eng.pruneCorpus(new Set(['sub-1']))
    expect(eng.corpusStats).toEqual({ folds: 1, rev: rev + 1 })
  })
})

describe('createCorpusCollector（sessionQuery 采集器）', () => {
  function fakeDeps(opt = {}) {
    const coldReads = []
    const deps = {
      records: opt.records || [],
      liveStore: opt.liveStore || new Map(), // id -> events（活会话）
      rootIds: opt.roots || [],
      engine: opt.engine,
      now: () => NOW,
      async listRecords() { return this.records },
      liveEvents(id) { const e = this.liveStore.get(id); return e ? e.slice() : null },
      async readEvents(id) { coldReads.push(id); return (opt.coldLogs && opt.coldLogs.get(id)) || [] },
      coldReads,
    }
    return deps
  }

  it('活记录走 liveEvents（零冷读）；冷记录 readEvents 一次并写 fromLive=false 折叠', async () => {
    const sessions = new Map([['main', makeSession(mainEvents())]])
    const eng = engineHarness([{ id: 'main', status: 'running' }], sessions)
    const coldLogs = new Map([['sub-done', subEvents()]])
    const deps = fakeDeps({
      engine: eng,
      roots: ['main'],
      liveStore: new Map([['sub-live', subEvents()]]),
      coldLogs,
      records: [
        { id: 'main', createdAt: NOW - MIN, live: true },
        { id: 'sub-live', createdAt: NOW - MIN, live: true },
        { id: 'sub-done', createdAt: NOW - 10 * MIN, live: false },
      ],
    })
    await createCorpusCollector(deps).refresh()
    expect(deps.coldReads).toEqual(['sub-done'])
    eng.compute()
    const u = eng.dashboard().usage
    // main(1000) + sub-live(2000) + sub-done(2000)
    expect(u.day.inputTokens).toBe(5000)
    // 冷折叠缓存：再刷一轮不再冷读
    await createCorpusCollector(deps).refresh()
    expect(deps.coldReads).toEqual(['sub-done'])
  })

  it('活期折叠转冷触发一次终读（补齐活期尾巴）；root id 跳过；窗口外 createdAt 跳过', async () => {
    const eng = engineHarness([{ id: 'main', status: 'running' }], new Map([['main', makeSession(mainEvents())]]))
    const finalEvents = subEvents().concat([
      ev('assistant/message', 2, NOW - 5 * 1000, { turn: 0, step: 1, usage: { inputTokens: 7, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } }),
    ])
    const coldLogs = new Map([
      ['sub-1', finalEvents], // 终读拿到比活期多的尾巴
      ['ancient', []],
    ])
    const deps = fakeDeps({
      engine: eng,
      roots: ['main'],
      coldLogs,
      records: [
        { id: 'main', createdAt: NOW - MIN, live: true },
        { id: 'sub-1', createdAt: NOW - MIN, live: false }, // 上轮还活着（fromLive 折叠在缓存）
        { id: 'ancient', createdAt: NOW - CORPUS_WINDOW_MS - 86400000, live: false },
      ],
    })
    // 预置活期折叠（模拟上一轮 live 时写入）
    eng.noteCorpusSession('sub-1', subEvents(), true)
    await createCorpusCollector(deps).refresh()
    expect(deps.coldReads).toEqual(['sub-1']) // fromLive → 强制终读一次
    expect(deps.coldReads).not.toContain('ancient') // 窗口外不读
    eng.compute()
    // main(1000) + sub-1 终读(2000+7)
    expect(eng.dashboard().usage.day.inputTokens).toBe(3007)
  })

  it('每轮冷读预算封顶（大语料分多轮收敛）；本轮 corpus 记录之外的折叠被 prune', async () => {
    const eng = engineHarness([], new Map())
    const coldLogs = new Map(Array.from({ length: 5 }, (_, i) => ['cold-' + i, subEvents()]))
    const deps = fakeDeps({
      engine: eng,
      records: Array.from({ length: 5 }, (_, i) => ({ id: 'cold-' + i, createdAt: NOW - MIN, live: false })),
      coldLogs,
    })
    const collector = createCorpusCollector(deps, { coldBudget: 2 })
    await collector.refresh()
    expect(deps.coldReads).toHaveLength(2)
    await collector.refresh() // 下一轮继续吃掉剩余
    expect(deps.coldReads).toHaveLength(4)
    await collector.refresh()
    expect(deps.coldReads).toHaveLength(5)
    // 存储删除：只剩 cold-0 → 其余被 prune
    deps.records = [{ id: 'cold-0', createdAt: NOW - MIN, live: false }]
    await collector.refresh()
    eng.compute()
    expect(eng.dashboard().usage.day.inputTokens).toBe(2000)
  })

  it('listRecords 抛错 → 静默降级（保留既有折叠，不炸轮询）；in-flight 重入只跑一轮', async () => {
    const eng = engineHarness([], new Map())
    let boom = true
    const deps = fakeDeps({ engine: eng })
    deps.listRecords = async () => { if (boom) throw new Error('query down'); return deps.records }
    const collector = createCorpusCollector(deps)
    await collector.refresh() // 不抛
    eng.noteCorpusSession('sub-1', subEvents(), false)
    boom = false
    deps.records = [{ id: 'sub-1', createdAt: NOW - MIN, live: false }]
    const p1 = collector.refresh()
    const p2 = collector.refresh() // in-flight 重入直接返回
    await Promise.all([p1, p2])
    eng.compute()
    expect(eng.dashboard().usage.day.inputTokens).toBe(2000) // 折叠保留
  })
})

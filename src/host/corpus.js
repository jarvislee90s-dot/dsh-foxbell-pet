// corpus.js — 全语料用量采集（v2.4 修复 Issue #9）。
// 根因：DSH agents.roots() 按契约只返回顶层 agent（owner===undefined）；子代理会话
// （SessionHeader.origin='subagent'）与已收尾会话从不进入引擎折叠集合，看板全部
// token 数字因此只含主会话（实测偏低可达 ~2.6×）。
// 本模块经 sessionQuery（live-preferred 全语料枚举，harness 官方口径）把非根会话喂进引擎：
//   活会话 → sessions.get(id) 内存快照（零盘 IO，指纹未变不重折）；
//   冷会话 → sessionQuery.readSession(id) 一次性重放（冷日志不可变 → 进程内缓存到被 prune）。
// 活→冷转换强制补一次终读（活期折叠可能缺最后一批事件）；服务缺失（老宿主）时 refresh 空转降级。

/** 冷采集窗口外沿：trend 14 日 + range 31 日的最大需求 + 1 日跨时区余量。只作用于冷读——
 *  活会话不设窗（创建超窗但仍在跑的会话，其今日用量必须计入）；grandTotal 因此是
 *  「窗口内会话 + 存活会话」的累计口径（与 roots 路径的 grand 全量语义一致）。 */
export const CORPUS_WINDOW_MS = 32 * 86400000

/** 每轮冷读（readSession 全量重放）预算：大语料启动期分多轮收敛，避免一轮长尾卡顿 */
export const CORPUS_COLD_READS_PER_CYCLE = 25

/** 宿主调用超时（ms）：listSessions 每轮一次 / readSession 每会话一次。实测 dsh 0.2.0-rc.2
 *  连续冷读后宿主 listSessions 可能永久挂起（跨进程存储争用疑似）——超时把挂起转成可重试
 *  的失败，退避计数防止悬空操作每 10s 无限堆积。 */
export const CORPUS_HOST_TIMEOUT_MS = 30000
const CORPUS_BACKOFF_MAX_ROUNDS = 6 // 连续失败后的最大跳轮数（≈60s 一试）

const withTimeout = (p, ms, label) => Promise.race([
  p,
  new Promise((_, reject) => {
    setTimeout(() => reject(new Error(label + ' timed out after ' + ms + 'ms')), ms)
  }),
])

/**
 * deps: {
 *   listRecords(): Promise<{id, createdAt, live}[]>  sessionQuery.listSessions() 的映射
 *   liveEvents(id): events|null                       活会话内存事件（sessions.get + sessionEvents）
 *   readEvents(id): Promise<events>                   sessionQuery.readSession(id).events
 *   rootIds(): iterable<string>                       agents.roots() 的 id 集（本轮根，由 compute() 负责）
 *   engine                                            createStateEngine()（noteCorpusSession/pruneCorpus）
 *   now(): number
 * }
 */
export function createCorpusCollector(deps, opt = {}) {
  const coldBudget = typeof opt.coldBudget === 'number' && opt.coldBudget > 0
    ? Math.floor(opt.coldBudget)
    : CORPUS_COLD_READS_PER_CYCLE
  let busy = false
  let disposed = false
  let cycle = 0
  const failedAt = new Map()
  let backoff = 0 // 连续整轮失败后的跳轮计数（防悬空宿主操作每 10s 堆积）
  async function refresh() {
    if (disposed || busy || !deps || !deps.engine) return
    if (backoff > 0) { backoff -= 1; return }
    busy = true
    cycle += 1
    const t0 = Date.now()
    let liveN = 0, coldN = 0, failN = 0
    try {
      const records = await withTimeout(deps.listRecords(), CORPUS_HOST_TIMEOUT_MS, 'listSessions')
      if (disposed) return
      const keep = new Set()
      let roots = new Set()
      try {
        const rid = typeof deps.rootIds === 'function' ? deps.rootIds() : deps.rootIds
        roots = new Set(rid || [])
      } catch { /* 根枚举失败按空集处理 */ }
      const nowMs = typeof deps.now === 'function' ? deps.now() : Date.now()
      const horizon = nowMs - CORPUS_WINDOW_MS
      const coldQueue = []
      const oldColdQueue = []
      for (const r of Array.isArray(records) ? records : []) {
        if (!r || typeof r.id !== 'string' || r.id === '') continue
        keep.add(r.id)
        if (roots.has(r.id)) continue // 根会话：compute() 活路径独占，corpus 不碰（防双计）
        // createdAt 只决定冷读优先级，不是活动发生的证明。旧会话排在近期候选之后，
        // 未核对前覆盖必须保持 loading/limited，不能静默当成窗口外零用量。
        const old = !r.live && typeof r.createdAt === 'number' && Number.isFinite(r.createdAt) && r.createdAt < horizon
        if (r.live) {
          const evts = typeof deps.liveEvents === 'function' ? deps.liveEvents(r.id) : null
          if (Array.isArray(evts)) { deps.engine.noteCorpusSession(r.id, evts, true); liveN += 1; continue }
          // 枚举与读取之间死亡 → 落入冷读队列补终态
        }
        if (old) oldColdQueue.push(r.id)
        else coldQueue.push(r.id)
      }
      let budget = coldBudget
      const needsRead = (id) => deps.engine.corpusNeedsColdRead(id) === true
      for (const id of failedAt.keys()) if (!keep.has(id)) failedAt.delete(id)
      const byLastFailure = (a, b) => (failedAt.get(a) ?? 0) - (failedAt.get(b) ?? 0)
      coldQueue.sort(byLastFailure)
      oldColdQueue.sort(byLastFailure)
      const oldPending = oldColdQueue.some(needsRead)
      // 近期积压时仍给旧候选预留 1 次，避免旧会话永久饥饿；其余服从原每轮预算。
      const recentCap = oldPending && coldQueue.some(needsRead) ? Math.max(0, budget - 1) : budget
      if (coldQueue.some(needsRead) || oldPending) deps.engine.noteCoverage?.('loading')
      const readQueue = async (queue, cap) => {
        for (const id of queue) {
          if (disposed || budget <= 0 || cap <= 0 || failN >= 3) break
          if (!needsRead(id)) continue
          budget -= 1
          cap -= 1
          try {
            const evts = await withTimeout(deps.readEvents(id), CORPUS_HOST_TIMEOUT_MS, 'readSession ' + id)
            if (disposed) return
            if (!Array.isArray(evts)) throw new Error('readSession returned a malformed event list')
            deps.engine.noteCorpusSession(id, evts, false)
            coldN += 1
            failedAt.delete(id)
          } catch (err) {
            failedAt.set(id, cycle)
            failN += 1 // 读取失败不推进终读标记；下轮重试并限制全量覆盖声明
            console.warn('[foxbell-pet] corpus readSession failed: ' + id + ' -> ' + String(err && err.message || err))
          }
        }
      }
      if (oldPending && recentCap < budget && (coldQueue.some((id) => failedAt.has(id)) || (budget === 1 && cycle % 2 === 0))) {
        await readQueue(oldColdQueue, 1)
      }
      await readQueue(coldQueue, budget === 1 && cycle % 2 !== 0 ? 1 : recentCap)
      await readQueue(oldColdQueue, budget)
      if (disposed) return
      if (typeof deps.engine.noteCoverage === 'function') {
        const pending = coldQueue.some(needsRead) || oldColdQueue.some(needsRead)
        deps.engine.noteCoverage(failN > 0 ? 'limited' : pending ? 'loading' : 'ready')
      }
      deps.engine.pruneCorpus(keep) // 存储侧删除的会话：折叠随之出账（keep 含全部本轮记录 + 根）
      if (liveN + coldN + failN > 0) {
        console.log('[foxbell-pet] corpus round: +' + liveN + ' live +' + coldN + ' cold' + (failN ? ' ' + failN + ' failed' : '')
          + ' in ' + (Date.now() - t0) + 'ms (records=' + (Array.isArray(records) ? records.length : -1) + ')')
      }
      backoff = 0
    } catch (err) {
      if (disposed) return
      if (deps.engine && typeof deps.engine.noteCoverage === 'function') deps.engine.noteCoverage('limited')
      // 本轮整体失败：保留现状重试——warn 留痕便于实机诊断。仅「超时/挂起」类失败退避
      // （悬空宿主操作随每轮堆积）；普通报错（服务未起等）下轮照常直试。
      console.warn('[foxbell-pet] corpus refresh failed: ' + String(err && err.message || err))
      if (/timed out/.test(String(err && err.message || err))) backoff = Math.min(backoff + 2, CORPUS_BACKOFF_MAX_ROUNDS)
    } finally { busy = false }
  }
  return { refresh, dispose() { disposed = true } }
}

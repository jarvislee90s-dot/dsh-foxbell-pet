// 效率看板一期 —— 宿主侧纯函数集（无副作用、无宿主依赖，可被 node --test 直接测试）。
// 事件读取双兼容：rc.1+ 的 session.snapshotEvents() 优先，老版回退 session.events 属性。

export function sessionEvents(session) {
  if (session && typeof session.snapshotEvents === 'function') {
    try {
      const evts = session.snapshotEvents()
      if (Array.isArray(evts)) return evts
    } catch { /* fall through */ }
  }
  return session && Array.isArray(session.events) ? session.events : []
}

// ---------- 组件①：时长档位 ----------
// 规则（spec 6.1）：turn 开着——静默≥longrunSilentMs→长跑；5min 事件数≥intenseEvents→高强度；否则活跃。
// turn 关着——静默≥loafStartMs 起，每 +10/+20/+45 分钟升一阶摸鱼（默认 15/25/35/60min）。

export const PACE_LABELS = {
  intense: '高强度', active: '活跃', longrun: '长任务', idle: '空闲',
  loaf1: '摸鱼·小憩', loaf2: '摸鱼·躺平', loaf3: '摸鱼·咸鱼', loaf4: '摸鱼·咸鱼干',
}

export const DEFAULT_PACE = { intenseEvents: 12, longrunSilentMs: 3 * 60000, loafStartMs: 15 * 60000 }

const LOAF_STEPS_MS = [10 * 60000, 20 * 60000, 45 * 60000]

export function derivePaceTier(agg, now, opt) {
  const o = Object.assign({}, DEFAULT_PACE, opt || {})
  if (!agg || !Number.isFinite(agg.lastEventTime)) {
    return { tier: 'idle', sinceMs: null, label: PACE_LABELS.idle }
  }
  const sinceMs = Math.max(0, now - agg.lastEventTime)
  if (agg.turnOpen) {
    if (sinceMs >= o.longrunSilentMs) return { tier: 'longrun', sinceMs, label: PACE_LABELS.longrun }
    if ((agg.eventCount5m || 0) >= o.intenseEvents) return { tier: 'intense', sinceMs, label: PACE_LABELS.intense }
    return { tier: 'active', sinceMs, label: PACE_LABELS.active }
  }
  if (sinceMs >= o.loafStartMs + LOAF_STEPS_MS[2]) return { tier: 'loaf4', sinceMs, label: PACE_LABELS.loaf4 }
  if (sinceMs >= o.loafStartMs + LOAF_STEPS_MS[1]) return { tier: 'loaf3', sinceMs, label: PACE_LABELS.loaf3 }
  if (sinceMs >= o.loafStartMs + LOAF_STEPS_MS[0]) return { tier: 'loaf2', sinceMs, label: PACE_LABELS.loaf2 }
  if (sinceMs >= o.loafStartMs) return { tier: 'loaf1', sinceMs, label: PACE_LABELS.loaf1 }
  return { tier: 'idle', sinceMs, label: PACE_LABELS.idle }
}

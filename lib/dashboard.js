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

// bundle-smoke — 构建产物 lib/client.js 在模拟 rc.1 ModuleLoader 环境中的加载契约：
// 执行只注册工厂（manifest.ts 契约），物化后导出入口形态正确，apply 能注册全部三槽位。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import vm from 'node:vm'

const here = path.dirname(fileURLToPath(import.meta.url))
const bundle = readFileSync(path.join(here, '../lib/client.js'), 'utf8')

const React = {
  createElement(type, props, ...children) {
    return { type, props: { ...(props || {}), children } }
  },
  Fragment: Symbol('Fragment'),
}
const jsxRuntime = {
  jsx(type, props, key) { return { type, props, key } },
  jsxs(type, props, key) { return { type, props, key } },
  Fragment: React.Fragment,
}

function runBundle() {
  const registered = {}
  const sandbox = {
    window: {
      __ModuleLoader__: { load(reg) { registered[reg.id] = reg } },
      addEventListener() {},
      matchMedia: () => ({ matches: false, addEventListener() {} }),
    },
    document: {
      head: { appendChild() {} },
      getElementById: () => null,
      createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
    },
    localStorage: {
      _m: {}, getItem(k) { return this._m[k] ?? null }, setItem(k, v) { this._m[k] = String(v) },
      removeItem(k) { delete this._m[k] },
    },
    navigator: { language: 'zh' },
    setTimeout, clearTimeout, setInterval, clearInterval,
    console,
    require: (id) => {
      if (id === 'react') return React
      if (id === 'react/jsx-runtime') return jsxRuntime
      throw new Error('unexpected require: ' + id)
    },
  }
  sandbox.globalThis = sandbox
  new vm.Script(bundle, { filename: 'lib/client.js' }).runInContext(vm.createContext(sandbox))
  return registered
}

describe('built client bundle (lib/client.js)', () => {
  it('executes as a single ModuleLoader registration (no side effects beyond register)', () => {
    const registered = runBundle()
    expect(Object.keys(registered)).toEqual(['dsh-foxbell-pet'])
    expect(typeof registered['dsh-foxbell-pet'].factory).toBe('function')
  })

  it('has no residual top-level import/export statements', () => {
    const residual = bundle.split('\n').filter((l) => /^\s*(import|export)\b/.test(l.trim()))
    expect(residual).toEqual([])
  })

  it('materializes to a cordis client entry (apply fn + inject list)', () => {
    const registered = runBundle()
    const exports = registered['dsh-foxbell-pet'].factory((id) => {
      if (id === 'react') return React
      if (id === 'react/jsx-runtime') return jsxRuntime
      throw new Error('unexpected require: ' + id)
    })
    expect(typeof exports.apply).toBe('function')
    expect(Array.isArray(exports.inject)).toBe(true)
    expect(exports.inject).toContain('slots')
  })

  it('apply registers all three UI slots (overlay / sidebar toggle / settings card)', () => {
    const registered = runBundle()
    const exports = registered['dsh-foxbell-pet'].factory((id) =>
      id === 'react' ? React : id === 'react/jsx-runtime' ? jsxRuntime : undefined,
    )
    const slotNames = []
    const slots = {
      inject(name, makeEntry) { slotNames.push(name); makeEntry() },
      register(meta) { return meta },
    }
    exports.apply({ get: (svc) => (svc === 'slots' ? slots : undefined) })
    expect(slotNames).toEqual(
      expect.arrayContaining(['shell.overlay', 'sidebar.footer.action', 'settings.plugin.item']),
    )
  })
})

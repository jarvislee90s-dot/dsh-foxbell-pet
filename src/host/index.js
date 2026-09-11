// Foxbell桌宠 v2 — 持久化 Host 插件（随 dsh web 自动加载）。
//
// rc.1 兼容（B1/B2/B3 见 IMPLEMENTATION_NOTES）：
//   B1  会话事件数组属性 → session.snapshotEvents() 方法（state.js readEvents）
//   B2  旧设置辅助函数（dsh-settings 0.1.0 时代）→ ctx.settings.installSection 服务方法
//   B3  dsh.client.inject 改为包级依赖边语义，已删除的 client-runtime 包引用清零（package.json）
//
// 素材：内置 foxbell 从插件包 assets/ 读取（安装即用）；外部宠物商店在
// ~/.dsh/foxbell-pet/pets/<id>/（node:fs 直写——rc.1 的 ctx.fs 沙箱可写根不含 ~/.dsh，
// harness 先例 anonymous-user-id/settings-file 同款做法）。
// 客户端通过 HTTP 路由交互（全部挂 /dyn-pet-foxbell/ 前缀）：
//   /state /ack /client-diag           → 既有语义不变（/state 快照扩展）
//   /pets[/…] /staging/… /api/…        → 外部宠物体系路由族（routes.js）

import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import z from '@deepseek-ai/schemastery'
import { storeRoot, petsRoot, stagingRoot, trashRoot, codexRoot } from './paths.js'
import { createStateEngine } from './state.js'
import { loadManifest, parseManifest, SHEET_FILE, MANIFEST_FILE } from './manifest.js'
import { BUILTIN_PET_ID, petIdProblem } from './petid.js'
import { listPets, sweepStaging } from './scan.js'
import { checkPet } from './guard.js'
import { registerRoutes, ROUTE_PREFIX } from './routes.js'

export const name = 'dsh-foxbell-pet'

// settings 命名空间：与 client 半卡片注册（settings.plugin.item 的 key）与
// settingsScope.bind({namespace}) 三处配对。rc.1 起 settingsNamespace 辅助函数已删除，
// 命名空间就是裸小写连字符字符串（/^[a-z][a-z0-9-]*$/）。
export const FOXBELL_PET_NS = 'foxbell-pet'
export const ACTION_IDS = ['jumping', 'waving', 'failed', 'waiting', 'review', 'running']
const Action = z.union(ACTION_IDS)
export const Config = z.object({
  muted: z.boolean().default(false),
  talkative: z.boolean().default(true),
  doneAction: Action.default('jumping'),
  dblAction: Action.default('waving'),
  approvalAction: Action.default('waiting'),
  runningAction: Action.default('running'),
  errorAction: Action.default('failed'),
  gravity: z.boolean().default(true),
  // v2 新增：三档缩放（精灵/卡片/菜单整体）与激活宠物 id。
  // 旧保存配置无这两个字段 → schema default 自动补齐，无需用户干预。
  scale: z.union([0.75, 1, 1.25]).default(1),
  activePetId: z.string().default(BUILTIN_PET_ID),
  // v2.1 效率看板 12 项（键名/默认值逐字对齐 v1.4.0 Config 契约；引擎逐键消费、缺键回退）。
  // 前 8 项为看板引擎门/阈值；summaryEntrySec/boardTtlSec/ttsEnabled/summaryEnabled 为客户端门。
  paceEnabled: z.boolean().default(true),
  paceIntenseEvents: z.number().default(12),
  paceLongrunMin: z.number().default(3),
  paceLoafStartMin: z.number().default(15),
  usageEnabled: z.boolean().default(true),
  dayLimitTokens: z.number().default(0),
  milestoneUnit: z.number().default(1000000),
  approvalFlickerMin: z.number().default(5),
  summaryEnabled: z.boolean().default(true),
  summaryEntrySec: z.number().default(15),
  boardTtlSec: z.number().default(15),
  ttsEnabled: z.boolean().default(false),
  // v2.2 用量看板 3 项（R6 侧栏入口/R8 导出评语与姿态；客户端消费）
  dashboardSidebarEntry: z.boolean().default(false),
  exportQuote: z.string().default(''),
  exportPose: z.string().default('random'),
})

// 硬依赖注入：与 v1.3.0 相同（settings 为可选注入，见 apply 内 ctx.inject）。
export const inject = ['webServer', 'fs', 'agents', 'sessions', 'sessionTitle']

// ---- v2.2 P2：宠物目录/清单 mtime 指纹缓存（spec R1，/state 1.5s 轮询降 IO）----
// petsDirCache：root 目录 mtime 指纹 + 逐宠物 manifest.json mtime 指纹 → 每轮成本仅为
// 1 次目录 stat + N 次 manifest stat（纯元数据），免去 readdir + N 次 readFileSync+parse。
// 失效语义（无需路由侧显式失效）：
//   - 导入 finalize/删除/改名均 rename PETS_ROOT 子目录（父目录 mtime 变）→ 下轮全量重扫；
//   - manifest 编辑路由在 <PETS_ROOT>/<petId>/ 内 tmp+rename 原子重写 manifest.json —— 只动
//     manifest 与宠物子目录的 mtime，PETS_ROOT 的 mtime 不变；而 listPets 会把 manifest 派生
//     字段（displayName/description/…）烤进每个条目（scan.js），故 root 指纹命中时仍逐宠物
//     复验 manifest.json mtime（含有无状态翻转），任一失配 → 全量重扫，清单编辑即时刷新。
// 被删宠物的 manifestCache 残留行不可达且自愈（stat 失败 → mtime=-1 必失配 → 重载 null）。
const petsDirCache = { root: null, rootMtimeMs: -1, pets: [], manifestMtimes: new Map() }
const manifestMtimeOf = (root, id) => {
  try { return fs.statSync(path.join(root, id, MANIFEST_FILE)).mtimeMs } catch { return -1 }
}
const rescanPets = (root, rootMtimeMs) => {
  const pets = listPets(root) // 先扫后记账：listPets 半途抛错时旧缓存保持原样（下轮重试）
  const manifestMtimes = new Map()
  for (const p of pets) manifestMtimes.set(p.id, manifestMtimeOf(root, p.id))
  petsDirCache.rootMtimeMs = rootMtimeMs
  petsDirCache.pets = pets
  petsDirCache.manifestMtimes = manifestMtimes
}
const listPetsCached = (root) => {
  if (petsDirCache.root !== root) {
    petsDirCache.root = root
    petsDirCache.rootMtimeMs = -1
    petsDirCache.pets = []
    petsDirCache.manifestMtimes = new Map()
  }
  let rootMtime = -1
  try { rootMtime = fs.statSync(root).mtimeMs } catch { return petsDirCache.rootMtimeMs === -1 ? [] : petsDirCache.pets }
  let stale = rootMtime !== petsDirCache.rootMtimeMs
  if (!stale) {
    // root 指纹命中：清单编辑不移动 PETS_ROOT 的 mtime → 逐宠物复验 manifest.json
    for (const p of petsDirCache.pets) {
      if (manifestMtimeOf(root, p.id) !== petsDirCache.manifestMtimes.get(p.id)) { stale = true; break }
    }
  }
  if (stale) rescanPets(root, rootMtime)
  return petsDirCache.pets
}
const manifestCache = new Map() // dir → { mtimeMs, manifest }
const loadManifestCached = (dir, opts) => {
  let mtime = -1
  try { mtime = fs.statSync(path.join(dir, MANIFEST_FILE)).mtimeMs } catch { /* 缺失走原 loadManifest 的 null 路径 */ }
  const c = manifestCache.get(dir)
  if (c && c.mtimeMs === mtime) return c.manifest
  const m = loadManifest(dir, opts)
  manifestCache.set(dir, { mtimeMs: mtime, manifest: m })
  return m
}
// 测试钩子（test/host-index.test.mjs 断言缓存命中同引用）
export const __testables = { listPetsCached, loadManifestCached }

export async function apply(ctx, config) {
  // 组合配置非法值不应拖垮整个插件：解析失败回落默认 schema 值
  let entry
  try { entry = Config(config ?? {}) } catch { entry = Config({}) }

  // ---- B2：ctx.settings.installSection（dsh-settings 0.1.2-rc.1 服务方法）----
  // settings 是可选服务（TUI/无 settings 部署静默降级）：hooks 形状 {setSource,onChange,validate?}。
  // setSource 收到 thunk：settings 在场 = resolved scope getter；不在场 = entry 回退。
  let configSource = () => entry
  // settings attach 标记：installSection 的 setSource 在 attach 时先于 onChange 被调；
  // detach 时回落 entry thunk（此时仍视为「settings 曾接管」，配置以最后 resolved 值为准）。
  let settingsAttached = false
  const readConfig = () => {
    try {
      const v = configSource()
      return v && typeof v === 'object' ? v : entry
    } catch { return entry }
  }
  try {
    ctx.inject(['settings'], (settingsCtx) => {
      settingsCtx.settings.installSection(ctx, FOXBELL_PET_NS, Config, entry, {
        setSource: (current) => { configSource = current; settingsAttached = true },
        onChange: () => { /* 配置热更新：/state 每轮读 readConfig()，无需额外动作 */ },
      })
    })
  } catch (err) {
    console.warn('[foxbell-pet] settings installSection unavailable:', String(err && err.message || err))
  }

  // ---- 插件私有目录（~/.dsh/foxbell-pet/…）----
  const PETS_ROOT = petsRoot()
  const STAGING_ROOT = stagingRoot()
  const TRASH_ROOT = trashRoot()
  const CODEX_ROOT = codexRoot()
  const TMP_DIR = os.tmpdir()
  try {
    fs.mkdirSync(PETS_ROOT, { recursive: true })
    fs.mkdirSync(STAGING_ROOT, { recursive: true })
  } catch (err) {
    console.warn('[foxbell-pet] store mkdir failed (外部宠物体系降级):', String(err && err.message || err))
  }
  // 启动清扫导入暂存区残留（崩溃自愈；仅清暂存区，不触碰宠物目录）
  let sweptCount = 0
  try { sweptCount = sweepStaging(STAGING_ROOT) } catch { /* 降级：不清扫不致命 */ }

  // ---- 内置 foxbell 素材（包内 assets/；ctx.fs 读取路径与 v1.3.0 相同）----
  const PKG_DIR = fileURLToPath(new URL('../', import.meta.url))
  const sp = ctx.get('sandboxPolicy')
  const workspaceRoot = (sp && typeof sp === 'object' && typeof sp.workspaceRoot === 'string') ? sp.workspaceRoot : null
  const candidates = [PKG_DIR + 'assets']
  if (workspaceRoot) candidates.push(workspaceRoot + '/foxbell')

  let spriteBytes = null
  let ASSET_DIR = null
  const builtinVoices = []
  const diag = { fsAvailable: false, workspaceRoot, probes: candidates.slice(), loadError: null, computeCount: 0, clientVisible: null, storeRoot: storeRoot(), petsRoot: PETS_ROOT, sweptStaging: sweptCount }

  try {
    const fsSvc = ctx.get('fs')
    if (fsSvc === undefined) {
      diag.loadError = 'fs service unavailable via ctx.get(fs)'
    } else {
      diag.fsAvailable = true
      for (const dir of candidates) {
        try {
          const probe = await fsSvc.resolve(dir + '/' + SHEET_FILE)
          const st = await fsSvc.stat(probe)
          if (st && typeof st.size === 'number') { ASSET_DIR = dir; break }
        } catch (err) { diag.loadError = diag.loadError || ('probe failed: ' + dir + ' -> ' + String(err && err.message || err)) }
      }
      if (ASSET_DIR !== null) {
        const spriteTarget = await fsSvc.resolve(ASSET_DIR + '/' + SHEET_FILE)
        const st = await fsSvc.stat(spriteTarget)
        if (st && typeof st.size === 'number') spriteBytes = await fsSvc.readBytes(spriteTarget, undefined, st.size + 1)
      }
    }
  } catch (err) {
    diag.loadError = diag.loadError || ('asset load failed: ' + String(err && err.message || err))
    console.error('asset load failed:', String(err && err.message || err))
  }

  // 内置清单（assets/pet.json，v2 格式；缺失/损坏 → 兜底最小描述符，宠物仍可渲染）
  let builtinManifest = null
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'assets', 'pet.json'), 'utf8'))
    builtinManifest = parseManifest(raw, { id: BUILTIN_PET_ID })
  } catch (err) {
    diag.loadError = diag.loadError || ('builtin manifest failed: ' + String(err && err.message || err))
  }
  if (builtinManifest === null) {
    builtinManifest = {
      schemaVersion: 2, id: BUILTIN_PET_ID, displayName: 'Foxbell', description: '', source: 'builtin',
      spriteVersionNumber: 2, spritesheetSizeBytes: spriteBytes ? spriteBytes.length : 0,
      hasVoice: false, hasSubtitle: false, voices: [],
    }
  }
  for (const v of builtinManifest.voices) builtinVoices.push(v)

  // ---- 状态聚合（B1：snapshotEvents；判定逻辑与 v1.3.0 相同）----
  const agents = ctx.get('agents')
  const sessions = ctx.get('sessions')
  const sessionTitle = ctx.get('sessionTitle')
  const engine = createStateEngine({
    roots: () => (agents !== undefined ? agents.roots() : []),
    getSession: (id) => (sessions !== undefined ? sessions.get(id) : undefined),
    getTitle: (session) => (sessionTitle !== undefined ? sessionTitle.get(session) : undefined),
    now: () => Date.now(),
    readConfig, // v2.1 看板 8 键 live 读（整对象透传，引擎逐键判型回退 BOARD_DEFAULTS）
  })
  engine.compute()

  // ---- 激活宠物解析与 /state 快照 ----
  // settings 在场时配置为唯一事实源（客户端写 scope → 宿主读 resolved 值）；
  // settingsAttached=false（无 settings 服务的降级部署）时接受客户端
  // /state?pet=<id> 提示（id 白名单校验），保证热切换在降级模式仍可用。
  const activePetId = (hint) => {
    if (!settingsAttached && typeof hint === 'string' && hint.length > 0) {
      if (hint === BUILTIN_PET_ID || petIdProblem(hint) === null) return hint
    }
    const v = readConfig().activePetId
    return typeof v === 'string' && v.length > 0 ? v : BUILTIN_PET_ID
  }
  /** 资产 URL 防缓存修订号：外部宠物取 manifest mtime；内置取包版本常量 */
  const revOf = (id) => {
    if (id === BUILTIN_PET_ID) return 'builtin'
    try { return String(fs.statSync(path.join(PETS_ROOT, id, 'manifest.json')).mtimeMs) } catch { return '0' }
  }
  const voiceUrls = (id, manifest) => (manifest ? manifest.voices : []).map((v, i) => ({
    index: i, group: v.group, name: v.name, file: v.file,
    url: `${ROUTE_PREFIX}/pets/${encodeURIComponent(id)}/voice/${encodeURIComponent(v.group)}/${encodeURIComponent(v.file.split('/').pop())}?rev=${revOf(id)}`,
  }))

  const activePetSnapshot = (hint) => {
    const id = activePetId(hint)
    if (id === BUILTIN_PET_ID) {
      return {
        id,
        name: builtinManifest.displayName,
        hasVoice: builtinManifest.hasVoice,
        hasSubtitle: builtinManifest.hasSubtitle,
        spriteVersionNumber: builtinManifest.spriteVersionNumber,
        spriteUrl: `${ROUTE_PREFIX}/pets/${BUILTIN_PET_ID}/${SHEET_FILE}`,
        rev: 'builtin',
      }
    }
    const m = loadManifestCached(path.join(PETS_ROOT, id), { id })
    const exists = fs.existsSync(path.join(PETS_ROOT, id))
    return {
      id,
      name: m ? m.displayName : id,
      hasVoice: m ? m.hasVoice : false,
      hasSubtitle: m ? m.hasSubtitle : false,
      spriteVersionNumber: m ? m.spriteVersionNumber : 0,
      spriteUrl: exists ? `${ROUTE_PREFIX}/pets/${encodeURIComponent(id)}/${SHEET_FILE}?rev=${revOf(id)}` : null,
      rev: revOf(id),
    }
  }

  const guardSnapshot = (hint) => {
    const id = activePetId(hint)
    if (id === BUILTIN_PET_ID) return []
    try {
      const g = checkPet(PETS_ROOT, id)
      return g.issues.map((i) => ({ kind: i.kind, detail: i.detail, fatal: !!g.fatal }))
    } catch { return [] }
  }

  // ---- v2.2 终审修复：/state ?since 短路的环境指纹（envRev）----
  // /state 的 rev 拆成两段：引擎 contentRev()（项目行/队列/用量/档位/警报/审批等待）+
  // '#' + envRev()（非引擎快照部件 activePet/pets——voices 由 activePet id+rev 派生）。
  // 宠物热切换写配置但不产生引擎事件，纯引擎 rev 稳定会把切换冻在 unchanged 里；
  // envRev = 激活宠物 id + '/' + 资产修订号（外部=manifest mtime，一次 statSync）+ '|' +
  // 外部宠物摘要（id:spriteVersionNumber，listPetsCached 全缓存）。guard 刻意不进指纹：
  // 其问题源自宠物文件本身，已被 activePet.rev 的 manifest mtime 覆盖，纳入反而引入
  // 每轮 checkPet 的重复 fs 读（P3 skip 的初心）。ages 依旧不参与任何 rev。
  const envRev = (hint) => {
    const id = activePetId(hint)
    return id + '/' + revOf(id) + '|' + listPetsCached(PETS_ROOT).map((s) => s.id + ':' + s.spriteVersionNumber).join(',')
  }

  const snapshotExtra = (hint) => {
    engine.compute()
    diag.computeCount += 1
    const active = activePetSnapshot(hint)
    const activeManifest = active.id === BUILTIN_PET_ID
      ? builtinManifest
      : loadManifestCached(path.join(PETS_ROOT, active.id), { id: active.id })
    const projects = engine.list()
    return {
      seq: engine.nextSeq(),
      completions: engine.queue,
      runningSessions: projects.filter((p) => p.status === 'running').length,
      projects,
      // v2.1 效率看板聚合（本轮 compute() 刚跑完，非 null；形状见 dashboard.js buildDashboard）
      dashboard: engine.dashboard(),
      // voices 改为当前激活宠物的语音清单（资产 URL 指向 /pets/<id>/…）
      voices: voiceUrls(active.id, activeManifest),
      activePet: active,
      pets: [
        {
          id: BUILTIN_PET_ID, displayName: builtinManifest.displayName, description: builtinManifest.description,
          source: 'builtin', spriteVersionNumber: builtinManifest.spriteVersionNumber,
          hasVoice: builtinManifest.hasVoice, hasSubtitle: builtinManifest.hasSubtitle,
          manifestExists: true, spritesheetExists: spriteBytes !== null, builtin: true,
        },
        ...listPetsCached(PETS_ROOT).map((s) => ({ ...s, builtin: false, dir: undefined })),
      ],
      guard: guardSnapshot(hint),
      assetDir: ASSET_DIR,
      spriteBytes: spriteBytes ? spriteBytes.length : null,
      diag,
    }
  }

  // ---- HTTP 路由族 ----
  registerRoutes(ctx, {
    pkgDir: PKG_DIR,
    petsRoot: PETS_ROOT,
    stagingRoot: STAGING_ROOT,
    trashRoot: TRASH_ROOT,
    codexRoot: CODEX_ROOT,
    tmpDir: TMP_DIR,
    stateEngine: engine,
    snapshotExtra,
    envRev, // v2.2 终审修复：/state rev 的环境段（activePet/pets 指纹，guard/ages 不参与）
    builtin: {
      manifest: builtinManifest,
      assetDir: ASSET_DIR || path.join(PKG_DIR, 'assets'),
      voices: builtinVoices,
      get spriteBytes() { return spriteBytes },
    },
    getActivePetId: activePetId,
    diag,
    get spriteBytes() { return spriteBytes },
  })

  const webServer = ctx.get('webServer')
  if (webServer !== undefined) {
    console.log('[foxbell-pet] host mounted: sprite=' + (spriteBytes ? spriteBytes.length : 0)
      + ' builtinVoices=' + builtinVoices.length + ' assetDir=' + ASSET_DIR
      + ' pets=' + listPetsCached(PETS_ROOT).length + ' sweptStaging=' + sweptCount)
  }
}

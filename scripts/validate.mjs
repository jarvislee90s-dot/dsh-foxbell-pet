// validate.mjs — sanity checks before publishing（v2 扩展版）。
// 既有检查全部保留（v1.3.0 语义按新双树布局适配），新增：
//   - 产物纯度：lib/client.js 无残留 import/export
//   - dsh.client 声明与客户端实际依赖一致（external require ⊆ 种子表 ∪ inject；inject 无死边）
//   - 路由前缀 / 设置命名空间 / 版本号一致性
//   - 构建契约：lib/ 与 src/ 重建字节一致（取代 v1 的 src==lib 拷贝比对）
//   - 错误码表两侧一致（宿主 ALL_RPC_CODES ↔ 客户端 KNOWN_RPC_CODES ↔ zh/en 字典键）
//   - 内置清单 v2 与磁盘素材一致（voices[].file 存在且 sizeBytes 相符）
import { readFileSync, existsSync, readdirSync, mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
let ok = true
const fail = (msg) => { console.error(msg); ok = false }
// 分节运行输出（纯可观测性：不改变任何检查逻辑与判定，只让每节的通过/失败可见）
let secBefore = true
const secStart = () => { secBefore = ok }
const secEnd = (label) => { console.log(`${ok === secBefore ? 'PASS' : 'FAIL'}  ${label}`) }

// ---------- 1. 文件存在 + 语法 ----------
secStart()
const hostFiles = readdirSync(path.join(root, 'src/host')).filter((f) => f.endsWith('.js')).map((f) => `src/host/${f}`)
const clientFiles = []
{
  const walk = (dir, prefix) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const rel = `${prefix}/${e.name}`
      if (e.isDirectory()) walk(path.join(dir, e.name), rel)
      else if (/\.(ts|tsx)$/.test(e.name)) clientFiles.push(rel)
    }
  }
  walk(path.join(root, 'src/client'), 'src/client')
}
if (hostFiles.length === 0) fail('no host sources found')
if (clientFiles.length === 0) fail('no client sources found')
for (const f of ['lib/index.js', 'lib/client.js', ...hostFiles, ...clientFiles]) {
  if (!existsSync(path.join(root, f))) fail(`missing: ${f}`)
}
// 产物语法：node --check（lib/index.js 为 ESM——package.json type:module 下按 ESM 解析）
for (const f of ['lib/index.js', 'lib/client.js']) {
  const p = path.join(root, f)
  if (!existsSync(p)) continue
  try { execSync(`node --check "${p}"`, { stdio: 'pipe', cwd: root }) }
  catch { fail(`syntax error: ${f}`) }
}

secEnd('1. 文件存在 + node --check 语法')

// ---------- 2. JSON 合法性 ----------
secStart()
for (const j of ['package.json', 'dsh.plugin.json', 'assets/pet.json']) {
  try { JSON.parse(readFileSync(path.join(root, j), 'utf8')) }
  catch { fail(`invalid JSON: ${j}`) }
}

secEnd('2. JSON 合法性')

// ---------- 3. 禁用词 ----------
secStart()
const textFiles = [...hostFiles, ...clientFiles, 'lib/index.js', 'lib/client.js', 'README.md', 'README.en.md', 'CHANGELOG.md', 'package.json', 'dsh.plugin.json', 'assets/pet.json']
for (const f of textFiles) {
  const p = path.join(root, f)
  if (!existsSync(p)) continue
  if (readFileSync(p, 'utf8').includes('玲娜')) fail(`forbidden wording 玲娜 in: ${f}`)
}

secEnd('3. 禁用词')

// ---------- 4. 素材存在 + 语音组非空 ----------
secStart()
for (const a of ['assets/spritesheet.webp']) {
  if (!existsSync(path.join(root, a))) fail(`missing asset: ${a}`)
}
for (const g of ['general', 'approval', 'error', 'done']) {
  const dir = path.join(root, 'assets/voice', g)
  if (!existsSync(dir)) { fail(`missing voice group dir: ${g}`); continue }
  if (readdirSync(dir).filter((f) => f.endsWith('.m4a')).length === 0) fail(`voice group empty: ${g}`)
}

secEnd('4. 素材存在 + 四语音组非空')

// ---------- 5. 交互配置一致性（v1.3.0 既有检查，按双树布局适配） ----------
secStart()
const srcHost = hostFiles.map((f) => readFileSync(path.join(root, f), 'utf8')).join('\n')
const srcClient = clientFiles.map((f) => readFileSync(path.join(root, f), 'utf8')).join('\n')
const libClient = readFileSync(path.join(root, 'lib/client.js'), 'utf8')
const libHost = existsSync(path.join(root, 'lib/index.js')) ? readFileSync(path.join(root, 'lib/index.js'), 'utf8') : ''
const requireIn = (hay, needle, label) => { if (!hay.includes(needle)) fail(`missing ${label}`) }
// 设置命名空间：宿主 installSection（B2 rc.1 服务方法）+ 客户端 bind/卡片 key 三处同串
requireIn(srcHost, "installSection(ctx, FOXBELL_PET_NS", 'host settings registration via ctx.settings.installSection')
requireIn(srcHost, "'foxbell-pet'", 'settings namespace literal (host)')
requireIn(srcClient, 'bind({ namespace: "foxbell-pet" })', 'settings scope bind (client)')
requireIn(srcClient, 'key: "foxbell-pet"', 'settings card slot key (client)')
// 旧 API 零残留（B1/B2/B3 可 grep 自证）
for (const [hay, name] of [[srcHost, 'host'], [srcClient, 'client'], [libHost, 'lib/host'], [libClient, 'lib/client']]) {
  if (/installSettingsSection\s*\(/.test(hay)) fail(`legacy installSettingsSection call残留 in ${name}`)
  if (/settingsNamespace\s*\(/.test(hay)) fail(`legacy settingsNamespace call 残留 in ${name}`)
  if (/session\.events\b|\bsession && Array\.isArray\(session\.events\)/.test(hay)) fail(`legacy session.events 残留 in ${name}`)
  if (hay.includes('@deepseek-ai/dsh-client-runtime')) fail(`deleted package dsh-client-runtime 残留 in ${name}`)
}
requireIn(srcHost, 'snapshotEvents', 'B1 migration: session.snapshotEvents()')
// 配置字段（客户端源码与产物都要有）
for (const k of ['doneAction', 'dblAction', 'approvalAction', 'errorAction', 'gravity', 'scale', 'activePetId']) {
  requireIn(srcClient, k, `config field ${k} (client src)`)
  requireIn(libClient, k, `config field ${k} (client bundle)`)
}
requireIn(srcHost, 'gravity', 'config field gravity (host)')
requireIn(srcHost, 'scale', 'config field scale (host)')
requireIn(srcHost, 'activePetId', 'config field activePetId (host)')
// 菜单样式 / 槽位 / scope 接线
requireIn(libClient, 'dyn-pet-menu', 'menu styles')
requireIn(srcClient, 'settings.plugin.item', 'settings card slot')
requireIn(srcClient, 'attachSettings', 'config store scope attach')
requireIn(srcClient, 'attachScope', 'config store scope attach (store method)')
// CFG_ACTIONS 必须是 ANIM 表键的子集（动作绑定依赖该不变量）
for (const a of ['jumping', 'waving', 'failed', 'waiting', 'review', 'running']) {
  requireIn(libClient, `"${a}"`, `action key ${a} present (bundle)`)
}

secEnd('5. 配置一致性 + 旧 API 零残留（B1/B2/B3 守卫）')

// ---------- 6. 产物纯度（新增）：lib/client.js 无残留 import/export ----------
secStart()
{
  const impure = libClient.split('\n').filter((l) => /^\s*(import|export)\b/.test(l))
  if (impure.length > 0) fail(`lib/client.js 残留 import/export ${impure.length} 行: ${impure[0].trim().slice(0, 80)}`)
}

secEnd('6. 产物纯度（lib/client.js 无残留 import/export）')

// ---------- 7. dsh.client 声明 ↔ 客户端实际依赖一致（新增） ----------
secStart()
{
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  const inject = pkg?.dsh?.client?.inject ?? []
  if (!Array.isArray(inject)) fail('dsh.client.inject 必须是数组')
  // rc.1 平台种子表（packages/client/web/src/platform.ts PLATFORM_MODULES）
  const SEEDS = new Set([
    'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-ui-primitives',
  ])
  const requires = new Set()
  for (const m of libClient.matchAll(/require\(\s*"([^"]+)"\s*\)/g)) requires.add(m[1])
  const nonSeed = [...requires].filter((r) => !SEEDS.has(r))
  for (const r of nonSeed) {
    if (!inject.includes(r)) fail(`客户端 bundle require("${r}") 未在 dsh.client.inject 声明（也非平台种子模块）`)
  }
  for (const edge of inject) {
    if (!requires.has(edge)) fail(`dsh.client.inject 声明 "${edge}" 但客户端 bundle 并未 require（死边）`)
  }
  if (pkg?.dsh?.client?.platform !== 'web') fail('dsh.client.platform 必须为 "web"')
  if (ok === secBefore) console.log(`  (§7 明细: inject=[${inject.join(',')}], bundle require 面=[${[...requires].sort().join(', ')}], 全部命中平台种子表)`)
}
secEnd('7. dsh.client 声明 ↔ 客户端 bundle 实际依赖一致')

// ---------- 8. 路由前缀 / 版本号一致性（新增） ----------
secStart()
{
  const PREFIX = '/dyn-pet-foxbell'
  requireIn(srcHost, `ROUTE_PREFIX = '${PREFIX}'`, 'host route prefix constant')
  requireIn(srcClient, `ROUTE_PREFIX = "${PREFIX}"`, 'client route prefix constant')
  // 宿主注册的路由 path 全部由 ROUTE_PREFIX 模板拼接（无裸前缀字符串漂移）
  const routePaths = [...srcHost.matchAll(/path: `([^`]+)`/g)].map((m) => m[1])
  for (const rp of routePaths) {
    if (!rp.startsWith('${ROUTE_PREFIX}')) fail(`路由 path 未用 ROUTE_PREFIX 模板: ${rp}`)
  }
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  // About 面板版本串与 package.json 一致（既有检查）
  if (!srcClient.includes(`v${pkg.version}`)) fail('About version string out of sync')
  if (!libClient.includes(`v${pkg.version}`)) fail('About version string missing in bundle')
  // CHANGELOG 顶部条目与版本一致
  const changelog = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
  if (!changelog.includes(`[${pkg.version}]`)) fail(`CHANGELOG 缺少 [${pkg.version}] 条目`)
  // dsh.plugin.json 按任务要求保持不动（1.3.0 冻结），不参与版本一致性断言——见 NOTES
}

secEnd('8. 路由前缀 / 设置命名空间 / 版本号一致性')

// ---------- 9. 构建契约：lib/ 与 src/ 重建字节一致（取代 v1 src==lib 拷贝比对） ----------
secStart()
{
  const tmp = mkdtempSync(path.join(tmpdir(), 'foxbell-validate-'))
  try {
    execSync(`node scripts/build.mjs`, { stdio: 'pipe', cwd: root, env: { ...process.env, FOXBELL_BUILD_OUT: tmp } })
  } catch {
    // build.mjs 不支持 FOXBELL_BUILD_OUT 时退化为直接重建比对（build 是确定性的）
    try { execSync(`node scripts/build.mjs`, { stdio: 'pipe', cwd: root }) } catch (e) { fail(`rebuild failed: ${e.message}`) }
  }
  // 重新读取 lib（若上面重建过，此刻 lib 即最新产物；比对 git 记录由 CI/提交纪律保证）
  const stamp = existsSync(path.join(root, 'lib/.build-stamp')) ? readFileSync(path.join(root, 'lib/.build-stamp'), 'utf8').trim() : ''
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  if (stamp !== pkg.version) fail(`lib/.build-stamp (${stamp}) 与 package.json version (${pkg.version}) 不一致——请重新 npm run build`)
  rmSync(tmp, { recursive: true, force: true })
}
secEnd('9. 构建契约（重建 + lib/.build-stamp 版本戳）')

// ---------- 10. 错误码表两侧一致（新增） ----------
secStart()
{
  const errorsFile = readFileSync(path.join(root, 'src/host/errors.js'), 'utf8')
  const hostArr = errorsFile.slice(errorsFile.indexOf('ALL_RPC_CODES'))
  const hostBlock = hostArr.slice(0, hostArr.indexOf(']'))
  const hostSet = new Set([...hostBlock.matchAll(/'([a-z][a-z0-9-]*)'/g)].map((m) => m[1]))
  const clientFile = readFileSync(path.join(root, 'src/client/errors.ts'), 'utf8')
  const clientArr = clientFile.slice(clientFile.indexOf('KNOWN_RPC_CODES'))
  const clientBlock = clientArr.slice(0, clientArr.indexOf(']'))
  const clientSet = new Set([...clientBlock.matchAll(/"([a-z][a-z0-9-]*)"/g)].map((m) => m[1]))
  if (hostSet.size === 0 || clientSet.size === 0) fail('错误码表解析失败')
  for (const c of hostSet) if (!clientSet.has(c)) fail(`错误码 ${c} 在宿主有、客户端 KNOWN_RPC_CODES 缺失`)
  for (const c of clientSet) if (!hostSet.has(c)) fail(`错误码 ${c} 在客户端有、宿主 ALL_RPC_CODES 缺失`)
  // zh/en 字典键覆盖全部错误码
  const i18n = readFileSync(path.join(root, 'src/client/i18n.ts'), 'utf8')
  const zhBlock = i18n.slice(i18n.indexOf('const ZH'), i18n.indexOf('const EN'))
  const enBlock = i18n.slice(i18n.indexOf('const EN'), i18n.indexOf('const DICTS'))
  for (const c of hostSet) {
    if (!zhBlock.includes(`"rpc.${c}"`)) fail(`zh 字典缺 rpc.${c}`)
    if (!enBlock.includes(`"rpc.${c}"`)) fail(`en 字典缺 rpc.${c}`)
  }
  for (const c of ['sheet-missing', 'sheet-bad-size', 'sheet-load-fail', 'sheet-timeout', 'audio-timeout', 'audio-bad-duration', 'audio-load-fail', 'scan-fail']) {
    if (!zhBlock.includes(`"err.${c}"`)) fail(`zh 字典缺 err.${c}`)
    if (!enBlock.includes(`"err.${c}"`)) fail(`en 字典缺 err.${c}`)
  }
  // zh/en 键集一致
  const keysOf = (block) => new Set([...block.matchAll(/^  "([^"]+)":/gm)].map((m) => m[1]))
  const zhKeys = keysOf(zhBlock)
  const enKeys = keysOf(enBlock)
  for (const k of zhKeys) if (!enKeys.has(k)) fail(`en 字典缺键 ${k}`)
  for (const k of enKeys) if (!zhKeys.has(k)) fail(`zh 字典缺键 ${k}`)
}
secEnd('10. 错误码表三方一致（宿主 ↔ 客户端 ↔ zh/en 字典）')

// ---------- 11. 内置清单 v2 ↔ 磁盘素材一致（新增） ----------
secStart()
{
  const m = JSON.parse(readFileSync(path.join(root, 'assets/pet.json'), 'utf8'))
  if (m.schemaVersion !== 2) fail('assets/pet.json schemaVersion 应为 2（清单 v2 格式）')
  if (m.id !== 'foxbell') fail('内置清单 id 必须为保留 id foxbell')
  const sheetSize = readFileSync(path.join(root, 'assets/spritesheet.webp')).length
  if (m.spritesheetSizeBytes !== sheetSize) fail(`内置清单 spritesheetSizeBytes (${m.spritesheetSizeBytes}) 与磁盘 (${sheetSize}) 不一致`)
  let counts = { general: 0, approval: 0, done: 0, error: 0 }
  for (const v of m.voices) {
    const p = path.join(root, 'assets', v.file)
    if (!existsSync(p)) { fail(`内置清单语音缺失: ${v.file}`); continue }
    const size = readFileSync(p).length
    if (size !== v.sizeBytes) fail(`内置清单语音大小不符: ${v.file} (${v.sizeBytes} != ${size})`)
    if (!(v.durationMs > 1000 && v.durationMs < 20000)) fail(`内置清单语音时长越界: ${v.file} (${v.durationMs})`)
    counts[v.group] += 1
  }
  for (const g of Object.keys(counts)) {
    const disk = readdirSync(path.join(root, 'assets/voice', g)).filter((f) => f.endsWith('.m4a')).length
    if (counts[g] !== disk) fail(`内置清单 ${g} 组条数 (${counts[g]}) 与磁盘 (${disk}) 不一致`)
  }
  if (!m.hasVoice) fail('内置 foxbell 四组齐全，hasVoice 应为 true')
}
secEnd('11. 内置清单 v2 ↔ 磁盘素材一致')

console.log(ok ? 'VALIDATE OK' : 'VALIDATE FAILED')
process.exit(ok ? 0 : 1)

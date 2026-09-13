// release.mjs — 发版脚本：
//   main 是开发分支（随时合并新代码）；对外稳定版 = release 分支，只在发版时快进到发版提交，
//   外部安装命令固定 `github:jarvislee90s-dot/dsh-foxbell-pet#release`（见 README 安装节）。
//   用法：npm run release -- 2.3.0 [--dry-run]
//   前置约定：CHANGELOG.md 已写好该版本条目（`## [x.y.z]`）。
//   流程：前置校验（在 main / 工作区干净 / 与 origin-main 同步 / CHANGELOG 条目 / tag 未占用）
//         → 同步 package.json + dsh.plugin.json 版本号 → build + validate + test
//         → 提交 chore(release): vX.Y.Z → 打 tag → push main + tag
//         → release 分支快进到该提交并推送（远端不存在则创建；非祖先关系则中止，永不强推）。
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const RELEASE_BRANCH = 'release'
const DRY = process.argv.includes('--dry-run')
const version = process.argv.slice(2).find((a) => !a.startsWith('--'))

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' })
const die = (msg) => { console.error(`\n✗ ${msg}`); process.exit(1) }
const step = (msg) => console.log(`\n== ${msg}`)

/** semver 比较（<0/0/>0）：核心段按数值，prerelease 低于同号正式版 */
function cmpVer(a, b) {
  const parse = (v) => { const [core, pre] = v.split('-'); return { n: core.split('.').map(Number), pre } }
  const A = parse(a), B = parse(b)
  for (let i = 0; i < 3; i++) if (A.n[i] !== B.n[i]) return A.n[i] - B.n[i]
  if ((A.pre ?? '') === (B.pre ?? '')) return 0
  if (A.pre && !B.pre) return -1
  if (!A.pre && B.pre) return 1
  const pa = A.pre.split('.'), pb = B.pre.split('.')
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i], y = pb[i]
    if (x === y) continue
    if (x === undefined) return -1
    if (y === undefined) return 1
    const nx = Number(x), ny = Number(y)
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) return nx - ny
    return x < y ? -1 : 1
  }
  return 0
}

const manifestVersion = (file) => JSON.parse(readFileSync(path.join(root, file), 'utf8')).version
const writeVersion = (file, v) => {
  const p = path.join(root, file)
  const obj = JSON.parse(readFileSync(p, 'utf8'))
  obj.version = v
  writeFileSync(p, JSON.stringify(obj, null, 2) + '\n')
}

// ---------- 1. 前置校验（全部只读，dry-run 也完整执行） ----------
if (!version) die('用法：npm run release -- <x.y.z> [--dry-run]（如 2.3.0）')
if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) die(`版本号格式不合法：${version}`)

step(`校验：分支 / 工作区 / 远端同步（v${version}${DRY ? '，dry-run' : ''}）`)
if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') die('必须在 main 分支上发版（release 分支由脚本快进，不手工提交）')
if (git('status', '--porcelain') !== '') die('工作区不干净：先提交或暂存（git status 查看）')
try { git('fetch', 'origin', 'main') } catch { die('git fetch 失败：无法访问 origin，发版前需与远端同步') }
try { git('fetch', 'origin', RELEASE_BRANCH) } catch { /* 首次发版时远端还没有 release 分支，正常 */ }
if (git('rev-parse', 'main') !== git('rev-parse', 'origin/main')) die('本地 main 与 origin/main 不一致：先 push/pull 对齐')

const changelog = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
if (!new RegExp(`^## \\[${version}\\]`, 'm').test(changelog)) die(`CHANGELOG.md 缺少 [${version}] 条目：先写好发版说明再发版`)

const pkgV = manifestVersion('package.json')
const pluginV = manifestVersion('dsh.plugin.json')
if (pkgV !== pluginV) die(`package.json(${pkgV}) 与 dsh.plugin.json(${pluginV}) 版本号不一致，先手工对齐再发版`)
const needBump = pkgV !== version
if (needBump && cmpVer(version, pkgV) < 0) die(`目标版本 ${version} 小于当前版本 ${pkgV}`)

const tag = `v${version}`
if (git('tag', '-l', tag) !== '') die(`本地已存在 tag ${tag}：该版本已发过`)
if (execFileSync('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`], { cwd: root, encoding: 'utf8' }).trim() !== '')
  die(`远端已存在 tag ${tag}：该版本已发过`)

const remoteRelease = execFileSync('git', ['ls-remote', '--heads', 'origin', RELEASE_BRANCH], { cwd: root, encoding: 'utf8' }).trim()

console.log(`  分支 main ✓  工作区干净 ✓  与 origin/main 同步 ✓  CHANGELOG [${version}] ✓  tag ${tag} 可用 ✓`)
console.log(`  当前版本 ${pkgV} → ${version}${needBump ? '（将同步两处清单）' : '（清单已就位，不再改动）'}`)
console.log(`  ${RELEASE_BRANCH} 分支：远端${remoteRelease ? '已存在（将校验快进）' : '不存在（将首次创建）'}`)

if (DRY) {
  console.log(`\ndry-run 通过。将执行：${needBump ? 'bump 版本 → ' : ''}build + validate + test → ${
    needBump ? '提交 → ' : ''}打 tag ${tag} → push main+tag → ${RELEASE_BRANCH} 快进并推送`)
  process.exit(0)
}

// ---------- 2. 版本号 + 构建 + 测试 ----------
if (needBump) {
  step(`同步版本号 → ${version}（package.json + dsh.plugin.json）`)
  writeVersion('package.json', version)
  writeVersion('dsh.plugin.json', version)
}

step('构建与校验（build + validate + test）')
run('npm', ['run', 'build'])
run('npm', ['run', 'validate'])
run('npm', ['run', 'test'])

// ---------- 3. 提交（版本号/lib 无变化则跳过） ----------
step('提交')
git('add', '-A')
if (git('status', '--porcelain') === '') {
  console.log('  版本号与 lib 均无变化，跳过提交（tag 直接打在当前 HEAD）')
} else {
  git('commit', '-m', `chore(release): v${version}`)
  console.log(`  committed: chore(release): v${version}`)
}

// ---------- 4. tag + push ----------
step(`打 tag ${tag} 并推送`)
git('tag', tag)
git('push', 'origin', 'main', tag)
console.log(`  pushed: main + ${tag}`)

// ---------- 5. release 分支快进 ----------
step(`release 分支快进到 ${tag}`)
if (!remoteRelease) {
  git('push', 'origin', `${tag}:refs/heads/${RELEASE_BRANCH}`)
  console.log(`  created ${RELEASE_BRANCH} @ ${tag}`)
} else {
  let ancestor = false
  try { git('merge-base', '--is-ancestor', `origin/${RELEASE_BRANCH}`, tag); ancestor = true } catch (e) {
    if (e.status !== 1) throw e
  }
  if (!ancestor) die(`origin/${RELEASE_BRANCH} 不是 ${tag} 的祖先（历史分叉，可能有人绕过 main 改过 release）：请人工核查，脚本不做强推`)
  git('push', 'origin', `${tag}:refs/heads/${RELEASE_BRANCH}`)
  console.log(`  fast-forwarded ${RELEASE_BRANCH} → ${tag}`)
}

console.log(`\n✓ v${version} 已发布。外部稳定通道：dsh plugin --profile web add github:jarvislee90s-dot/dsh-foxbell-pet#release`)

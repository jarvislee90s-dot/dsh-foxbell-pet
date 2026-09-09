// validate.mjs — sanity checks before publishing.
// Verifies: file presence + syntax, JSON validity, no forbidden wording, assets present.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
let ok = true

const codeFiles = ['src/index.js', 'src/client.js', 'src/dashboard.js', 'lib/index.js', 'lib/client.js', 'lib/dashboard.js']
for (const f of codeFiles) {
  const p = path.join(root, f)
  if (!existsSync(p)) { console.error('missing:', f); ok = false; continue }
  try { execSync(`node --check "${p}"`, { stdio: 'pipe' }) }
  catch { console.error('syntax error:', f); ok = false }
}

for (const j of ['package.json', 'dsh.plugin.json']) {
  try { JSON.parse(readFileSync(path.join(root, j), 'utf8')) }
  catch { console.error('invalid JSON:', j); ok = false }
}

const textFiles = [...codeFiles, 'README.md', 'README.en.md', 'CHANGELOG.md', 'package.json', 'dsh.plugin.json', 'assets/pet.json']
for (const f of textFiles) {
  const p = path.join(root, f)
  if (!existsSync(p)) continue
  if (readFileSync(p, 'utf8').includes('玲娜')) { console.error('forbidden wording 玲娜 in:', f); ok = false }
}

for (const a of ['assets/spritesheet.webp']) {
  if (!existsSync(path.join(root, a))) { console.error('missing asset:', a); ok = false }
}

// Voice groups must all exist and each contain at least one m4a.
for (const g of ['general', 'approval', 'error', 'done']) {
  const dir = path.join(root, 'assets/voice', g)
  if (!existsSync(dir)) { console.error('missing voice group dir:', g); ok = false; continue }
  const files = readdirSync(dir).filter(f => f.endsWith('.m4a'))
  if (files.length === 0) { console.error('voice group empty:', g); ok = false }
}

// v1.3.0: 交互配置一致性
const srcIndex = readFileSync(path.join(root, 'src/index.js'), 'utf8')
const srcClient = readFileSync(path.join(root, 'src/client.js'), 'utf8')
const requireBoth = (file, name, needle, label) => {
  if (!file.includes(needle)) { console.error(`missing ${label} in ${name}`); ok = false }
}
requireBoth(srcIndex, 'src/index.js', "settingsNamespace('foxbell-pet')", 'settings namespace key')
requireBoth(srcIndex, 'src/index.js', 'installSettingsSection', 'host settings registration')
requireBoth(srcClient, 'src/client.js', 'doneAction', 'config field doneAction')
requireBoth(srcClient, 'src/client.js', 'dblAction', 'config field dblAction')
requireBoth(srcClient, 'src/client.js', 'approvalAction', 'config field approvalAction')
requireBoth(srcClient, 'src/client.js', 'errorAction', 'config field errorAction')
requireBoth(srcClient, 'src/client.js', 'dyn-pet-menu', 'menu styles')
requireBoth(srcClient, 'src/client.js', "settings.plugin.item", 'settings card slot')
requireBoth(srcClient, 'src/client.js', 'attachScope', 'config store scope attach')
requireBoth(srcIndex, 'src/index.js', 'gravity', 'config field gravity (host)')
requireBoth(srcClient, 'src/client.js', "'gravity'", 'config field gravity (client)')
// CFG_ACTIONS 必须是 ANIM 表键的子集（动作绑定依赖该不变量）
for (const a of ['jumping', 'waving', 'failed', 'waiting', 'review', 'running']) {
  requireBoth(srcClient, 'src/client.js', `'${a}'`, `action key ${a} present`)
}

// src == lib 逐字节一致（build 契约）
for (const f of ['index.js', 'client.js']) {
  const src = readFileSync(path.join(root, 'src/' + f), 'utf8')
  const lib = readFileSync(path.join(root, 'lib/' + f), 'utf8')
  if (src !== lib) { console.error('src/lib mismatch:', f); ok = false }
}
// About 面板版本串与 package.json 一致
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
if (!srcClient.includes(`v${pkg.version}`)) { console.error('About version string out of sync'); ok = false }

console.log(ok ? 'VALIDATE OK' : 'VALIDATE FAILED')
process.exit(ok ? 0 : 1)

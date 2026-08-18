// validate.mjs — sanity checks before publishing.
// Verifies: file presence + syntax, JSON validity, no forbidden wording, assets present.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
let ok = true

const codeFiles = ['src/index.js', 'src/client.js', 'lib/index.js', 'lib/client.js']
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

console.log(ok ? 'VALIDATE OK' : 'VALIDATE FAILED')
process.exit(ok ? 0 : 1)

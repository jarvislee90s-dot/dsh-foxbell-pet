// gen-builtin-manifest.mjs — 重新生成 assets/pet.json（内置 foxbell 的包内清单，v2 格式）。
// 时长探测：解析 m4a(mp4) 的 mvhd atom（timescale/duration），与浏览器 Audio 元数据同源；
// 大小取磁盘 stat。运行：node scripts/gen-builtin-manifest.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const assets = path.join(root, 'assets')

function m4aDurationMs(buf) {
  const find = (name, from, to) => {
    let p = from
    while (p + 8 <= to) {
      const size = buf.readUInt32BE(p)
      if (size < 8) break
      const t = buf.toString('ascii', p + 4, p + 8)
      if (t === name) return [p, p + size]
      p += size
    }
    return null
  }
  const moov = find('moov', 0, buf.length)
  if (!moov) return null
  const mvhd = find('mvhd', moov[0] + 8, moov[1])
  if (!mvhd) return null
  let p = mvhd[0] + 8
  const ver = buf[p]
  p += 4
  let timescale, dur
  if (ver === 1) { p += 16; timescale = buf.readUInt32BE(p); p += 4; dur = Number(buf.readBigUInt64BE(p)) }
  else { p += 8; timescale = buf.readUInt32BE(p); p += 4; dur = buf.readUInt32BE(p) }
  if (!timescale) return null
  return Math.round((dur / timescale) * 1000)
}

const GROUPS = ['general', 'approval', 'done', 'error']
const voices = []
for (const g of GROUPS) {
  const dir = path.join(assets, 'voice', g)
  const files = fs.readdirSync(dir).filter((f) => /\.(m4a|mp4)$/i.test(f)).sort((a, b) => a.localeCompare(b, 'zh'))
  for (const f of files) {
    const buf = fs.readFileSync(path.join(dir, f))
    const durationMs = m4aDurationMs(buf)
    if (durationMs === null) { console.error('duration probe failed:', g, f); process.exit(1) }
    voices.push({
      group: g,
      name: f.replace(/\.(m4a|mp4)$/i, ''),
      file: `voice/${g}/${f}`,
      sizeBytes: buf.length,
      durationMs,
    })
  }
}

const sheet = fs.readFileSync(path.join(assets, 'spritesheet.webp'))
const manifest = {
  schemaVersion: 2,
  id: 'foxbell',
  displayName: 'Foxbell·水蜜桃',
  description: '穿水蜜桃主题格纹上衣、百褶裙与波浪帽的小狐狸桌面宠物，保留灵动神态、夸张动作和上翘蓬松尾巴。',
  source: 'builtin',
  spriteVersionNumber: 2,
  spritesheetSizeBytes: sheet.length,
  hasVoice: GROUPS.every((g) => voices.some((v) => v.group === g)),
  hasSubtitle: true,
  voices,
}
fs.writeFileSync(path.join(assets, 'pet.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`assets/pet.json written: ${voices.length} voices, sheet ${sheet.length} bytes, hasVoice=${manifest.hasVoice}`)

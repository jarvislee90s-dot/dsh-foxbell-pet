// 一次性：生成 assets/sounds/alert-{1,2,3}.wav（两音上行 chime，PCM16 44.1kHz 单声道）。
// 用法：node scripts/gen-alert-sounds.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SR = 44100
const NOTE = (f, t0, dur) => ({ f, t0, dur })
const RECIPES = [
  [NOTE(659.25, 0.00, 0.16), NOTE(987.77, 0.14, 0.20)], // E5→B5
  [NOTE(587.33, 0.00, 0.16), NOTE(880.00, 0.14, 0.20)], // D5→A5
  [NOTE(523.25, 0.00, 0.14), NOTE(783.99, 0.12, 0.16), NOTE(1046.50, 0.26, 0.16)], // C5→G5→C6
]
const render = (notes) => {
  const total = Math.max(...notes.map((n) => n.t0 + n.dur))
  const buf = new Float32Array(Math.ceil(total * SR))
  for (const { f, t0, dur } of notes) {
    const s0 = Math.floor(t0 * SR), n = Math.floor(dur * SR)
    for (let i = 0; i < n; i++) {
      const t = i / SR
      const env = Math.exp(-4.5 * t / dur) * (1 - Math.exp(-0.0008 * SR * t))
      buf[s0 + i] += 0.42 * env * Math.sin(2 * Math.PI * f * t)
    }
  }
  return buf
}
const wav = (pcm) => {
  const bytes = Buffer.alloc(44 + pcm.length * 2)
  bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + pcm.length * 2, 4); bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(SR, 24); bytes.writeUInt32LE(SR * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36); bytes.writeUInt32LE(pcm.length * 2, 40)
  for (let i = 0; i < pcm.length; i++) bytes.writeInt16LE(Math.max(-1, Math.min(1, pcm[i])) * 32767 | 0, 44 + i * 2)
  return bytes
}
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds')
mkdirSync(outDir, { recursive: true })
RECIPES.forEach((r, i) => writeFileSync(join(outDir, `alert-${i + 1}.wav`), wav(render(r))))
console.log(`generated ${RECIPES.length} sounds in ${outDir}`)

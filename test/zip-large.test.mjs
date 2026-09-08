// 真实 100MB 上限实战：不打小额度模拟，直接构造 store 模式 101MB 归档打默认上限；
// 拒绝必须发生在任何落盘之前（fail 路径整体移除目标目录）。
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { safeUnzip } from '../src/host/zip.js'
import { buildZip } from './helpers/zipwriter.mjs'

describe('safeUnzip default total limit (real 100MB attack)', () => {
  it('rejects a real 101MB stored archive with zip-total-over-limit', { timeout: 60000 }, async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'foxbell-zip-large-'))
    try {
      const zp = path.join(tmp, 'big.zip')
      fs.writeFileSync(zp, buildZip([{ name: 'big.bin', data: Buffer.alloc(101 * 1024 * 1024, 66) }]))
      const dest = path.join(tmp, 'out')
      await expect(safeUnzip(zp, dest)).rejects.toMatchObject({
        code: 'zip-total-over-limit',
        params: { limit: '100MB' },
      })
      expect(fs.existsSync(dest)).toBe(false) // 拒绝时目标目录整体不残留
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})

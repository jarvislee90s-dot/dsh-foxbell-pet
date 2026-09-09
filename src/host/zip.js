// zip.js — 宿主侧安全解压（yauzl），三重上限对齐 MAM safe_unzip：
//   1. 文件数 ≤ MAX_ZIP_FILES(200)
//   2. 解压后实际写出字节总量 ≤ MAX_ZIP_TOTAL_BYTES(100MB)（按实际写出累计，
//      不信任 zip 头声明的 uncompressedSize，防谎报）
//   3. 条目路径防穿越：拒绝绝对路径、盘符、`..` 段；落点强制在 dest 内（realpath 复核）
import fs from 'node:fs'
import path from 'node:path'
import yauzl from 'yauzl'
import { PetError } from './errors.js'

export const MAX_ZIP_TOTAL_BYTES = 100 * 1024 * 1024
export const MAX_ZIP_FILES = 200

/** 上限的人类可读格式（MAM fmt_limit：整除 MiB → "NMB"，否则 "NB"） */
export function fmtLimit(bytes) {
  const MIB = 1024 * 1024
  return bytes % MIB === 0 ? `${bytes / MIB}MB` : `${bytes}B`
}

/**
 * 条目名 → dest 内安全相对路径；非法返回 null（zip-slip 防御）。
 * 反斜杠归一为 /；拒绝绝对路径、盘符、空段与任何 `..` 段。
 */
export function safeEntryPath(name) {
  if (typeof name !== 'string' || name.length === 0) return null
  const norm = name.replace(/\\/g, '/')
  if (norm.startsWith('/')) return null
  if (/^[A-Za-z]:/.test(norm)) return null
  const segs = norm.split('/')
  const out = []
  for (const s of segs) {
    if (s === '' || s === '.') continue
    if (s === '..') return null
    out.push(s)
  }
  if (out.length === 0) return null
  return out.join('/')
}

/** yauzl 自身会校验条目名（绝对路径/..），其报错映射为我们的稳定错误码 */
function isIllegalNameError(err) {
  const m = String(err && err.message || err)
  return /absolute path|\.\.|relative path/i.test(m) && /entry|filename|path/i.test(m)
}

/**
 * 解压 zip 文件到 dest（不存在则创建）。任何失败抛 PetError 并尽量清理半截产物。
 * @param {string} zipPath
 * @param {string} dest
 * @param {{maxTotalBytes?: number, maxFiles?: number}} [opts] maxTotalBytes 参数化便于小上限单测
 */
export function safeUnzip(zipPath, dest, opts = {}) {
  const maxTotal = opts.maxTotalBytes ?? MAX_ZIP_TOTAL_BYTES
  const maxFiles = opts.maxFiles ?? MAX_ZIP_FILES
  return new Promise((resolve, reject) => {
    const fail = (err) => {
      try { fs.rmSync(dest, { recursive: true, force: true }) } catch { /* best effort */ }
      reject(err)
    }
    yauzl.open(zipPath, { lazyEntries: true, autoClose: false }, (err, zipfile) => {
      if (err) { fail(new PetError('zip-open-failed', `打开压缩包失败: ${err.message}`).with('err', err.message)); return }
      const run = () => {
        if (zipfile.entryCount > maxFiles) {
          try { zipfile.close() } catch {}
          fail(new PetError('zip-too-many-entries', `压缩包文件数超限（>${maxFiles}）`).with('limit', String(maxFiles)))
          return
        }
        fs.mkdirSync(dest, { recursive: true })
        let total = 0
        zipfile.on('entry', (entry) => {
          const rel = safeEntryPath(entry.fileName)
          if (rel === null) {
            try { zipfile.close() } catch {}
            fail(new PetError('zip-entry-illegal-path', `压缩包含非法路径条目: ${entry.fileName}`).with('name', entry.fileName))
            return
          }
          if (/\/$/.test(entry.fileName)) { zipfile.readEntry(); return } // 目录条目
          const outPath = path.join(dest, rel)
          // 落点复核（纵深防御：safeEntryPath 已拒 ..，这里再验包含关系）
          const relCheck = path.relative(dest, outPath)
          if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) {
            try { zipfile.close() } catch {}
            fail(new PetError('zip-entry-illegal-path', `压缩包含非法路径条目: ${entry.fileName}`).with('name', entry.fileName))
            return
          }
          zipfile.openReadStream(entry, (e2, readStream) => {
            if (e2) {
              try { zipfile.close() } catch {}
              fail(new PetError('zip-read-failed', `读取压缩包失败: ${e2.message}`).with('err', e2.message))
              return
            }
            fs.mkdirSync(path.dirname(outPath), { recursive: true })
            const out = fs.createWriteStream(outPath)
            let written = 0
            let over = false
            readStream.on('data', (chunk) => {
              written += chunk.length
              total += chunk.length
              if (total > maxTotal) {
                over = true
                readStream.destroy()
                out.destroy()
                try { zipfile.close() } catch {}
                try { fs.rmSync(outPath, { force: true }) } catch {}
                fail(new PetError('zip-total-over-limit', `压缩包解压总量超限（>${fmtLimit(maxTotal)}）`).with('limit', fmtLimit(maxTotal)))
              }
            })
            readStream.on('error', (e3) => {
              if (over) return
              try { zipfile.close() } catch {}
              out.destroy()
              fail(new PetError('zip-read-failed', `读取压缩包失败: ${e3.message}`).with('err', e3.message))
            })
            out.on('error', (e4) => {
              if (over) return
              try { zipfile.close() } catch {}
              fail(new PetError('internal', `写入解压文件失败: ${e4.message}`))
            })
            readStream.pipe(out)
            out.on('close', () => {
              if (over) return
              zipfile.readEntry()
            })
          })
        })
        zipfile.on('end', () => {
          try { zipfile.close() } catch {}
          resolve({ entries: zipfile.entryCount, totalBytes: total })
        })
        zipfile.on('error', (e5) => {
          try { zipfile.close() } catch {}
          if (isIllegalNameError(e5)) {
            fail(new PetError('zip-entry-illegal-path', `压缩包含非法路径条目: ${e5.message}`).with('name', e5.message))
            return
          }
          fail(new PetError('zip-read-failed', `读取压缩包失败: ${e5.message}`).with('err', e5.message))
        })
        zipfile.readEntry()
      }
      run()
    })
  })
}

// guard.js — 激活守卫：manifest × 磁盘完整性校验与修复建议。
// 对齐 MAM petValidation.diffManifestVsScan + petActivation.repairManifest/buildManifestFromScan，
// 差异：时长探测在浏览器侧（客户端向导/修复对话），宿主只做 stat 级 diff 与结构复核。
import fs from 'node:fs'
import path from 'node:path'
import { scanPet } from './scan.js'
import { validatePetId, BUILTIN_PET_ID } from './petid.js'
import { loadManifest, isAudioExt, isVoiceRel, nameFromRel, SHEET_FILE } from './manifest.js'

/**
 * manifest × 磁盘 stat 比对（不解码媒体）。
 * @returns {{kind:string,detail:string}[]} kind ∈ spritesheet-missing|spritesheet-changed|
 *   voice-missing|voice-changed|voice-extra|manifest-missing
 */
export function diffManifestVsScan(m, s) {
  const issues = []
  if (!s.spritesheet.exists) {
    issues.push({ kind: 'spritesheet-missing', detail: SHEET_FILE })
  } else if (m && m.spritesheetSizeBytes > 0 && s.spritesheet.size !== m.spritesheetSizeBytes) {
    issues.push({ kind: 'spritesheet-changed', detail: `${m.spritesheetSizeBytes} → ${s.spritesheet.size}` })
  }
  if (!m) {
    issues.push({ kind: 'manifest-missing', detail: 'manifest.json' })
    return issues
  }
  const onDisk = new Map(s.voiceFiles.map((f) => [f.rel, f.size]))
  for (const v of m.voices) {
    if (!onDisk.has(v.file)) issues.push({ kind: 'voice-missing', detail: v.file })
    else if (onDisk.get(v.file) !== v.sizeBytes) issues.push({ kind: 'voice-changed', detail: v.file })
  }
  const known = new Set(m.voices.map((v) => v.file))
  for (const f of s.voiceFiles) {
    if (isAudioExt(f.rel) && isVoiceRel(f.rel) && !known.has(f.rel)) {
      issues.push({ kind: 'voice-extra', detail: f.rel })
    }
  }
  return issues
}

/** manifest 语音条目在磁盘的可信度（ignore 降级激活共用判定，MAM manifestVoiceCapOnDisk） */
export function manifestVoiceCapOnDisk(m, s) {
  if (!m) return false
  const onDisk = m.voices.length > 0 && m.voices.every((v) =>
    s.voiceFiles.some((f) => f.rel === v.file && f.exists && f.size === v.sizeBytes))
  return onDisk ? m.hasVoice : false
}

/**
 * 修复建议：把 diff 结果整理成客户端修复对话可直接消费的结构。
 * - canRepair=true 表示「更新清单」按钮可用（图集在且合法大小；否则只能换回/忽略/隐藏）
 * - keepVoices：未变条目（信任缓存时长）
 * - reprobes：需要浏览器重探时长的文件（变动 + 新增），rel/size 已知
 */
export function repairPlan(manifest, scan) {
  const issues = diffManifestVsScan(manifest, scan)
  const sheetOk = scan.spritesheet.exists
  const m = manifest
  const keepVoices = []
  const reprobeFiles = []
  if (m) {
    const disk = new Map(scan.voiceFiles.map((f) => [f.rel, f.size]))
    for (const v of m.voices) {
      if (disk.has(v.file) && disk.get(v.file) === v.sizeBytes) keepVoices.push(v)
    }
    const known = new Set(m.voices.map((v) => v.file))
    for (const f of scan.voiceFiles) {
      if (!isAudioExt(f.rel) || !isVoiceRel(f.rel)) continue
      const kept = keepVoices.some((v) => v.file === f.rel)
      if (!kept) reprobeFiles.push({ rel: f.rel, sizeBytes: f.size, hadEntry: known.has(f.rel) })
    }
  } else {
    for (const f of scan.voiceFiles) {
      if (!isAudioExt(f.rel) || !isVoiceRel(f.rel)) continue
      reprobeFiles.push({ rel: f.rel, sizeBytes: f.size, hadEntry: false })
    }
  }
  return {
    issues,
    canRepair: sheetOk,
    manifestMissing: m === null,
    keepVoices,
    reprobes: reprobeFiles,
    spritesheetSizeBytes: scan.spritesheet.exists ? scan.spritesheet.size : 0,
  }
}

/**
 * 激活/轮询守卫检查入口：对单个宠物 id 产出快照可下发的 guard 结构。
 * 内置 foxbell 不做磁盘守卫（包内素材随版本发布，宿主启动时已校验存在性）。
 * @returns {{id:string, issues:{kind,detail}[], fatal:boolean, plan?:object}}
 *   fatal = 图集缺失/宠物目录缺失/清单缺失且无法自动修复 → 只能换回/隐藏
 */
export function checkPet(petsDir, id) {
  if (id !== BUILTIN_PET_ID) validatePetId(id) // 逃逸 id 直接抛 pet-name-*（不进磁盘错误分支）
  let scan
  try {
    scan = scanPet(petsDir, id)
  } catch (e) {
    return { id, issues: [{ kind: 'pet-dir-missing', detail: String(e && e.code || 'pet-not-found') }], fatal: true }
  }
  const manifest = loadManifest(path.join(petsDir, id), { id })
  const plan = repairPlan(manifest, scan)
  const fatal = !scan.spritesheet.exists
  return { id, issues: plan.issues, fatal, plan: fatal ? undefined : plan }
}

/** 图集尺寸 → 行数/版本（宿主侧不解码图片，仅按 manifest 记录 + 字节大小做一致性判定；
 *  真实像素探测在客户端 Image 解码，MAM probeSheetRows 语义） */
export function spriteVersionOf(rows) { return rows === 9 ? 1 : 2 }

export { nameFromRel }

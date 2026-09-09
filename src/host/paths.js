// paths.js — 插件私有目录解析（~/.dsh/foxbell-pet/…）。
// rc.1 的 ctx.fs 是沙箱文本 seam（可写根 = workspace + /tmp，且无 mkdir/remove/二进制写），
// 插件私有持久化按 harness 先例（anonymous-user-id / settings-file）直接用 node:fs。
// DSH_HOME 语义与 @deepseek-ai/dsh-home-paths 的 resolveDshHome 对齐（尊重环境变量，默认 ~/.dsh）。
import os from 'node:os'
import path from 'node:path'

export function dshHome(env = process.env) {
  const configured = env.DSH_HOME
  if (typeof configured === 'string' && configured.length > 0) return configured
  return path.join(os.homedir(), '.dsh')
}

/** 插件专属商店根：<dshHome>/foxbell-pet（不复用 MAM 的 ~/.mam/pets） */
export function storeRoot(env = process.env) {
  return path.join(dshHome(env), 'foxbell-pet')
}

/** 宠物仓库根：<storeRoot>/pets */
export function petsRoot(env = process.env) {
  return path.join(storeRoot(env), 'pets')
}

/** 导入暂存区：<petsRoot>/.import-staging（隐藏目录，清单扫描自动跳过） */
export function stagingRoot(env = process.env) {
  return path.join(petsRoot(env), '.import-staging')
}

/** 安全删除回收站：<storeRoot>/.trash（不物理删除） */
export function trashRoot(env = process.env) {
  return path.join(storeRoot(env), '.trash')
}

/** Codex 宠物目录：~/.codex/pets（只读来源） */
export function codexRoot(env = process.env) {
  return path.join(os.homedir(), '.codex', 'pets')
}

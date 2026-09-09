// build.mjs — esbuild 双树构建：
//   src/host/*.js   → lib/index.js  （ESM 单文件，node 平台；依赖 external）
//   src/client/*.tsx → lib/client.js （单文件 iife/cjs 包装：window.__ModuleLoader__.load({id,factory})，
//                     react 与 @deepseek-ai/* 平台模块 external，样式 CSS 内联注入）
// lib/ 是发布入口（package.json main 与 ./client），必须随包提交；改完 src/ 后运行本脚本。
// 输出确定性：无 banner 时间戳、无 sourcemap 内联，validate.mjs 以「重建比对」校验 src↔lib 一致。
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))

const CLIENT_MODULE_ID = pkg.name // __ModuleLoader__ 行 id = 包名（harness 构建器同款约定）

/** 客户端包装（对齐 harness tsdown.client.ts 的 banner/footer 约定）：
 *  bundle 以 factory(require) 形态执行，external 的 require('react') 由模块表应答。 */
const clientBanner = `window.__ModuleLoader__.load({ id: ${JSON.stringify(CLIENT_MODULE_ID)}, factory: (require) => {
var module = { exports: {} };
var exports = module.exports;`
const clientFooter = `
return module.exports; } });`

async function buildHost() {
  await build({
    entryPoints: [path.join(root, 'src/host/index.js')],
    outfile: path.join(root, 'lib/index.js'),
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    // 运行时依赖保持 external：yauzl（zip 解压）与 @deepseek-ai/*（宿主平台包）
    external: ['yauzl', '@deepseek-ai/*', 'node:*'],
    logLevel: 'warning',
  })
  console.log('lib/index.js  <-  src/host/**（esm bundle）')
}

async function buildClient() {
  await build({
    entryPoints: [path.join(root, 'src/client/index.tsx')],
    outfile: path.join(root, 'lib/client.js'),
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: 'es2020', // React 18 目标
    jsx: 'automatic', // → require('react/jsx-runtime')（平台种子词）
    external: ['react', 'react/jsx-runtime', 'react-dom', '@deepseek-ai/*'],
    banner: { js: clientBanner },
    footer: { js: clientFooter },
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
  })
  console.log('lib/client.js  <-  src/client/**（单文件 iife 包装，react/@deepseek-ai/* external）')
}

await buildHost()
await buildClient()

// 产物纯度自检（与 validate 同规则，构建时就地反馈）
const client = readFileSync(path.join(root, 'lib/client.js'), 'utf8')
const impure = client.split('\n').filter((l) => /^\s*(import|export)\b/.test(l))
if (impure.length > 0) {
  console.error('lib/client.js 残留 import/export：', impure.slice(0, 3))
  process.exit(1)
}
writeFileSync(path.join(root, 'lib/.build-stamp'), `${pkg.version}\n`)
console.log('done: src → lib built（纯度自检通过）')

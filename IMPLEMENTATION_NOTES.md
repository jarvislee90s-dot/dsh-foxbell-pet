# IMPLEMENTATION_NOTES — dsh-foxbell-pet v2.0.0

日期：2026-09-07 · 基线：v1.3.0（20169be）→ v2.0.0 · 分支：`feature/v2.0.0-mam-pet-system`

移植源：MultiAgents-Manager（MAM）commit `a77bb21`（v0.3.0，只读）
协议依据：deepseek-harness tag `dsh-v0.1.2-rc.1`（a66e470，只读）；master `d347e70`（0.1.3-alpha.1）仅用于前向风险评估（§10）

---

## 1. 关键决策与理由

### D1. B1 迁移：`session.snapshotEvents()`（唯一读取路径）
rc.1 的 Session 类删除了 `events` 数组属性，事件读取只有 `snapshotEvents(fromSeq?, toSeqExclusive?)`
（返回冻结数组，元素形状 `{type, seq, time, data}`，与旧属性一致）。迁移点集中在
`src/host/state.js` 的 `readEvents()`——**唯一**的事件读取函数；`scanSession/derive/compute`
判定逻辑逐行保持 v1.3.0 语义（error > approval > running > done、红灯已读即消失、
断联=运行中从 roots 消失转深红、60s 清理、完成队列 ≤8）。
未做「兼容旧属性」的双路兜底：任务要求旧用法零残留（可 grep 自证），双路兜底会让
`session.events` 字面量留在代码里。rc.1 之前的宿主本就不在本版本支持面（README 兼容表）。

### D2. B2 迁移：`ctx.settings.installSection(owner, ns, schema, entry, hooks)`
- rc.1 中 `installSettingsSection` / `settingsNamespace` 辅助函数已删除（npm 包
  `@deepseek-ai/dsh-settings@0.1.2-rc.1` 导出面实测：`SettingsProvider / SettingsConflictError /
  redactSecrets / default`，无辅助函数）。
- 注册方式按 harness 先例（llm-deepseek 等）：`ctx.inject(['settings'], …)` 可选注入 +
  `ctx.settings.installSection(ctx, 'foxbell-pet', Config, entry, hooks)`。owner=插件自身 ctx；
  ns 为裸小写连字符字符串（rc.1 运行时校验 `/^[a-z][a-z0-9-]*$/`）。
- hooks 形状 `{setSource, onChange, validate?}` 兼容：`setSource(current)` 收到 **thunk**
  （attach=resolved scope getter / detach=entry 回退），宿主把 thunk 存进 `configSource`，
  `/state` 每轮经 `readConfig()` 读活值 → 配置持久化且热更新生效（settings 服务不在场时
  静默回退 entry，TUI 降级与 v1.3.0 一致）。
- 依赖提升：`@deepseek-ai/dsh-settings: ^0.1.2-rc.1`（package.json）。

### D3. B3 迁移：`dsh.client.inject` = 包级依赖边，声明为空数组
rc.1 语义（packages/client/modules 实测）：`dsh.client.inject` 的元素是**包名**，表示
「该行物化前必须先到达的包行」；`require()` 的解析顺序 = 平台种子表 → 已物化模块 → 已注册
factory。种子表（PLATFORM_MODULES）含 `react`、`react/jsx-runtime`、`react-dom`、
`react-dom/client`、`@deepseek-ai/cordis`、`dsh-client-store`、`dsh-client-ui-slots`、
`dsh-client-ui-primitives`——**种子词不需要 inject 边**。
本插件客户端 bundle 只 `require("react")` 与 `require("react/jsx-runtime")`（esbuild
jsx=automatic），全部命中种子表 → `inject: []`。已删除的 `@deepseek-ai/dsh-client-runtime`
引用清零；v1 声明的 `dsh-client-locale`（任务口径：不集成 harness locale service，插件内部
zh/en 字典）与 `dsh-api-gateway`（私有路由直接 fetch，同源无需 gateway）一并移除。
`scripts/validate.mjs` §7 强校验：bundle 的 external require 集合 ⊆ 种子表 ∪ inject 声明，
且 inject 无死边（声明了就必须被 require）——「dsh.client 声明与客户端实际依赖一一对应」。

### D3b. 平台服务获取路径底账（实机对照底册）
客户端半消费的每个平台服务/模块，两套「inject」分层列清（`dsh.client.inject` = 包级模块表
依赖边；`export const inject` = cordis fiber 服务边）：

| 服务/模块 | 获取方式 | 本仓库消费点 | rc.1 依据（dsh-v0.1.2-rc.1 行号） |
|---|---|---|---|
| `react`、`react/jsx-runtime` | 平台种子模块 require（不经任何 inject 边） | lib/client.js 全部 require 面（validate §7 锁死） | platform.ts:8-9（PLATFORM_MODULES）；seed.ts:28-29（getStaticModules，satisfies 编译期钉死）；client/modules system.ts:203（require 先查 seed） |
| `slots` | **fiber 服务边** `export const inject = ["slots"]` + `ctx.get("slots")` 防御读 | src/client/index.tsx:110（边）、:66（读）、:85/91/99（shell.overlay / sidebar.footer.action / settings.plugin.item 三槽注册） | 提供方 ui-renderer registry.ts:133-134（`super(ctx,'slots')`）+ client index.ts:89（实例化）；边裁决 boot.ts:149（fiber.inject 缺服务 → entry 不激活并具名报错）；平台同款先例 ui-layout client index.ts:111 |
| `sessions` | **无边**，防御式 `ctx.get("sessions")`；缺席退化 undefined（特性降级不抛错） | index.tsx:30（makeUseSessions 读 `list.getSnapshot/subscribe`）、Pet.tsx 卡片点击 `sessions.open(id)` | 提供方 session-controller client sessions/service.ts:263（`rootCtx.reflect.provide('sessions', this)`）；`list: SnapshotStore<SessionListState>` 契约 service.ts:190-191 |
| `settingsScope` | **无边**，防御式 `ctx.get("settingsScope")`；缺席回落 localStorage 双后端（TUI/无 settings 降级路径，有意不声明硬边——对照平台先例 locale 是硬边） | index.tsx:73-81（`bind({namespace:"foxbell-pet"})` + ctx.effect 卸载接线） | 提供方 ui-settings client settings-scope.ts:232/254（`SettingsScopeBinder extends Service`+`super(ctx,'settingsScope')`）+ client index.ts:72（实例化）；`bind<T>(spec)` 契约 settings-scope.ts:282；硬边先例 locale client index.ts:531/540 |
| `ctx.effect` | cordis Context 内建（@deepseek-ai/cordis 亦为种子词） | index.tsx:79 | platform.ts:9；boot fiber 派发 apply（boot.ts:97 同机制） |
| bundle 装载契约 | `window.__ModuleLoader__.load({id, factory})` | scripts/build.mjs banner/footer | boot.ts:56-58（facade 缺失即 boot 失败——契约存活） |
| 宿主半（对照） | `export const inject = ['webServer','fs','agents','sessions','sessionTitle']`（v1 相同）+ 可选 `ctx.inject(['settings'])` | src/host/index.js:51 / :72-77 | settings 服务方法 installSection 属 dsh-settings@0.1.2-rc.1（B2，D2） |

空 `dsh.client.inject` 的成立链：包级 inject 的唯一消费点是 client/modules system.ts:165-168
的到达序循环（空数组 = 零次迭代 = 无前置包要求）；require 面全部由种子表应答（system.ts:203），
system.ts:209/225 的「missed the module table」报错路径不可达。

### D4. 构建：esbuild 双产物
- `lib/index.js`：src/host/** 打包为 ESM 单文件（platform=node, target=node18）；
  `yauzl`、`@deepseek-ai/*`、`node:*` external（运行时依赖走 node_modules，宿主平台包走
  harness 依赖解析）。
- `lib/client.js`：src/client/** 打包为**单文件 iife**（任务口径）：esbuild `format:'cjs'` +
  banner/footer 包装成 `window.__ModuleLoader__.load({id:"dsh-foxbell-pet", factory:(require)=>{…
  return module.exports}})`——与 harness 官方 tsdown.client.ts 的客户端产物约定逐字同款
  （banner `window.__ModuleLoader__.load({ id: <pkg>, factory: (require) => {`，footer
  `return module.exports; } });`）。external：`react`、`react/jsx-runtime`、`react-dom`、
  `@deepseek-ai/*`。target es2020（React 18）。样式走 `styles.ts` 模板串 + 运行时 `<style>`
  注入（CSS 内联进 bundle，无独立 .css 产物）。
- 产物纯度：`grep -E "^\s*(import|export)\b" lib/client.js` 零命中（build 就地自检 + validate 复检）。
- 构建确定性：无时间戳/sourcemap 内联；`lib/.build-stamp` 记录版本，validate 校验 stamp 与
  package.json 一致（取代 v1「src==lib 逐字节」检查——该检查的前提「build=纯拷贝」已不存在，
  但「lib 必须与 src 同步」的意图保留：stamp 不匹配即要求重建）。

### D5. 宿主文件访问：node:fs 直写 `~/.dsh/foxbell-pet/`
rc.1 的 `ctx.fs` 是模型工具面的沙箱 seam：可写根 = workspaceRoot + /tmp + tmpdir（不含
`~/.dsh`），且接口无 mkdir/remove/二进制写。harness 自己的插件私有持久化先例
（anonymous-user-id、settings-file、storage-json）全部直接用 node:fs + resolveDshHome。
本插件同款：`src/host/paths.js` 复刻 `resolveDshHome` 语义（尊重 `DSH_HOME` 环境变量，默认
`~/.dsh`），商店根 `~/.dsh/foxbell-pet/`（**插件专属，不复用 MAM 的 ~/.mam/pets**）：
```
~/.dsh/foxbell-pet/
├── pets/<id>/            外部宠物（spritesheet.webp + manifest.json + voice/<group>/<file>）
│   └── .import-staging/  导入暂存区（隐藏目录；插件启动时清扫残留=崩溃自愈）
└── .trash/               安全删除回收目录（<id>-<ts>，不物理删除）
```
内置 foxbell 素材读取保留 v1.3.0 的 ctx.fs 路径（诊断字段 `diag.fsAvailable/probes/loadError`
语义不变，回归项）。

### D6. 清单 schemaVersion：写出 2，读取兼容 1
任务口径「清单 v2 格式」的字段集与 MAM manifest（其 `SCHEMA_VERSION=1`）完全一致
（schemaVersion/id/displayName/description/source/spriteVersionNumber/spritesheetSizeBytes/
hasVoice/hasSubtitle/voices[group,name,file,sizeBytes,durationMs]）。歧义假设（任务禁止等待
人工指导，按合理假设记录）：**「v2」指本插件的清单格式代际**（区别于 v1.3.0 的
`assets/pet.json` 老格式：无 schemaVersion/voices），故本插件写出 `schemaVersion: 2`；
读取接受 `[1, 2]`——MAM 生态产出的 zip（schemaVersion 1）可直接导入互操作。
`spriteVersionNumber` 语义与 MAM 相同：1=9 行图集（1536×1872）/ 2=11 行（1536×2288）/
0=未知（待探测），运行时自适应（客户端 Image 解码探测 + manifest 记录快路径）。
内置 foxbell 的包内清单 `assets/pet.json` 已升级 v2（`foxbell` 为保留 id；31 条语音的
sizeBytes/durationMs 由 `scripts/gen-builtin-manifest.mjs` 从磁盘与 m4a mvhd atom 实测生成，
可复现）。

### D7. 时长探测的分工：浏览器探测、宿主复核
MAM 的音频时长探测在前端（Audio preload=metadata）。本插件保持同一分工：
- 客户端（导入向导/管理保存/修复对话）并行探测（Promise.all 全量并行 + 失败 500ms×2 次自动
  重试 + 8s 超时，MAM useVoiceDurationProbe 同参数），组装完整 manifest 回传；
- 宿主 `parseManifest` 结构校验 + **磁盘复核**（voices[].file 必须存在于磁盘且 sizeBytes 与
  stat 一致、spritesheetSizeBytes 与图集一致）→ 防伪造清单；原子写 + .bak。
有效性规则 MAM 同值：1s < durationMs < 20s（开区间）且单文件 ≤10MB；四组（general/approval/
done/error）各 ≥1 合法文件判定「有语音」（全有或全无）。

### D8. 激活守卫的双触发面
任务：「插件激活与每次切换时校验完整性…问题随状态快照下发，客户端弹修复对话」。实现：
- **切换时**：`POST /api/activate` 即时 `checkPet`（stat 级 diff，MAM activatePet 同判定），
  返回 `activated / mismatch(issues+plan+manifest) / invalid-sheet`；mismatch 由切换对话框
  内嵌三选面板（更新清单/忽略降级/取消）处理——对齐 MAM PetSwitchDialog。
- **插件激活（页面加载）后**：宿主每轮 `/state` 快照携带 `guard`（当前激活宠物的完整性问题，
  无问题为空数组）；客户端检测 guard 非空且未被「忽略签名」记忆覆盖时弹修复对话
  （更新清单 / 换回 foxbell / 忽略 / 隐藏宠物，MAM PetStartupGuard 四选项同款）。
  **宠物本体运行中不弹**：拖拽/坠落（busyRef）或瞬时动作播放中时跳过本轮触发。
  「忽略」以 `guardSignature(id, issues)`（kind+detail 排序串）持久记忆，素材再变动 → 签名
  变化 → 再次弹出（MAM「下次校验仍会提示」语义）。
- 修复算法（repairPlan/客户端 doUpdate）与 MAM repairManifest 一致：未变条目保留缓存时长，
  变动+新增重探；`hasSubtitle = hasVoice && old.hasSubtitle`（修复不擅自开字幕）；
  rows 判定探测优先、manifest 记录兜底（MAM FIX-4）；manifest 缺失（直投）首建 backup=false、
  修复更新 backup=true。
- ignore 降级：不重写 manifest（诚实语义），voiceCap 按 `manifestVoiceCapOnDisk` 收敛
  （任一语音缺失/大小变动 → 保守无语音）。

### D9. 状态卡片色彩语义（用户可见变化，CHANGELOG 显著标注）
宿主 `/state` 的 `projects[].status` 字段语义**不变**（running/approval/error/done，判定逻辑
D1 所述零改动）；**客户端渲染口径**切换为 MAM：
| status | v1.3.0 | v2.0.0（MAM 口径） |
|---|---|---|
| approval | 🟡 黄 | 🔴 红 `#ef4444` |
| running | 🟢 绿 | 🟡 黄 `#eab308` |
| done(unread) | 🔵 蓝 | 🟢 绿 `#22c55e` |
| error/断联 | 🔴 红 | **深红 `#7f1d1d` + ⚠ 前缀标识**（本插件特有态，与「待审批」红明确区分）|

MAM 规则一并采纳：审批语音 10s 全局限流；绿卡点击即确认（本地立即消卡 + /ack，MAM ackDone）；
卡片排序 error > approval > running > done（宿主 rank，v1 既有）；任务姿态 waiting > running、
全绿回落 idle（MAM 口径：review 不再作持续任务态，保留在动作绑定清单）；MAX_CARDS=6 +
「+N 更多」胶囊；点卡片跳会话（sessions.open）+ 已读语义不变（回归项）。

### D10. 宠物本体：MAM 基准、DOM 定位
MAM 的 Tauri 窗口几何（setPosition/workArea/syncSize/穿透）整体废弃，改为 WebUI 内 DOM
定位：**视口为工作区**，精灵 root `position:fixed`，`{x,y}` = 精灵左上角；地面
`groundY = innerHeight - px(76) - px(208)`（v1 默认 bottom:76 落点保留，随 scale 缩放）；
x 钳制 `[0, innerWidth - px(192)]`、y 钳制 `[0, groundY]`（MAM clampToWorkArea 同语义）。
位置记忆升级：`dyn-pet-foxbell-pos` 存 `{x,y}`（MAM POSITION_KEY 同构），v1 的
`dyn-pet-foxbell-x` 继续读写（旧键不迁移：读到 x-only 时 y 按地面落点补）。
物理参数与 MAM 逐项一致：GRAVITY=1400px/s²、DAMP=0.86^(dt·60)、MIN_VX=24、dt 上限 0.05、
采样窗 150ms、投掷 vx=窗口首末差分（vy0=0）、恒加速度精确积分 `y += vy·dt + ½g·dt²`、
落地压扁 `scaleY(0.55)` 60ms ease-out → 回弹 240ms `cubic-bezier(.34,1.56,.64,1)` → +260ms
清过渡 + 补跳 jumping 1500ms。
动画优先级链 `drag > transient > task > look > idle`、瞬时动作代数计数防过期覆盖、look 空闲
6s 触发/250ms×16 帧/v1 图集静默跳过、方向阈值 movedY<-8 / |movedX|>6、帧时长表全量照抄
（见对齐索引表 §3）。单击=固定挥手 1700ms 不出声；双击=general 组语音+dblAction；
右键=菜单。**已知 MAM 怪癖未复刻**：MAM 基线 `lastDeltaRef` 从不更新导致拖拽松手也播挥手
（其源码注释自证 moved 恒 false）——按 v1.3.0 与 MAM *意图*（`!moved` 才挥手）实现真实位移
判定；此为「行为细节以 MAM 源码为准」的唯一有意偏离，理由：该怪癖与其 spec A1（单击挥手）
自相矛盾，且 v1.3.0 已是正确行为（向后兼容原则）。

### D11. 右键菜单结构
MAM 结构基准 + 任务书明示的插件差异：
🔊出声（无语音禁用+tooltip）/ 💬语音字幕（无字幕禁用+tooltip）/ 🧲物理坠落 ·
📏大小（三档 0.75/1/1.25，任务书设置卡分区同款档位）·
🖱️双击 / 🔴红灯(approvalAction) / 🟥深红灯(errorAction) / 🟢绿灯(doneAction) **四场景**
动作绑定子菜单（实时预览：进入立即播 1600ms + 1700ms 循环，返回/关闭即停，MAM B4 同参数；
MAM 只有三场景且 errorAction 占位——本插件 error 态真实存在，四场景为 v1.3.0 既有语义，
任务书第 3 条明示「四类动作绑定子菜单」）·
🔁切换宠物（当前项打勾，点击即热切换；末行「切换宠物…」开卡片对话框，任务书第 6 条新增）·
🦊隐藏桌宠 · ℹ️关于（`dsh-foxbell-pet v2.0.0`，validate 校验与 package.json 一致）。
MAM 的「📌悬浮最前」不移植（OS 级能力，任务非目标）。

### D12. 四来源导入的 WebUI 形态差异
MAM 用 Tauri 原生对话框传**本地路径**；WebUI 浏览器拿不到文件路径，形态适配：
- **本地文件夹**：`<input webkitdirectory>` 选择目录 → 客户端过滤（spritesheet.webp +
  voice/<group>/*.{7 种音频扩展}，≤200 文件）→ base64 JSON 上传 `/api/import-folder-files`
  → 宿主净化 rel（拒 `..`/绝对路径，白名单形态）落临时目录 → **复用同一 folder 暂存管线**
  （locate_sheet 根或一层子目录 / copy_voice_tree 三段规则 / pet.json 预填）。
- **zip 包**：文件选择器上传原始字节 → 宿主临时落盘 → `safeUnzip`（yauzl）三重上限：
  文件数 ≤200、解压后**实际写出字节** ≤100MB（不信任 zip 头声明值，MAM FIX-5 同款）、
  条目路径防穿越（yauzl 自校验 + safeEntryPath 白名单 + 落点包含关系复核，三层）→
  解压到 `.import-staging/extract-<uid>` → 复用 folder 管线 → extract 用完即删。
- **Codex 宠物目录**：宿主直接读 `~/.codex/pets/`（服务端本地目录，与 MAM 同形态）；
  `codex-list` 只收录含 spritesheet.webp 的目录并标注 imported；`import-codex` 前
  validatePetId 防 `../` 读侧逃逸。
- **Petdex 在线仓库**：列表与下载**均由宿主半代理**（客户端不直连外网）：
  `petdex-search`（全量清单 → slug/displayName 子串过滤，截断 100 条）与
  `import-petdex`（slug 解析 → 清单匹配 → zip 下载 → 临时落盘 → 统一 zip 管线）。
  安全面 MAM 同款：强制 https、域名 allowlist（petdex.dev / www.petdex.dev / *.petdex.dev，
  `petdex.dev.evil.com` 与 `evil-petdex.dev` 均拒）、重定向 ≤5 跳且**每跳重新校验**
  （Node fetch redirect:'manual' 手动跟链）、流式体积封顶（清单 20MB / zip 50MB，
  Content-Length 预检 + 按块累计）、临时 zip 文件名 slug 白名单 [a-z0-9-] + pid + 计数
  （防注入/并发互踩）。清单响应双形态（包装 {pets:[]} 优先、裸数组兼容，MAM 第九轮 Bug1）。
  **超时差异**：任务书明示 8s（MAM 为清单 30s/下载 120s）——按任务书收紧为统一 8s，
  大 zip 慢网络可能超时（已知限制 §11-L3）。
- 暂存 id `uid() = 时间戳-pid-计数`（MAM issue #32-2）；启动清扫 `.import-staging`
  残留（崩溃自愈，仅清暂存不触宠物目录）；取消/失败无残留（cancel 静默幂等、复制失败
  整体回滚、extract/tmp 用完即删）。

### D13. 管理对话框与闪切保护
MAM PetManageDialog 全功能移植：改名（服务端 rename = **先目录 rename（失败零副作用）后
manifest.id 同步（.bak 备份；写失败仅告警不判失败**，身份以文件夹名为准——MAM 同款顺序与
容错））、编辑显示名/描述、按组增删语音（直写正式目录 + 同名 `-2/-3…` 序号去重不覆盖、
删除走三段规则 + `..`/反斜杠显式拒绝）、字幕开关、**安全删除**（客户端二次确认条 →
宿主移入 `~/.dsh/foxbell-pet/.trash/<id>-<ts>`；MAM 用系统回收站（trash crate），Web 插件
无 OS 回收站依赖，落插件私有 .trash——「不物理删除、可手动恢复」语义等价；跨设备 rename
失败退化 cp+rm 仍进 .trash）、查看目录路径（/api/scan 返回 dir + /api/store-info，UI 展示 +
复制按钮；MAM 的「打开文件夹」为 OS 级 reveal，非目标不移植）。
**闪切保护**（MAM EP5+P1-4 同款）：编辑当前激活宠物前 `ensureNotActive()` → 暂切 foxbell +
`dyn-pet-foxbell-flash-switched` 持久标记（跨对话框关闭/重开生效）；保存/改名成功 → 切回
（改名场景切回**新 id**）；失败或对话框直接关闭 → `restoreFlashSwitched()` 切回原宠物
（指针不滞留 foxbell）；删除成功 → 清标记。

### D14. 切换对话框与热切换
卡片式列表：内置 foxbell 恒第一张（「内置」徽标）+ 全部外部宠物；缩略图 48×52（1/4 帧，
backgroundSize v1=384×468 / v2=384×572，MAM 同值）；`vN`/`v?` 徽标（v? title=待首次激活
校验）；🔊/💬 能力图标（不具备时 opacity 0.4 + tooltip）；激活卡高亮。
点击 → `/api/activate`（宿主即时完整性校验）→ activated 则 `cfgStore.set({activePetId})`
（localStorage + settings scope 双后端）→ 宿主下一轮 `/state` 下发新 activePet/voices →
客户端 store 以 `${id}#${rev}` 键检测变化 → **精灵 URL/行数/VoicePlayer 全量热替换，无需
刷新页面**。rev = 宿主 manifest mtime（防浏览器音频缓存陈旧）。mismatch → 内嵌三选面板
（更新清单/忽略降级/取消）；invalid-sheet → 内联错误。所见即所得：voiceCap 返回后本地修补
卡片徽标（MAM 同款，ignore 降级不重拉列表防回滚）。

### D15. 无语音/无字幕宠物降级（MAM §13 全表移植）
- hasVoice=false：动作照播（playVoice 的动作先于语音闸门）、不出声不出字幕、菜单「出声」行
  置灰 + not-allowed + tooltip（`menu.soundNoCap`）、任务完成只播动画；
- hasSubtitle=false（有语音）：声音正常、气泡永不显示、菜单「语音字幕」行置灰 + tooltip；
- 某组为空：general 回落全池，其余组静默跳过（动作已播）；
- manifest 缺失的直投宠物被激活：最低档渲染（动画可用、displayName=id、无语音无字幕）；
- 图集/解析失败：回落内置 foxbell 描述符（宠物永不白屏——WebUI 中即回退默认精灵 URL）；
- 桌宠隐藏（🦊 关）：playVoice 首行闸门直接 return（动作也不播，MAM 问题 6 同款）。

### D16. 错误码体系与呈现
宿主 `PetError {code, params, detail}`（MAM PetRpcError 同构，camelCase JSON）；路由错误
统一 `{code, params, detail}`，HTTP 状态按码表映射（404/400/500）。码表 = MAM 49 码
（error.rs ALL_RPC_CODES）**− reveal-failed**（OS 级打开文件夹不移植）
**+ manifest-invalid**（宿主清单×磁盘复核，D7）**+ origin-forbidden**（同源防护，D17）= 50 码；
客户端本地 PetError 8 码（sheet-*/audio-*/scan-fail）与 MAM 同表。
呈现：客户端 `i18n.ts` 内部 zh/en 字典（MAM locales pet.* 子树移植 + 本插件新增键），
`petErrMsg` 分流与 MAM 一致（PetError→err.*；rpc 形状→白名单内 rpc.*、白名单外收敛
internal；普通 Error→message 透传；其余→scan-fail 兜底）；**内联呈现于对话框**
（InlineError/InlineOk 组件），不引入 toast、不集成 harness locale service。
语言判定 navigator.language（zh* → zh，其余 en）。
防漂移闭环：validate §10 锁「宿主 ALL_RPC_CODES ↔ 客户端 KNOWN_RPC_CODES ↔ zh/en 字典键」
三方一致（MAM rpc_codes_have_i18n_keys 测试的等价物）；vitest `client-logic.test.ts` 再验
字典键集与插值。

### D17. 私有路由的安全面
rc.1 的 `webServer.register` 路由**无框架级鉴权**（trust fence 只挂 /api connection 前缀）。
本插件路由族全部挂自有前缀 `/dyn-pet-foxbell/`，加固：
- 所有写路由（POST /api/*）做 Origin 校验：带 Origin 头且 host 不匹配 → `origin-forbidden`
  403 语义（400 状态 + 码）；同源/无 Origin（curl 调试）放行——DNS-rebinding/CSRF 最小防护；
- id 白名单校验先于任何磁盘操作（validatePetId：空/点前缀/字符集/长度 64/Windows 保留设备名
  22 个/foxbell 保留字，拒绝顺序与 MAM 一致）；
- 资产路径三段规则（voice/<group>/<file>，group ∈ 四固定分组）+ decodeURIComponent 后
  `..`/包含关系复核（双层）；
- 上传限长：JSON 体 1MB、zip 100MB、音频 10MB（readBodyBytes 流式累计，超限即断）；
- petdex allowlist/https/重定向逐跳校验（D12）。
已知残余风险（§11-L5）：私有路由对本机其它进程无鉴权（与 harness 自身 /plugins 资产路由
同水位；宠物商店非机密数据面）。

### D18. `/state` 快照扩展与轮询
既有字段（seq/completions/runningSessions/projects/voices/assetDir/spriteBytes/diag）语义
不变；新增 `activePet {id,name,hasVoice,hasSubtitle,spriteVersionNumber,spriteUrl,rev}`、
`pets[]`（内置恒第一 + 外部摘要；**不含 dir 字段**——路径只经 /api/scan 与 /api/store-info
按需下发，缩小轮询面）、`guard[]`（激活宠物完整性问题，无问题为空）。`voices` 改为**当前
激活宠物**的语音清单（index/group/name/file/url，url 指向 `/dyn-pet-foxbell/pets/<id>/…`
带 rev 防缓存）。轮询频率维持 **1.5s**。守卫 stat 级 diff 每轮跑一次（≤40 文件 stat，
开销与 v1 的语音内存表构建同量级）。

### D19. Config 扩展与旧配置兼容
`Config` 新增 `scale: z.union([0.75,1,1.25]).default(1)` 与
`activePetId: z.string().default('foxbell')`；既有 7 字段与语义不变。旧保存配置
（~/.dsh/settings.yaml 或 localStorage 无这两个键）加载即得 schema/CFG_DEFAULT 默认值，
零报错、无需用户干预（宿主 schemastery default + 客户端 sanitizeConfig 双兜底，vitest
`config (旧配置兼容)` 用例锁定）。localStorage 键全部沿用 `dyn-pet-foxbell-*` /
`dyn-foxbell-pet:state-v1` 前缀（不迁移旧值、不碰 MAM 的 `mam-*` 键）；新增键：
`-pos`（{x,y} 位置记忆）、`-flash-switched`（闪切标记）、`-guard-ignored`（守卫忽略签名）。

### D20. 设置卡：单卡双分区
`settings.plugin.item` key=`foxbell-pet`（与宿主 installSection ns 严格配对——rc.1 派发
规则：Host describe 的 namespaces ∩ 槽内同 key 卡片）。「配置」区：声音/语音字幕/落地物理
开关 + 四场景动作下拉 + **三档缩放按钮组**（作用于精灵/卡片/菜单整体：`px(v)=round(v*scale)`
贯穿精灵尺寸/backgroundSize/卡片字号内边距/菜单字号/气泡，MAM px() 同款）。「宠物管理」区：
当前宠物名（appStore 轮询即时刷新）+ 切换/导入/管理三按钮（唤起 DialogHost 对话框）+
Petdex 入口（新窗口打开 petdex.dev）。不新增第二张设置卡。与右键菜单读写同一 cfgStore
（双后端乐观更新，v1.3.0 语义不变）。

### D21. TUI / 无 webServer / 无 settings 降级（回归项）
- 宿主半：顶层 `inject = ['webServer','fs','agents','sessions','sessionTitle']` 与 v1.3.0
  完全一致——TUI（无 webServer）时插件根本不 apply，静默不激活、不影响宿主；settings 走
  `ctx.inject(['settings'],…)` 可选注入 + try/catch，无 settings 部署回退 entry 配置。
- 客户端半：`slots` 缺失 → apply 直接 return；`settingsScope` 缺失 → 纯 localStorage 后端；
  `sessions` 缺失 → 卡片点击只 /ack 不跳会话（try/catch 包裹）。全部防御式，无抛错路径。

### D21b. 当前会话 id 的 rc.1 读法（v1 useSessions hook prop → list 快照）
v1.3.0 通过槽位 props 携带的 `useSessions((s)=>s.current)` hook 读当前会话（rc.7 时代形态）。
rc.1 的客户端 `sessions` 服务契约（session-controller `ISessions`）是
`list: ObservableSnapshot<SessionListState>`（`getSnapshot()/subscribe()`），
`SessionListState.current` 即当前选中会话 id（service.ts 注释明示 "carries `current`, the
persisted selection"）。v2 改为 `makeUseSessions(ctx)`：把 `sessions.list` 封装成恒定
React hook（内部无条件 useState+useEffect(subscribe)），服务/字段缺席时退化为恒 undefined
——「当前会话的 done/error 卡自动已读」特性据此保留；卡片点击跳会话仍走
`ctx.get('sessions').open(id)`（rc.1 契约同在）。

### D22. 新增运行时依赖说明（任务目标 7 要求）
- 宿主半 +1：`yauzl@^3.4.0`（zip 解压）。理由：zip 来源导入需要宿主侧安全解压；yauzl 是
  Node 生态事实标准（no unzip-bomb by design：流式、lazyEntries、不自建目录/符号链接），
  MIT，零传递依赖风险面小（仅 buffer-crc32/pend/fd-slicer/yauzl-promise 系工具库），且以
  external 方式打包（不内联进 lib/index.js，随 npm 安装解析）。备选 adm-zip（全内存缓冲，
  与 100MB 上限的流式语义冲突）与自研 zip 解析器（安全面自证成本高）均劣于 yauzl。
- 客户端半 +0：bundle 只 require 平台种子词（react / react/jsx-runtime），零新增运行时
  外部依赖（validate §7 锁死）。
- devDependencies：esbuild（构建）、vitest（测试）、typescript + @types/react + @types/node
  （typecheck）。
- 可测性接缝（非依赖）：`petdex.js` 全部网络函数接受注入 `fetchImpl`（默认 global fetch），
  `routes.js` 的 env 支持 `fetchImpl` 透传——vitest 以 mock fetch 覆盖 allowlist/封顶/重定向
  全分支，不触真实网络。

### D23. 复审修正：宠物目录/文件 symlink 一律不跟随（lstat 口径）
初版 `scanPet`/`petDirOf`/activate 用 `existsSync/statSync` 判定宠物目录，`sendFile` 用
`statSync` 判文件——三者都会跟随符号链接：`pets/<id>` 被手工换成指向店外的 symlink 目录时，
资产路由会按 id 伺服商店根之外的内容（listPets 因 readdir dirent 天然不收录 symlink，但直接
按 id 寻址可绕过清单）。复审修正为统一 lstat 口径（与 `statRel` 的 MAM issue #32-5「symlink
视为不存在」一致）：`isRealPetDir()`（scan.js，scanPet/petDirOf/activate 共用）+ `sendFile`
lstat 拒绝 symlink 叶子（覆盖单个 voice/sheet 文件被链出的形态）。守卫链路随之收敛：
symlink 目录 → scanPet 抛 pet-not-found → checkPet 归为 fatal pet-dir-missing（不可修复，
只能换回/隐藏）。测试：routes「symlink 不逃逸」×2、staging「scanPet 对 symlink 目录」、
guard「checkPet symlink → fatal pet-dir-missing」。合法资产伺服不受影响（routes 同用例内
断言真实文件仍 200）。

### D24. 多标签页竞态机制（边界自查项；**未自动化**，实机验证见 QA §1.7）
两个 WebUI 标签同时打开时的并发面与收敛机制，逐通道说明：

| 通道 | 竞态形态 | 机制与收敛 |
|---|---|---|
| `/state` 轮询（每标签独立 1.5s） | 只读 GET，无写路径 | 幂等；标签间互不感知，快照由宿主单点计算，天然一致 |
| 管理操作（rename/delete/voice 增删/finalize/manifest-update） | 两标签同时对同一宠物写入 | 宿主 Node 单线程事件循环 + handler 内**同步 fs 调用**（renameSync/writeManifest tmp+rename 原子写）→ 操作天然互斥串行；先者胜，后者得可读错误（rename 撞 `pet-exists`/`pet-not-found`；uniqueDest 保证语音添加永不覆盖）；原子写保证任何读者不会看到半份 manifest |
| 配置（scale/activePetId/动作绑定） | 两标签同时改配置 | settings scope 在场：宿主 settings 服务为唯一事实源，写入串行化，onChange 广播 → 双标签下轮轮询收敛；scope 缺席（降级）：localStorage 同源共享，last-write-wins，1.5s 轮询窗口内收敛 |
| 位置记忆（POS_KEY） | 两标签同时拖拽 | localStorage last-write-wins；下次加载以最后保存者为准（MAM 单窗口无此面，WebUI 多标签属插件特有，接受最终一致） |
| 激活切换 + 守卫 | A 标签切到损坏宠物、B 标签同时在编辑 | guard 问题随 `/state` 快照下发到**每个**标签；弹框互不抑制（各自 localStorage 忽略签名共享 → 一个标签忽略后另一标签同签名不再弹）；闪切保护标记（FLASH_SWITCHED_KEY）同源共享，恢复以标记为准 |
| 竞态窗口上界 | — | 1.5s（轮询周期）；无锁、无版本号乐观并发——宿主串行 fs + 原子写 + 幂等读已保证不产生半成品状态，只有「谁最后写谁生效」 |

未自动化原因：需双浏览器实例 + 真实 webServer 的集成环境，超出「vitest 覆盖纯逻辑」的任务
口径；机制面已由单测覆盖其构件（原子写/uniqueDest/rename 冲突零副作用/守卫签名幂等，见 §6）。

---

## 2. 新旧行为对照证据（兼容不破坏）

| 面 | v1.3.0 | v2.0.0 | 证据 |
|---|---|---|---|
| 状态判定逻辑 | events 数组扫描 | snapshotEvents() 同逻辑 | test/state.test.mjs 19 用例（优先级/已读消失/断联/完成队列/排序逐条锁 v1 语义） |
| /state /ack /client-diag | 既有语义 | 不变 + 扩展字段 | test/routes.test.mjs「/state /ack /client-diag」组（v1 字段全在、diag.clientVisible 记录、ack 幂等） |
| 设置注册 | installSettingsSection | ctx.settings.installSection | src/host/index.js B2 段；validate 锁 `installSection(ctx, FOXBELL_PET_NS`；旧 API 零残留 grep（validate §5 四文件面扫描） |
| client inject | 4 包（含已删 runtime） | []（全种子） | package.json；validate §7（require 面 ⊆ 种子∪inject，无死边） |
| 旧配置加载 | 7 字段 | +scale +activePetId 默认补齐 | test/client-logic.test.ts「config (旧配置兼容)」；宿主 Config default（schemastery） |
| 侧栏 🦊 开关 | localStorage dyn-pet-foxbell-visible | 同键同语义 | src/client/PetToggle.tsx + store.petStore（键名未变）；QA 清单 §2 |
| TUI 降级 | inject 硬依赖 webServer | 同款 inject 数组 | src/host/index.js `export const inject`（与 v1 逐项相同） |
| 位置记忆 | x-only 键 | {x,y} 新键 + 旧键读写兼容 | src/client/config.ts loadPosition（旧键兜底 y=地面）|
| 素材伺服 | /spritesheet.webp + /voice/<i> | /pets/<id>/…（统一族） | routes.js prefix 派发；v1 路由为素材面非任务保护面（任务只锁 /state /ack /client-diag） |

## 3. MAM 对齐索引表（任务目标 3：行为面 → MAM 源文件 → 本仓库实现 → 证据）

| 行为面 | MAM 源文件（a77bb21） | 本仓库实现位置 | 证据（测试名/对照说明） |
|---|---|---|---|
| 动画帧表/look 布局/frameStyle | src/components/pet/petAnimations.ts | src/client/animations.ts | client-logic「animations (MAM petAnimations 同表)」3 用例（帧表逐值断言） |
| 动画优先级链/瞬时代数计数/look 调度 6s+250ms×16 | src/components/pet/FoxbellPet.tsx L80-152, L376-433 | src/client/Pet.tsx（stateRef/applyAnim/refreshAnim/playTransient/scheduleNextLook） | 对照说明：applyAnim 同款「非 look 抢占即 stopLook」；代数计数 genRef 同款；v1 图集静默续期同款（rowsRef!==11） |
| 拖拽方向阈值/采样窗 150ms | FoxbellPet.tsx L452-464 + usePetWindow.ts L315-327 | src/client/physics.ts pushSample/dragDirection + Pet.tsx onPointerMove | client-logic「physics」sampling window / dragDirection 阈值用例 |
| 投掷惯性/重力积分/静止判定 | usePetWindow.ts L7-9, L52-65, L330-380 | src/client/physics.ts GRAVITY/DAMP/MIN_VX/stepFall/throwVelocity | client-logic「physics」constants match MAM / stepFall 积分与 rest / dt 上限 / throwVelocity 差分用例 |
| 落地压扁回弹时序 | FoxbellPet.tsx L473-488 | src/client/physics.ts SQUASH_TIMING + Pet.tsx squashAnim | client-logic SQUASH_TIMING 逐值断言（60/0.55/240/贝塞尔/260/1500） |
| 位置记忆/边界钳制 | usePetWindow.ts L35-46, L163-179 + petConfig.ts L120-137 | src/client/config.ts loadPosition/savePosition + physics.ts clampPos/viewportBounds | client-logic clampPos 用例；对照：DOM 视口=workArea（D10） |
| 单击挥手/双击语音 | FoxbellPet.tsx L466-496 | src/client/Pet.tsx onPointerUp/onDoubleClick | 对照说明：TRANSIENT_WAVE_MS=1700 同值；怪癖偏离记录于 D10 |
| 语音闸门链（可见→动作→hasVoice→pick→字幕→muted） | FoxbellPet.tsx L210-238 | src/client/Pet.tsx playVoice | 对照说明：六步闸门顺序逐行同构 |
| 组内随机不重复/字幕时长公式/预载播放/unlock | src/components/pet/petVoices.ts | src/client/voices.ts | client-logic「voices」pickIndex/subtitleMs 用例（max(2500,d+250) 同式） |
| approval 语音 10s 限流 | FoxbellPet.tsx L304, L332-335 | src/client/Pet.tsx APPROVAL_THROTTLE_MS + 差分 | 对照说明：10_000ms 同值、差分触发同款 |
| 卡片色彩语义/排序/截断/MAX_CARDS | src/components/pet/petStatus.ts + FoxbellPet.tsx L632-746 | src/client/statuscards.ts + Pet.tsx 卡片渲染 | client-logic「statuscards (MAM 色彩口径)」lightOf/DOT_COLOR 逐色断言 + taskPose + truncate |
| 任务姿态 waiting>running、全绿回落 | FoxbellPet.tsx L337-343 | src/client/statuscards.ts taskPoseOf | client-logic taskPose 用例 |
| 绿卡点击即确认（本地立即消卡） | petStatus.ts ackDone + FoxbellPet.tsx L347-374 | src/client/Pet.tsx onProjectClick + localAcked | 对照说明：本地 Set 消卡 + /ack 双写（MAM ackDone+mark_session_read 等价） |
| 右键菜单结构/开关门控/动作子页预览 | src/components/pet/PetMenu.tsx | src/client/PetMenu.tsx | 对照说明：门控 opacity .5+not-allowed+tooltip 同款；预览 1600/1700ms 同参数；差异=D11（四场景/切换宠物/无置顶） |
| 三档缩放 0.75/1/1.25 | petConfig.ts PET_SCALES + FoxbellPet px() | src/client/config.ts CFG_SCALES + Pet.tsx px() | client-logic CFG_SCALES/sanitize 用例 |
| manifest v2 结构/原子写/.bak/is_voice_rel | src-tauri/src/services/pet/manifest.rs | src/host/manifest.js | petid-manifest「parseManifest/writeManifest」13 用例（.bak 单份/无 .tmp 残留/损坏回 null） |
| id 校验规则表（拒绝顺序/22 设备名/64 上限/foxbell 保留） | services/pet/mod.rs validate_pet_id + petValidation.ts petNameProblem | src/host/petid.js + src/client/validation.ts | petid-manifest「validatePetId」12+ 用例（MAM P0-1 码级断言逐条移植）+ client-logic petNameProblem 顺序用例 |
| 扫描/清单/codex 清单/启动清扫/改名/删除 | services/pet/scan.rs + mod.rs | src/host/scan.js | staging「scanPet/listPets/sweepStaging/renamePet/deletePet」用例（三段规则/隐藏目录跳过/rename 零副作用/清扫不触宠物目录逐条同 MAM 测试） |
| 暂存管线（folder/zip/codex/音频增删/finalize/cancel） | services/pet/import.rs | src/host/staging.js | staging.test.mjs 30 用例（真实临时目录：一层定位/回滚/去重序号/占位跳过/finalize 原子落地/暂存腾空） |
| zip 三重上限/按实际字节/半截清理 | import.rs safe_unzip_with_limit | src/host/zip.js | zip.test.mjs 10 用例（../与绝对路径条目拒绝、10B 上限按实际字节拒且无残留、200 文件数、fmt_limit） |
| Petdex allowlist/slug/双形态/封顶/重定向/临时名 | services/pet/petdex.rs | src/host/petdex.js | petdex.test.mjs 20+ 用例（mock fetch：lookalike 域拒绝、http 降级拒、逐跳重定向、too-many、content-length 预检、slug 注入拒绝、端到端暂存） |
| 守卫 diff 六 kind/修复计划/ignore 判定 | petValidation.ts diffManifestVsScan + petActivation.ts repairManifest + PetStartupGuard.tsx | src/host/guard.js + src/client/dialogs/GuardDialog.tsx | guard.test.mjs 13 用例（三场景：图集被删 fatal/语音变动 plan/清单缺失全量重建 + keepVoices 信任缓存 + capOnDisk 保守判定） |
| 激活流程（快路径/直投首建/mismatch 三选） | petActivation.ts activatePet | src/host/routes.js /api/activate + src/client/dialogs/SwitchDialog.tsx | routes.test.mjs「激活守卫」用例（三态 + manifest-update 复核 + .bak） |
| 闪切保护 | PetManageDialog.tsx ensureNotActive/restoreFlashSwitched | src/client/dialogs/ManageDialog.tsx | 对照说明：标记键持久化/成功失败关闭三出口/MAM P1-4 回环修复同款 |
| 导入向导三步/预填/代数守护探测/执行禁用条件 | manage/PetImportDialog.tsx | src/client/dialogs/ImportDialog.tsx | 对照说明：probeGen 代数守护、nameOk&&rows&&!busy 禁用、valid 行过滤同构；差异=上传形态（D12） |
| 语音分组编辑/覆盖汇总/>30MB 警示/重试探测 | manage/VoiceGroupEditor.tsx + useVoiceDurationProbe.ts | src/client/dialogs/VoiceGroupEditor.tsx + probe.ts | 对照说明：500ms×2 重试/8s 超时/并行探测同参数；coverage 文案同键 |
| 错误码表/分流/白名单收敛 | petErrors.ts + services/pet/error.rs | src/client/errors.ts + api.ts petErrMsg + src/host/errors.js | client-logic「petErrMsg 分流」4 用例 + validate §10 三方一致锁 |
| 无语音/无字幕降级 | FoxbellPet L210-238 + PetMenu 门控 + petRuntime 最低档 | Pet.tsx playVoice + PetMenu + store.ts runtime | 对照说明：D15 全表逐项 |

**行级抽查对证（6 点全对上；抽查方法=两侧 grep 行号并排）**：

| 行为点 | MAM 源:行 | 本仓库:行 | 测试名 |
|---|---|---|---|
| 动画帧表 idle 行 | petAnimations.ts:21 | src/client/animations.ts:22 | client-logic「frame table matches MAM exactly」 |
| 物理常数 GRAVITY/DAMP/MIN_VX | usePetWindow.ts:7-9 | src/client/physics.ts:6-8 | client-logic「constants match MAM」 |
| zip 三重上限常数 | services/pet/import.rs:8-9 | src/host/zip.js:11-12 | zip「public caps are MAM-identical」 |
| 动画优先级 ?? 链（逐字同串） | FoxbellPet.tsx:138 | src/client/Pet.tsx:136 | 对照说明（组件内状态机）+ QA §2.3/2.8 |
| 投掷采样窗 150ms/阻尼应用 | usePetWindow.ts:319/342/60 | physics.ts:19/throwVelocity/59 | client-logic「sampling window keeps only last 150ms」「throwVelocity = window delta / dt」「stepFall integrates gravity, damps vx…」 |
| 审批语音 10s 限流 | FoxbellPet.tsx:304/332-333 | Pet.tsx:29/217/248-249 | 对照说明（同值同 ref 窗口结构）+ QA §3.1 |

## 4. 宿主/客户端职责划分

```
宿主半 (src/host, Node)                      客户端半 (src/client, 浏览器 TSX)
├─ index.js   apply/settings(B2)/素材/快照    ├─ index.tsx   槽位注册/防御式接线
├─ state.js   状态聚合(B1, 纯逻辑)            ├─ Pet.tsx     本体(动画/物理/卡片/菜单/守卫触发)
├─ routes.js  路由族(/state…/api/*)          ├─ PetMenu.tsx 右键菜单(预览/切换宠物子菜单)
├─ petid.js   id 校验(权威)                   ├─ SettingsCard.tsx 单卡双分区
├─ manifest.js 清单 v2(原子写/.bak)           ├─ store.ts    轮询 1.5s/热切换/VoicePlayer 挂载
├─ scan.js    扫描/清单/清扫/改名/删除        ├─ config.ts   双后端配置/位置/闪切/忽略签名
├─ staging.js 暂存管线(四来源汇聚)            ├─ animations.ts / physics.ts / voices.ts / statuscards.ts
├─ zip.js     安全解压(yauzl)                 ├─ validation.ts (镜像校验+diff)
├─ petdex.js  代理(allowlist/封顶/重定向)     ├─ api.ts + errors.ts + i18n.ts (错误码字典 zh/en)
└─ guard.js   守卫 diff/修复计划              └─ dialogs/ (Import/Manage/Switch/Guard/Host/probe)
```

## 5. validate.mjs 扩展清单（既有检查全保留 + 新增）

既有（适配双树布局）：文件存在+语法（node --check）、JSON 合法性、禁用词「玲娜」、素材存在、
四语音组非空、设置命名空间三处配对、配置字段存在（doneAction/dblAction/approvalAction/
errorAction/gravity + 新增 scale/activePetId）、dyn-pet-menu 样式、settings.plugin.item 槽、
attachScope 接线、六动作键在产物、About 版本串与 package.json 一致、src↔lib 同步契约
（stamp 机制，D4）。
新增：产物纯度（`^\s*(import|export)\b` 零命中）、dsh.client 声明↔bundle require 面一致
（种子表内嵌）、路由前缀统一（ROUTE_PREFIX 模板强制）、CHANGELOG 版本条目、旧 API 零残留
（installSettingsSection/settingsNamespace/session.events/client-runtime 四面 grep）、
错误码表三方一致（§10）、内置清单 v2↔磁盘素材一致（§11：31 条大小/时长区间/组计数）。

## 6. 测试矩阵（vitest，9 文件 242 用例，全绿；含边界加固 +32、验收补链 +1）

| 文件 | 覆盖 |
|---|---|
| test/state.test.mjs | B1 readEvents/scanSession/derive/引擎（v1 判定语义 19 用例） |
| test/petid-manifest.test.mjs | id 规则码级断言（MAM P0-1 移植）/清单 v2 解析/原子写/.bak；**加固：Windows 保留名全表 22 项 × 大小写/交错变体 + 表外近邻放行** |
| test/staging.test.mjs | 暂存管线全链路（**真实临时目录实操，不 mock 文件系统**）/去重/清扫/rename/delete；**加固：symlink 目录口径 + rename 父目录只读中途失败零副作用** |
| test/zip.test.mjs | zip 三重上限/穿越条目（自建恶意 zip——正规 writer 会规范化，安全测试需真恶意形态）；**加固：UTF-8 中文条目名保真 + `..\ `反斜杠穿越变体拒绝** |
| test/petdex.test.mjs | **Petdex mock**（注入 fetchImpl）：allowlist/双形态/封顶/重定向/端到端暂存；**加固：userinfo 伪装/端口后缀/子域后缀陷阱** |
| test/guard.test.mjs | 守卫三场景（图集被删/语音变动/清单缺失）+ 修复计划 + ignore 判定；**加固：checkPet symlink → fatal** |
| test/routes.test.mjs | 路由族集成（假 webServer/ctx 驱动 handler）：快照形状/资产伺服/导入闭环/安全拒绝/Origin/petdex 代理 mock；**加固：symlink 不逃逸 ×2 + 空商店首启三态 ×3；验收：无 webServer 降级（effect 反证钩子，零注册）** |
| test/client-logic.test.ts | 客户端纯逻辑：动画表/物理/语音/校验/色彩/配置兼容/i18n 完整性/petErrMsg 分流；**加固：旧配置迁移完整回环 + 损坏存档收敛** |
| test/store-hotswap.test.ts | **新增**：浏览器侧热切换键控 `${id}#${rev}`/resolveRows 9/11 行自适应（快路径+Image 探测+onerror 兜底）/后到者胜守护/无语音能力标志/fetch 故障静默/?pet= 降级提示（localStorage/Audio/Image/fetch 最小桩，不 mock 文件系统） |

## 7. 工程过程

- 分支 `feature/v2.0.0-mam-pet-system`，语义化小步提交（见 git log）。
- `npm run build` / `npm run validate` / `npx vitest run` / `npm run typecheck` 全绿（交付时输出见任务汇报）。
- 两参考仓库只读纪律：全程未写入（交付前 `git status --porcelain` 复核为空）。
- `dsh.plugin.json` 与 `cordis.patch.yml` 保持不动（任务禁令；dsh.plugin.json 内 version
  字段停留 1.3.0——rc.1 实测不读取该文件（插件清单=package.json dsh 键），故不构成运行时
  不一致；validate 的版本一致性断言不纳入该冻结文件）。

## 8. 假设记录（任务禁止等待人工指导，遇歧义自行合理假设）

| # | 歧义 | 假设 | 依据 |
|---|---|---|---|
| A1 | 「清单 v2 格式」vs MAM SCHEMA_VERSION=1 | schemaVersion 写 2 读 [1,2] | D6 |
| A2 | 本地文件夹来源在浏览器无路径 | webkitdirectory 上传 + 宿主同管线 | D12 |
| A3 | Petdex 超时任务书 8s vs MAM 30/120s | 统一 8s（任务书优先） | D12 |
| A4 | MAM「回收站」在 Web 无 OS 语义 | 插件私有 .trash 目录 | D13 |
| A5 | MAM 拖拽松手也挥手的怪癖 | 按 spec 意图实现真实 moved 判定 | D10 |
| A6 | 错误码「约 48 码」 | MAM 49 − reveal-failed + 2 新增 = 50 | D16 |
| A7 | reveal（打开文件夹）OS 能力 | 改为展示+复制路径 | D13 |
| A8 | dsh.plugin.json version 冻结 1.3.0 | 不参与版本一致性断言 | §7 |

## 9. master（0.1.3-alpha.1）前向风险评估（静态 diff；实机冒烟步骤见 docs/QA-CHECKLIST.md）

基于 harness 仓库 `git diff dsh-v0.1.2-rc.1..master` 的导出面核查：

| 依赖面 | 判定 | 说明 |
|---|---|---|
| session.snapshotEvents() | 🟢 无变化 | rc.1/master 签名逐字相同 |
| 会话事件词汇表 | 🟡 中风险 | master 删除 `assistant/chunk`（改 `agent/assistant-stream`）、`assistant/message` 新增必填 `stream` 字段、SESSION_FORMAT_VERSION 0→2。**本插件不消费 chunk/assistant 流式字段**（只读 turn/approval/message 文本），当前用到的事件类型均在 master 存活；`assistant/message.data.message.content` 形状未变 → 预计无感。若未来消费打字机流，需按 master 适配层隔离 |
| settings（installSection/settingsScope/settings.plugin.item） | 🟢 无变化 | packages/settings 与 client/ui-settings* 四包 rc.1→master 除版本号外零 diff |
| dsh.client.inject / __ModuleLoader__ | 🟢 语义无变化 | packages/client/modules src 零 diff |
| webServer.register | 🟢 无变化 | packages/host/webserver src 零 diff |
| slots 三槽（shell.overlay/sidebar.footer.action/settings.plugin.item） | 🟢 无变化 | 声明/渲染处两侧一致（本插件未占用 owner props 有变的 conversation.* 槽） |
| ui-primitives | 🟢（未使用） | 客户端零依赖该包（D3），MessageText 删除等变化不波及 |
| turn/end reason | 🟢 容忍 | derive 只判 error/interrupted + 未知 kind 走非错误分支（前向容忍未知 kind） |
| 版本对齐 | 🟡 注意 | master CI 要求 workspace 内 @deepseek-ai/* 依赖版本统一——若在 0.1.3 环境安装，本插件 dsh-settings ^0.1.2-rc.1 的 peer（cordis ^4.0.2 等）与 master 组合兼容（rc.1 的 settings 包在 master 零 diff，仅版本号变化）；实机以 pnpm 解析为准 |

结论：**无需为 master 预先改码**；唯一实质破坏面（assistant/chunk 删除）不在本插件消费集内。

## 10. 已知限制

- L1：Petdex 8s 超时对慢网络大 zip（>10MB）可能失败（A3；重试即可，暂存无残留）。
- L2：文件夹来源经 base64 JSON 上传，内存峰值 ≈ 素材体积 ×1.37；素材 >70MB 时建议用 zip 来源（流式落盘）。
- L3：守卫 diff 为 stat 级（大小比对），同大小内容替换不报 changed（MAM 同款限制，其 spec §6-3 明示不解码媒体）。
- L4：语音时长探测依赖浏览器解码能力（opus/flac 在 Safari 可能 no-duration → 行徽标可点击重探，MAM 同款降级）。
- L5：私有路由对本机其它进程无鉴权（D17 残余风险；与 harness 自身插件资产路由同水位）。
- L6：内置 foxbell 语音组固定四组 31 条，随包发布不可编辑（任务非目标：不做语音内容生产）。
- L7：`dsh.plugin.json` 冻结（任务禁令），其 version 字段停留 1.3.0（rc.1 不读取该文件，无运行时影响，A8）。
- L8：跨浏览器多标签同时打开 WebUI 时，位置/配置经 localStorage 各标签独立读取（无 storage 事件跨标签同步——MAM 有多窗口同步，本插件单页 WebUI 场景收益低，未移植；配置面由 settings scope 服务端收敛）。多标签管理操作竞态的完整机制说明见 **D24**（宿主单线程同步 fs + 原子写 + 幂等读 → 无半成品状态，last-write-wins，1.5s 收敛；未自动化，QA §1.7 实机核对）。
- L9：复审修复了宠物目录/文件 symlink 跟随缺陷（初版 existsSync/statSync 口径），现统一 lstat 不跟随——见 **D23**。手工在商店内放 symlink 的宠物一律按不存在处理（清单不收录、资产不伺服、激活 fatal）。

## 11. 人工实机 QA 清单

见 `docs/QA-CHECKLIST.md`（rc.1 WebUI 安装、宠物全交互、四来源导入、热切换、守卫、缩放、TUI 降级逐项步骤与预期）。

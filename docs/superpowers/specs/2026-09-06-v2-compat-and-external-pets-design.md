# dsh-foxbell-pet v2.0.0 需求说明书（dsh 兼容升级 + MAM 外部宠物体系移植）

- 日期：2026-09-06
- 状态：待用户审阅（brainstorming 两轮 8 问 + 架构方案已对齐）
- 目标版本：v2.0.0
- 验收基线：deepseek-harness `dsh-v0.1.2-rc.1`（web profile）；并对 master（`dsh-v0.1.3-alpha.1`）做前向冒烟
- 素材来源：MultiAgents-Manager v0.3.0（以下简称 MAM）宠物模块（约 1.07 万行，含测试与 i18n）

## 1. 仓库角色与版本基线（执行 Agent 必读）

| 仓库 | 本地路径 | 基线 commit | 角色 |
|---|---|---|---|
| **dsh-foxbell-pet** | `/Users/jarvis/Documents/DeepSeek/DeepSeek-plugins/dsh-foxbell-pet` | main @ `e2b8ebe`（含本 spec） | **唯一修改对象**：全部新代码、构建脚本、文档改动只落此仓库 |
| MultiAgents-Manager | `/Users/jarvis/Documents/MultiAgents-Manager` | main @ `a77bb2172af7b75370c43644e84a9b8fe36e4a1d`（= origin/main，v0.3.0） | **只读移植源**：第 6 章映射表所有源文件以此基线为准，禁止修改该仓库 |
| deepseek-harness | `/Users/jarvis/Documents/DeepSeek/deepseek-harness` | 验收基线：tag `dsh-v0.1.2-rc.1` = `a66e4702047846cdaa10c66c9d3df3951f5ea70d`；前向冒烟：master @ `d347e703908d0406b7a7ef80e3a0e594d86b2215`（dsh-v0.1.3-alpha.1） | **只读协议参考**：宿主 API 契约以 rc.1 tag 内源码为唯一依据（附录 A） |

执行约定：

- 本地路径为当前机器布局；执行环境不同则按 GitHub remote 定位：`jarvislee90s-dot/dsh-foxbell-pet`、`jarvislee90s-dot/MultiAgents-Manager`、`deepseek-ai/deepseek-harness`。
- 协议存疑时在 harness 仓库按 tag 查证：`git -C <harness仓库> grep -n "<标识符>" dsh-v0.1.2-rc.1 -- 'packages/**'`。
- 前向差异对照（FR-4 冒烟前先做静态 diff）：`git -C <harness仓库> diff a66e470..d347e70 -- <相关包路径>`。
- MAM 源文件引用一律相对其仓库根（如 `src/components/pet/FoxbellPet.tsx`、`src-tauri/src/services/pet/import.rs`），且以基线 commit 内容为准，不追新。

## 2. 背景与已对齐的决策

dsh-foxbell-pet 是 DeepSeek harness（dsh）的桌宠插件，当前 v1.3.0 面向早期 dsh（rc.7/rc.8 时代）开发。harness 上游已演进到 `dsh-v0.1.2-rc.1`，存在兼容性破坏；同时 MAM（通用 harness 管理工具）中的宠物功能已更完善，需将其外部宠物体系移植回本插件。

本次已与用户对齐的关键决策：

| # | 决策 |
|---|---|
| D1 | MAM 仓库不动，两边保留独立实现（单向复制，无共享包/同步机制） |
| D2 | 宠物代码以 MAM 版本为基准；插件旧代码只保留壳与加载层 |
| D3 | 兼容验收目标为最新稳定/RC 版 `dsh-v0.1.2-rc.1`，顺带对 master 做前向检查 |
| D4 | 只升级插件本体；`dsh.plugin.json` 保持不动；不引入 OS 级通知/跳转/事件监听（桌宠只存在于 dsh WebUI 内；现有 WebUI 内状态卡片与点击跳会话保留） |
| D5 | 移植范围：全量外部宠物体系 + Petdex 在线仓库导入 |
| D6 | 引入构建步骤（esbuild），移植代码保留 TSX 形态 |
| D7 | 外部宠物存放于插件专属目录（不复用 MAM 的 `~/.mam/pets`） |
| D8 | 管理入口 = 设置页插件卡片内分区 + 右键菜单快捷切换 |
| D9 | 整体架构 = 胖宿主 + 薄客户端：磁盘/网络操作全在宿主半，客户端纯渲染，通信走插件私有 HTTP 路由 |

## 3. 目标与非目标

### 3.1 目标

1. 插件在 `dsh-v0.1.2-rc.1` 上完整可用（当前 3 处接口破坏导致状态数据、设置卡、客户端挂载三方面失效或部分失效）。
2. 以 MAM 为基准移植全量外部宠物体系：多宠物磁盘商店、四来源导入（本地文件夹 / zip / Codex 宠物目录 / Petdex 在线）、导入配置向导、管理（改名/语音编辑/删除）、切换与热切换、完整性守卫。
3. 宠物本体（动画、交互、语音、物理、菜单、状态卡片）与 MAM 行为对齐，并保留插件特有的多项目状态聚合能力（错误/断联检测）。
4. 仓库升级为 TSX + esbuild 构建形态，产物仍为无外部依赖的单文件客户端 bundle。

### 3.2 非目标

- 不修改 MAM 仓库任何代码。
- 不移植 MAM 的 OS 级能力：系统通知接管/抑制、托盘、窗口置顶、跨应用跳转（AppleScript/HWND/deep-link）、Tauri 窗口几何。
- 不集成 harness locale service（界面文案用插件内部 zh/en 字典）。
- 不做多用户/多 profile 隔离的宠物商店（宠物目录按 D7 固定于插件专属目录）。
- 不做 MAM 与插件之间的宠物目录互通配置（将来可作为独立需求）。
- 语音克隆/新增语音内容生产不在本次范围（沿用现有 31 条 foxbell 语音与外部宠物自带语音）。

## 4. 现状与差距

### 4.1 兼容性差距（对 `dsh-v0.1.2-rc.1`，已逐项代码验证）

| # | 插件 v1.3.0 用法 | rc.1 现状 | 用户可见后果 |
|---|---|---|---|
| B1 | 读会话对象的 `session.events` 数组属性聚合状态 | Session 改为 `snapshotEvents()` 方法 | 宠物能显示，但**状态卡片永远无数据**（静默失效，最危险） |
| B2 | `installSettingsSection(ctx, ns, Config, entry, hooks)` 辅助函数（dsh-settings 0.1.0-rc.8） | 变为 `ctx.settings.installSection(owner, ns, schema, entry, hooks)` 服务方法；dsh-settings 已到 0.1.2-rc.1 | 设置卡片不出现在设置页 |
| B3 | `dsh.client.inject` 声明含 `@deepseek-ai/dsh-client-runtime` | 该包已删除（职责并入 `dsh-client-store` 等平台种子模块）；`inject` 语义变为包级依赖边 | 客户端半可能无法挂载（宠物整体不出现） |

已验证**存活**、无需改造的依赖面（证据见附录 A）：`webServer.register`（exact 路由 + disposer）、`fs.resolve/readBytes/listDir`、`agents.roots()`、`sessions.get()`、`sessionTitle.get()`、槽位 `shell.overlay` / `sidebar.footer.action` / `settings.plugin.item`、`window.__ModuleLoader__.load` 加载契约、客户端 `sessions.open()`、`settingsScope.bind()`、`require('react')`（react 已入平台种子表）、`@deepseek-ai/dsh-client-ui-slots`、`dsh-client-locale`、`dsh-api-gateway`、`dsh-client-store` 包均存在。

### 4.2 功能差距（MAM 宠物 × 插件 v1.3.0）

| MAM 能力 | 插件现状 | 结论 |
|---|---|---|
| 精灵渲染/动画状态机/物理/菜单/语音/字幕/状态卡片 | 已有近似实现（同源独立演化） | 以 MAM 为准覆盖（FR-5/6） |
| 外部宠物体系（商店/导入/管理/切换/守卫） | 完全没有 | 本次移植主体（FR-10~18） |
| 宠物清单 v2 格式（多宠物元数据） | 固定单宠物 assets/pet.json | 移植（FR-8） |
| 三档缩放 | 无 | 移植（FR-7） |
| 无语音宠物支持 | 无（语音为必备） | 移植（FR-9） |
| Petdex 在线仓库导入 | 无 | 移植（FR-14） |
| 置顶/托盘/窗口几何/通知接管 | 无且 WebUI 内不适用 | 不移植 |

## 5. 功能需求清单

> 每条需求含「做什么 / 改造前 / 改造后」。FR 编号供计划文档与验收引用。

### A 组：兼容性修复

**FR-1 会话事件数据源迁移（修 B1）**
- 做什么：宿主半状态聚合的数据源从 `session.events` 属性改为 `session.snapshotEvents()` 调用，聚合逻辑（审批/运行/完成/错误判定）本身不变。
- 改造前：在 rc.1 上事件列表恒为空，宠物静默失去全部项目状态。
- 改造后：rc.1 上状态卡片数据与 v1.3.0 在旧版 dsh 上的行为一致。

**FR-2 设置卡注册方式迁移（修 B2）**
- 做什么：设置节注册从导入辅助函数改为 `ctx.settings` 服务方法调用；依赖提升至 `@deepseek-ai/dsh-settings ^0.1.2-rc.1`。
- 改造前：rc.1 上设置卡不出现在设置页，用户只能靠右键菜单改配置（部分配置项无入口）。
- 改造后：设置卡恢复显示，配置经 settings 体系持久化，热更新生效。

**FR-3 客户端声明修正（修 B3）**
- 做什么：`package.json` 的 `dsh.client` 声明移除已消亡的 `@deepseek-ai/dsh-client-runtime`，按客户端最终实际依赖重列 inject/external。
- 改造前：rc.1 上 boot graph 引用不存在的包，客户端半挂载不可靠（宠物可能整体不出现）。
- 改造后：客户端半在 rc.1 稳定挂载；声明与实际依赖一一对应（validate 校验，见 FR-28）。

**FR-4 最低版本基线与前向冒烟**
- 做什么：README/CHANGELOG 兼容表更新为「dsh ≥ 0.1.2-rc.1」；发布前在 master（0.1.3-alpha.1）跑一遍 QA 冒烟并记录结果（附录 C 留空待填）。
- 改造前：文档声称 rc.7+，与真实兼容性不符。
- 改造后：版本要求如实；对下一版本的风险有书面评估。

### B 组：宠物本体升级（以 MAM 为基准）

**FR-5 宠物本体行为对齐 MAM**
- 做什么：客户端半宠物本体按 MAM 实现重写移植：动画优先级模型（拖拽 > 瞬时动作 > 任务态 > 环视 > 待机）、拖拽方向动画、投掷惯性（150ms 采样、阻尼 0.86）、重力下落（1400 px/s²）与落地压扁回弹、单击挥手、双击语音+可配置动作、环视动画、右键菜单结构（音效/字幕/物理开关、四类动作绑定子菜单带实时预览、隐藏、关于）。Tauri 窗口几何部分改写为 WebUI 内 DOM 定位（工作区 = 浏览器视口，位置记忆、边界钳制保留）。
- 改造前：v1.3.0 自有实现，行为细节与 MAM 存在漂移（如菜单结构、物理参数细节）。
- 改造后：宠物观感与交互手感与 MAM 一致；后续两边各自独立演进。

**FR-6 状态卡片色彩语义对齐 MAM（用户可见变化，需在 CHANGELOG 显著标注）**
- 做什么：卡片色彩语义改为 MAM 口径：**红 = 等待审批，黄 = 运行中，绿 = 完成且未读**；插件特有的错误/断联状态以深红 + 错误标识呈现，与「等待审批」明确区分；卡片点击行为不变（跳转会话 + 已读）。审批语音 10 秒限流、绿色卡片点击即确认等 MAM 规则一并采纳。
- 改造前：绿 = 运行、黄 = 审批、红 = 错误/断联、蓝 = 完成。
- 改造后：与 MAM 一致的三色 + 插件扩展的错误态；已同时使用两个工具的用户心智统一。

**FR-7 三档缩放**
- 做什么：新增宠物缩放配置（小 0.75 / 中 1.0 / 大 1.25），入口在右键菜单与设置卡，作用于精灵、卡片、菜单整体。
- 改造前：固定尺寸。
- 改造后：三档即时切换，持久化。

**FR-8 宠物清单 v2 格式**
- 做什么：统一采用 MAM 清单格式：`schemaVersion`、`id`、`displayName`、`description`、`source`（codex/petdex/folder/zip）、`spriteVersionNumber`（1=9 行图集 / 2=11 行图集，运行时自适应）、`spritesheetSizeBytes`、`hasVoice`、`hasSubtitle`、`voices[]`（group/name/file/sizeBytes/durationMs）。内置 foxbell 的包内清单同步升级为 v2（id=foxbell 为保留字）。
- 改造前：仅包内固定 `assets/pet.json`（index/group/name/file 四字段）。
- 改造后：内置与外部宠物同一元数据模型；图集 9/11 行自动识别。

**FR-9 无语音/无字幕宠物支持**
- 做什么：`hasVoice=false` 的宠物：音效开关禁用（带提示）、任务完成只播动画不出声；`hasSubtitle=false`：不显示字幕气泡。
- 改造前：所有宠物必须有完整 4 组语音，否则功能异常。
- 改造后：纯图集宠物可正常导入使用。

### C 组：外部宠物商店与导入

**FR-10 插件专属磁盘商店**
- 做什么：外部宠物存放 `~/.dsh/foxbell-pet/pets/<id>/`（`spritesheet.webp` + `manifest.json` + `voice/<group>/<file>`）；导入暂存区 `.import-staging/`；插件启动时清扫暂存区残留（崩溃自愈）；manifest 写入为原子写 + 一层 `.bak` 备份。
- 改造前：无外部宠物概念，仅包内 assets。
- 改造后：多宠物可安装、可管理、可持久切换。

**FR-11 导入：本地文件夹**
- 做什么：选择本地目录 → 复制入暂存区 → 扫描（图集探测、语音按 `voice/<group>/<file>` 三段规则识别、时长探测）→ 进入配置向导（FR-15）→ 落位商店。
- 改造前：不可用。
- 改造后：本地文件夹宠物一键导入。

**FR-12 导入：zip 包**
- 做什么：选择 zip → 宿主侧安全解压到暂存区（总量 ≤100MB、文件数 ≤200、条目路径防穿越）→ 同 FR-11 后续流程。
- 改造前：不可用。
- 改造后：zip 宠物可导入；恶意/超大压缩包被拒绝并提示原因。

**FR-13 导入：Codex 宠物目录**
- 做什么：列出 `~/.codex/pets/` 下的宠物（读取其 pet.json 元数据）→ 选中复制入暂存区 → 同 FR-11 后续流程。
- 改造前：不可用。
- 改造后：Codex 生态宠物可直接复用。

**FR-14 导入：Petdex 在线仓库**
- 做什么：设置卡管理区提供 Petdex 浏览/搜索入口；列表与下载均由**宿主半代理**请求 petdex.dev（域名 allowlist、响应大小上限、8s 超时）；下载 zip 进入 FR-12 同一暂存管线；来源标记 `petdex`。
- 改造前：不可用。
- 改造后：在线宠物可搜索、预览、导入；网络失败/超时给出可读错误，不影响宠物本体运行。

**FR-15 导入配置向导（三来源共用）**
- 做什么：暂存后的统一配置步骤：宠物 id 命名（实时校验：字符集/长度/保留字 `foxbell`/与现有重复/Windows 保留设备名）、显示名与描述、字幕开关、语音分组编辑（增删音频文件、并行时长探测，有效音频判定 1s<时长<20s 且 ≤10MB、四组齐全判定「有语音」能力）→ 完成落位。
- 改造前：不可用。
- 改造后：任何来源导入都经同一向导，命名冲突与非法输入在落位前拦截。

### D 组：管理、切换与守卫

**FR-16 宠物管理对话框**
- 做什么：对已安装宠物：改名（id 同步 manifest 与目录）、编辑显示名/描述、按组增删语音文件、字幕开关、安全删除（二次确认后移入 `~/.dsh/foxbell-pet/.trash/`，不直接物理删除）、查看目录路径（WebUI 内展示完整路径 + 复制按钮）。编辑当前激活宠物时闪切 foxbell、保存后自动切回（沿用 MAM 的闪切保护策略）。
- 改造前：不可用。
- 改造后：外部宠物全生命周期可维护。

**FR-17 切换对话框与热切换**
- 做什么：卡片式宠物列表（含内置 foxbell 与全部外部宠物）→ 激活选中项；切换即时生效（精灵/语音/清单热替换，无需刷新页面）；若激活时检测到磁盘与清单不一致，弹出三选修复（更新清单 / 换回 foxbell / 取消）。
- 改造前：仅内置 foxbell，无切换概念。
- 改造后：多宠物一键热切换；异常时引导修复。

**FR-18 激活守卫（MAM「启动守卫」的 WebUI 适配）**
- 做什么：宿主半在插件激活与每次切换时对外部宠物做完整性校验（图集缺失/被改动、语音缺失/变动/多余、清单缺失）；问题经状态快照下发；客户端在宠物旁或设置卡弹出修复对话（更新清单 / 换回 foxbell / 忽略 / 隐藏宠物）。宠物本体运行中不弹对话。
- 改造前：资产被外部破坏时行为未定义（可能白屏/静默异常）。
- 改造后：资产损坏有明确引导路径，可自愈或安全回退。

### E 组：入口与集成

**FR-19 设置页管理分区**
- 做什么：现有设置卡扩展为两个分区：「配置」区（现有配置项 + 新增缩放）与「宠物管理」区（当前宠物显示、切换 / 导入 / 管理按钮，Petdex 入口）。
- 改造前：设置卡仅配置项，无任何宠物管理入口。
- 改造后：设置页一站式管理；不额外新增 settings.plugin.item 卡片（保持单卡，减少设置页碎片）。

**FR-20 右键菜单快捷切换**
- 做什么：右键菜单新增「切换宠物」子菜单：列出全部已安装宠物，当前项打勾，点击即热切换。
- 改造前：右键菜单无宠物维度。
- 改造后：高频切换操作一步直达。

**FR-21 侧栏 🦊 开关保留**
- 做什么：现有 `sidebar.footer.action` 槽位的显示/隐藏开关原样保留，语义不变（对整个宠物 overlay 生效）。
- 改造前/后：行为一致（回归验证项）。

### F 组：配置与数据契约

**FR-22 配置模型扩展与迁移**
- 做什么：Config 新增 `scale`（0.75|1|1.25，默认 1）与 `activePetId`（默认 `foxbell`）；现有字段（muted/talkative/doneAction/dblAction/approvalAction/errorAction/gravity）不变；已保存旧配置无需用户干预自动生效（缺省字段取默认值）；localStorage 键沿用 `dyn-pet-foxbell-*` 前缀（不迁移、不复用 MAM 的 `mam-*` 键）。
- 改造前：单宠物固定尺寸配置模型。
- 改造后：配置含宠物选择与缩放；旧用户升级零感知。

**FR-23 状态快照（/state）扩展**
- 做什么：现有轮询快照新增字段：`activePet`（id/name/hasVoice/hasSubtitle/spriteVersionNumber）、`pets[]`（已安装宠物摘要列表）、`guard`（激活宠物完整性问题，无问题为空）；`voices` 改为当前激活宠物的语音清单（含字幕文本来源）；资产 URL 指向 `/dyn-pet-foxbell/pets/<id>/...`（内置 foxbell 由宿主映射到包内 assets）。
- 改造前：快照只有固定 foxbell 的语音表。
- 改造后：快照驱动整个多宠物 UI；轮询频率维持 1.5s。

**FR-24 私有路由族（需求层面清单）**
- 做什么：在现有 `/dyn-pet-foxbell/` 前缀下扩展：宠物列表、单宠物资产（manifest/图集/语音文件）、导入（folder/zip/codex/petdex）、暂存区音频增删、完成/取消导入、清单更新、改名、删除、激活切换、Petdex 搜索代理。现有 `/state`、`/ack`、`/client-diag` 路由语义不变；内置素材路由在实现上并入宠物资产路由（foxbell 作为 id 特例映射到包内 assets），对外行为不变。
- 改造前：仅 5 条只读路由。
- 改造后：完整商店操作路由族；全部为插件私有 API，仅本 WebUI 使用。

### G 组：质量属性

**FR-25 错误码体系与呈现**
- 做什么：移植 MAM PetError 码表（约 48 码：sheet-*/audio-*/scan-fail/import 系列等）；路由错误统一 `{code, params, detail}` JSON；客户端按码表映射 zh/en 文案呈现于对话框内联提示（不引入 toast 系统）。
- 改造前：错误处理零散，外部宠物操作失败无统一呈现。
- 改造后：任何失败都有可读的中文提示与错误码可查。

**FR-26 安全防护**
- 做什么：移植 MAM 四类防护：宠物 id 校验（字符集/长度/保留字/重复/Windows 保留名，前端后端双重校验）、路径穿越防御（所有按 id 寻址的操作拒绝 `..`/绝对路径/符号链接逃逸）、zip 解压三重上限、Petdex 域名 allowlist 与响应限额。
- 改造前：无外部输入，无需防护。
- 改造后：恶意构造的目录名/压缩包/在线响应被拒绝且不影响插件与宿主。

**FR-27 TUI/无 webServer 环境安全降级**
- 做什么：在无 `webServer`/`settings` 服务的环境（TUI profile）下插件静默不激活 UI（沿用 v1.3.0 的防御式注入写法），不报错、不影响宿主。
- 改造前/后：行为一致（回归验证项，因依赖面扩大需重新验证）。

**FR-28 构建体系与产物纯度**
- 做什么：仓库升级为 `src/host/`（纯 JS）+ `src/client/`（TSX）双源码树；esbuild 构建产出单文件 iife `lib/client.js`（react 与 `@deepseek-ai/*` 平台模块 external，按 React 18 目标编译；Tailwind 产物 CSS 内联注入）；`scripts/build.mjs` 重写；`scripts/validate.mjs` 扩展：产物纯度（无残留 import/export）、`dsh.client` 声明与实际依赖一致、路由前缀/设置命名空间/版本号一致性、现有违禁词与资产检查保留。
- 改造前：src→lib 纯复制，零构建零类型。
- 改造后：TSX 开发体验；产物仍满足 harness 客户端 bundle 纯度要求；静态校验兜底发布质量。

**FR-29 测试与验收**
- 做什么：vitest 覆盖纯逻辑（状态映射、id/清单校验、清单 diff 与修复建议、导入暂存管线（临时目录实操）、zip 防护、Petdex mock）；手工 QA 清单（rc.1 安装、宠物全交互、四来源导入、热切换、守卫、缩放、TUI 降级）；master 冒烟。
- 改造前：仅静态 validate，无单测。
- 改造后：核心逻辑有回归防护；发布按 QA 清单验收。

## 6. 代码移植映射（模块级）

> 具体函数签名、拆分与实现顺序由计划文档（plan）决定，此处只锁定「搬什么、搬到哪、改什么」。所有 MAM 源路径相对其仓库根目录（见第 1 章基线）。

### 6.1 前端：MAM `src/components/pet/` + `src/pages/pet.tsx` → 插件 `src/client/`

| MAM 源 | 目标 | 移植改动 |
|---|---|---|
| `FoxbellPet.tsx` | `pet/FoxbellPet.tsx` | 会话跳转 `useSessionJump` → 客户端 `sessions.open()`；Tauri 窗口 API 剔除 |
| `usePetWindow.ts` | `pet/usePetOverlay.ts` | Tauri 窗口几何/工作区 → DOM overlay 定位（视口为工作区）；物理常量与算法原样保留 |
| `petConfig.ts` | `pet/petConfig.ts` | localStorage 键 `mam-*` → `dyn-pet-foxbell-*`；接 settingsScope 双后端 |
| `petStatus.ts` | `pet/petStatus.ts` | 输入类型 MAM `Session` → 插件 `/state` 快照项目；新增错误/断联扩展态 |
| `PetMenu.tsx` | `pet/PetMenu.tsx` | 新增「切换宠物」子菜单（FR-20）；MAM 菜单中的窗口置顶项不移植 |
| `petVoices.ts` / `petAnimations.ts` / `pet-cursor.css` | 同名 | 基本原样 |
| `petRuntime.ts` / `petActivation.ts` / `petValidation.ts` | `runtime/` | Tauri IPC 调用 → 插件 HTTP 路由；音频时长/图集尺寸探测保留前端做法 |
| `PetStartupGuard.tsx` | `runtime/ActivationGuard.tsx` | 守卫时机从「应用启动」改为「插件激活/宠物切换」，数据来自 `/state.guard` |
| `petErrors.ts` | `shared/errors.ts` | 码表原样，文案接内部字典 |
| `manage/PetImportDialog.tsx` / `PetManageDialog.tsx` / `PetSwitchDialog.tsx` / `VoiceGroupEditor.tsx` / `useVoiceDurationProbe.ts` | `manage/` | UI 基座 radix/sonner → `ui-primitives` + 内联错误；IPC → HTTP |
| `src/pages/pet.tsx` | 并入 `index.tsx` | 独立窗口根组件 → `shell.overlay` 槽位挂载 |
| `src/i18n/locales/{zh,en}.json` 的 `pet.*` 键 | `i18n.ts` | react-i18next → 内部 `t()` 字典 |

**不移植（前端）**：`useSessionJump`、`sessionReadSync`（已读状态由宿主 `/ack` 集中管理，天然跨标签一致）、`useNotification` 接管门（petSoundTakeover/petSuppressPopup，D4）、`getAgentLabel`（dsh 单一 agent 场景简化）、标题栏开关（插件已有侧栏槽位开关）、托盘相关。

### 6.2 后端：MAM `src-tauri/src/services/pet/` + `commands/pet.rs` → 插件 `src/host/pets/`

| MAM 源（Rust） | 目标（Node） | 移植改动 |
|---|---|---|
| `services/pet/mod.rs` | `store.js` | 目录布局/暂存区清扫/改名/删除；删除从 trash crate 改为 `.trash/` 目录 |
| `services/pet/scan.rs` | `scan.js` | 逻辑原样（三段语音规则、symlink 防御、Codex 目录枚举） |
| `services/pet/manifest.rs` | `manifest.js` | serde 模型 → JSON 校验；原子写 + `.bak` 原样 |
| `services/pet/import.rs` | `import.js` | staging 管线原样；`safe_unzip` 用 Node zip 库重写（三重上限与防穿越语义不变） |
| `services/pet/petdex.rs` | `petdex.js` | reqwest → Node fetch；allowlist/限额/超时语义不变 |
| `services/pet/error.rs` | `errors.js` | PetRpcError 形状 → 路由错误 JSON |
| `commands/pet.rs` | `routes.js` | 15 个 IPC 命令 → HTTP 路由处理；窗口创建/置顶命令不移植 |

**不移植（后端）**：`window/`（AppleScript/HWND/deep-link 跳转）、`system_tray.rs` 宠物项、`database/dao/unread.rs`（插件已有宿主侧聚合）、tauri capabilities/assetProtocol 配置（WebUI 内由路由伺服资产）。

### 6.3 保留的插件自有代码

- 宿主半现有状态聚合骨架（FR-1 迁移数据源后保留判定逻辑，含错误/断联检测）。
- 现有三槽位注册、`/state`/`/ack`/`/client-diag` 路由、内置素材伺服（并入 FR-24 路由族）。
- `assets/`（foxbell 图集与 31 条语音）与 `demo/` 预览页。

## 7. 交互与数据流总览

```
┌─ dsh WebUI (rc.1) ────────────────────────────────────────────┐
│  sidebar.footer.action → 🦊 显示/隐藏开关（FR-21）              │
│  settings.plugin.item  → 单卡双分区：配置 + 宠物管理（FR-19）     │
│  shell.overlay          → 宠物本体 + 状态卡片 + 守卫对话          │
│      │ 1.5s 轮询 /dyn-pet-foxbell/state（含 pets/activePet/guard）│
│      │ 管理操作 → /dyn-pet-foxbell/pets/**（FR-24）              │
└──────┬────────────────────────────────────────────────────────┘
       │
┌─ 宿主半（胖）─────────────────────────────────────────────────┐
│  状态聚合：session.snapshotEvents() + agents/sessions/sessionTitle │
│  宠物商店：~/.dsh/foxbell-pet/pets/（扫描/导入/清单/校验/Petdex）    │
│  配置：ctx.settings.installSection（foxbell-pet 命名空间）          │
└──────────────────────────────────────────────────────────────┘
```

## 8. 测试与验收标准

| 验收项 | 判据 |
|---|---|
| 兼容恢复 | rc.1 上：宠物显示、状态卡片有数据、设置卡出现且配置持久化、双击/拖拽/语音全部工作 |
| 多宠物闭环 | 四来源各导入一个样本宠物 → 缩放切换 → 热切换 → 改名/增删语音 → 删除，全程无 JS 报错，错误场景有中文提示 |
| 守卫 | 人为删除/篡改激活宠物图集 → 出现修复对话 → 「更新清单」或「换回 foxbell」均能恢复正常 |
| 安全 | `../` id、超限 zip、非法名、非 allowlist 域名请求全部被拒并有对应错误码 |
| 降级 | TUI profile 下插件静默；多标签页 WebUI 中宠物状态一致 |
| 纯度 | validate 通过：bundle 无外部 import/export、声明一致、版本号一致 |
| 单测 | vitest 全绿；核心逻辑（状态映射/校验/管线）有覆盖 |
| 前向 | master 冒烟结果记录于附录 C |

## 9. 版本与发布

- 版本 `v2.0.0`（破坏性：最低 dsh 要求提升至 0.1.2-rc.1；色彩语义变化显著标注）。
- `package.json` 升版、`dsh.plugin.json` 不动（D4）；README/README.en/CHANGELOG 同步。
- 发布流程沿用 GitHub 安装方式（`dsh plugin --profile web add github:...`）；prepare 构建需在 profile 的 pnpm allowBuilds 白名单提示中说明（README 安装节更新）。

## 附录 A：rc.1 兼容矩阵（验证证据）

| API/契约 | 状态 | 证据（rc.1 tag 内路径） |
|---|---|---|
| `webServer.register({kind:'exact',...})` | ✅ 未变 | `packages/host/webserver/src/index.ts:165` |
| `fs.resolve/readBytes/listDir` | ✅ 未变 | `packages/fs/fs/src/index.ts:212,221` |
| `agents.roots()` | ✅ | `packages/interaction/user-questions/src/index.ts:101` 等多处在用 |
| `sessions.get()` / `sessionTitle.get()` | ✅ | `packages/core/session/src/index.ts:861`；`packages/session/session-title/src/index.ts:385` |
| `session.events` 属性 | ❌ 改为 `snapshotEvents()` | `packages/core/session/src/index.ts:600` |
| `installSettingsSection` 辅助函数 | ❌ 改为 `ctx.settings.installSection(...)` | `packages/extensions/tool-cordis/src/api-catalog.ts:1930`；hooks 形状 `{setSource, onChange, validate?}` 兼容 |
| `@deepseek-ai/dsh-client-runtime` | ❌ 包已删除 | 平台种子表 `packages/client/web/src/platform.ts`（runtime 不在列，store/ui-slots/ui-primitives 在） |
| `window.__ModuleLoader__.load` | ✅ | `packages/client/modules/src/client/manifest.ts:10` |
| 槽位 `shell.overlay`/`sidebar.footer.action`/`settings.plugin.item` | ✅ | `ui-layout/src/client/index.ts:86`；`ui-sidebar/src/client/contract/slots.ts:46`；`ui-settings-plugins` |
| 客户端 `sessions.open()` / `settingsScope.bind()` | ✅ | `ui-workspace/src/client/index.ts:102`；`ui-chat/src/client/apply.ts:80` |
| `@deepseek-ai/dsh-settings` | 版本 0.1.2-rc.1 | `packages/settings/settings/package.json` |
| React 平台版本 | 18.2（MAM 代码按 18 编译） | `packages/client/web/package.json:35` |
| `@deepseek-ai/dsh-client-ui-primitives` | ✅ 含 Button/Input/Menu/Modal/DisclosureRow/HoverCard | `packages/client/ui-primitives/src/index.ts` |

## 附录 B：术语

- **dsh / harness**：DeepSeek harness 宿主，`npx @deepseek-ai/dsh web` 启动 WebUI。
- **宿主半 / 客户端半**：插件的 Node 侧（`lib/index.js`）与浏览器侧（`lib/client.js`），经 `dsh.bundle.patch` 与 `dsh.client` 声明挂载。
- **MAM**：MultiAgents-Manager v0.3.0，Tauri 桌面应用，宠物功能的移植来源。
- **外部宠物**：商店目录中可安装切换的宠物包（图集 + 清单 + 可选语音），与内置 foxbell 相对。
- **Petdex**：在线宠物仓库（petdex.dev），MAM 已接，本次随移植接入。

## 附录 C：master（0.1.3-alpha.1）前向冒烟结果

> 发布前填写：日期 / 结果 / 发现的差异。

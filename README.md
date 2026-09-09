# dsh-foxbell-pet

[中文](README.md) · [English](README.en.md)

DeepSeek Harness（DSH）Web 网页右下角可拖拽的 **Foxbell 小狐狸桌宠**：多项目状态监控 + 语音提醒 + **外部宠物体系**（商店 / 四来源导入 / 热切换 / 完整性守卫）+ 🦊显隐开关。内置素材随包自带：**一键安装即用**。

![Foxbell](reference/桃子衣服粉狐狸形象.png)

> **v2.0.0 面向 dsh ≥ 0.1.2-rc.1**（rc.7/rc.8 等旧版不再支持，见下方兼容表）。
> 状态卡片色彩语义自本版起切换为 MAM 口径（**红=待审批 / 黄=运行中 / 绿=完成未读 / 深红+⚠=错误断联**），与 v1.x（绿运行/黄待批准/红报错/蓝完成）不同，详见 [CHANGELOG](CHANGELOG.md)。

## 功能

- **多项目状态监控** —— 桌宠头顶为每个"活跃项目"显示一张状态卡片（MAM 色彩口径）：
  - 🔴 `approval` 等待审批（红）
  - 🟡 `running` 正在运行（黄）
  - 🟢 `done` 已完成未读（绿，点击即确认消失）
  - 🟥 `error` 本轮报错 / 断联（**深红 + ⚠ 标识**，与待审批红明确区分）
- **点卡片切换会话** —— 点击卡片直接切到该项目会话（`sessions.open`）并标记已读；错误/完成卡片点进去即消失，再次出现会重新亮起。
- **语音提醒** —— 完成播 `done` 组、待审批播 `approval` 组（10s 限流）、报错播 `error` 组；字幕=语音文件名，与音频时长对齐。
- **语音交互** —— 单击形象：只挥手（不出声）；双击形象：说话 + 「双击动作」；点卡片：只切换（不出声）。
- **状态驱动动画**（Codex V2 图集 11 行全用；外部宠物 v1 9 行图集运行时自适应）——
  动画优先级：**拖拽 > 瞬时动作 > 任务态 > 环视 > 待机**；拖动方向（左跑/右跑/上拎跳）、任务姿态（待审批→等待、运行→工作）、空闲 6s 环视 16 向扫视。
- **拖拽物理手感** —— 松手重力坠落（1400 px/s²）、水平抛掷惯性（150ms 采样窗）、落地压扁回弹 + 补跳（可关）；视口为工作区，位置记忆与边界钳制。
- **右键菜单** —— 🔊出声 / 💬语音字幕 / 🧲物理坠落 开关（无语音/无字幕宠物自动禁用带提示），📏大小三档，🖱️双击 / 🔴红灯 / 🟥深红灯 / 🟢绿灯 **四场景动作绑定（子页实时预览）**，**🔁切换宠物**（当前项打勾，点击即热切换），🦊隐藏桌宠，ℹ️关于。
- **外部宠物体系**（MAM v0.3.0 移植）——
  - 磁盘商店 `~/.dsh/foxbell-pet/pets/<id>/`；清单 v2（原子写 + `.bak` 备份）；
  - **四来源导入**：本地文件夹 / zip 包（宿主安全解压：总量 ≤100MB、文件数 ≤200、路径防穿越）/ Codex 宠物目录 `~/.codex/pets/` / **Petdex 在线仓库**（petdex.dev，列表与下载均由宿主代理：域名 allowlist、体积上限、8s 超时）；
  - **统一导入向导**：宠物 id 实时校验（字符集/长度/保留字 `foxbell`/查重/Windows 保留设备名，前后端双重校验）、显示名/描述、字幕开关、语音分组编辑（并行时长探测；1s<时长<20s 且 ≤10MB；四组齐全判定「有语音」）；
  - **管理对话框**：改名（id 同步目录与清单）、编辑显示名/描述、按组增删语音、字幕开关、**安全删除**（二次确认后移入 `~/.dsh/foxbell-pet/.trash/`，不物理删除）、查看目录路径；编辑激活中宠物自动闪切保护；
  - **热切换**：卡片式列表（内置 foxbell + 外部宠物）→ 激活即时生效（精灵/语音/清单热替换，无需刷新页面）；
  - **激活守卫**：激活与每次切换校验完整性（图集缺失/被改动、语音缺失/变动/多余、清单缺失），问题随状态快照下发，弹修复对话（更新清单 / 换回 foxbell / 忽略 / 隐藏宠物）；宠物本体运行中不弹；
  - **无语音宠物**：完成只播动画不出声、音效开关禁用带提示；**无字幕宠物**：不显示气泡。
- **三档缩放**（0.75 / 1 / 1.25）—— 作用于精灵/卡片/菜单整体（设置卡与右键菜单同款档位）。
- **设置卡（单卡双分区）** —— 「配置」区（声音/字幕/物理/四场景动作/大小）+「宠物管理」区（当前宠物、切换/导入/管理按钮、Petdex 入口）；与右键菜单读写同一份配置（localStorage + settings scope 双后端，Host 持久化到 `~/.dsh/settings.yaml`）。
- **🦊 显隐开关** —— 侧栏底部（语义与 v1 相同），状态存 localStorage。
- **错误码体系** —— 对齐 MAM PetError 码表（宿主 50 码 + 客户端本地 8 码），路由错误统一 `{code, params, detail}` JSON，客户端按插件内部 zh/en 字典映射文案、内联呈现于对话框（浏览器语言自动选择，不依赖 harness locale）。

## 环境要求（兼容表）

| 组件 | 要求 |
|---|---|
| DeepSeek Harness（DSH） | **≥ 0.1.2-rc.1**（Web profile，`dsh web`） |
| rc.1 依赖面 | `session.snapshotEvents()`（B1）、`ctx.settings.installSection`（B2）、`dsh.client.inject` 包级依赖边语义（B3，本插件声明为空——只用平台种子模块 react） |
| master（0.1.3-alpha.1） | 静态 diff 评估无破坏面（详见 IMPLEMENTATION_NOTES §9） |
| v1.x（rc.7/rc.8 时代） | **不支持**（旧 `session.events` / `installSettingsSection` / `dsh-client-runtime` 在 rc.1 已删除；请使用本插件 v1.3.0） |

内置素材随包自带，无需额外下载；外部宠物素材由用户导入。

## 安装（一键）

```sh
dsh plugin --profile web add github:jarvislee90s-dot/dsh-foxbell-pet
> 构建白名单提示：v2 起安装会执行 `prepare`（esbuild 构建）。dsh profile 使用 pnpm 时，
> 首次安装需在 profile 的 allowBuilds 白名单放行本插件的构建脚本（pnpm approve-builds
> 或 profile 配置），否则产物 `lib/` 不会生成。
```

然后**重启 `dsh web`** 并**硬刷新浏览器**（Cmd/Ctrl+Shift+R）。右下角即出现桌宠，设置旁有 🦊 开关，设置页出现「foxbell-pet」配置卡。

> 桌宠运行时从插件包自带目录 `assets/` 读取内置精灵图/语音；外部宠物商店在
> `~/.dsh/foxbell-pet/`（插件专属目录，首次启动自动创建）。

## 使用

| 交互 | 效果 |
|---|---|
| 拖动 | 任意移动桌宠（方向动画：左跑/右跑/上拎跳） |
| 拖拽后松手 | 重力坠落 / 抛掷惯性 / 落地压扁回弹 + 补跳（可关「物理坠落」） |
| 右键桌宠 | 菜单：开关 / 大小 / 四场景动作绑定（实时预览）/ 切换宠物 / 隐藏 / 关于 |
| 单击形象 | 固定挥手（不出声） |
| 双击形象 | 随机说一句 + 「双击动作」（字幕=语音文件名） |
| 点项目卡片 | 切换会话 + 标记已读（绿卡点击即确认消失） |
| 🦊 按钮（侧栏底部） | 显示 / 隐藏桌宠 |
| 设置卡「宠物管理」 | 切换 / 导入 / 管理宠物、Petdex 画廊入口 |

状态灯（MAM 口径）：**红** 待审批 · **黄** 运行中 · **绿** 完成未读 · **深红+⚠** 报错/断联。

## 语音分组

`voice/` 按状态分 4 个固定分组（内置素材在包内 `assets/voice/`，外部宠物在
`~/.dsh/foxbell-pet/pets/<id>/voice/`），文件名即字幕文字：

| 文件夹 | 触发时机 | 说明 |
|---|---|---|
| `general/` | 双击形象 | 闲聊（随机、组内不连续重复） |
| `approval/` | 出现待审批（红灯） | 撒娇催促，10s 限频防刷屏 |
| `error/` | 任务报错（深红灯） | 委屈/傲娇台词 |
| `done/` | 任务完成（绿灯） | 求夸/元气台词 |

运行（黄）不播语音。空组静默跳过；四组齐全才判定宠物「有语音」能力。

## 自定义（外部宠物）

- **导入**：设置卡 →「导入宠物」→ 四来源任选（文件夹 / zip / codex / petdex 链接或搜索）→ 向导配置（id/显示名/描述/字幕/语音分组）→ 执行导入 → 立即激活。
- **素材规格**：Codex V2 图集 `spritesheet.webp`（8 列；11 行 1536×2288 = v2，9 行 1536×1872 = v1，运行时自适应），见 [docs/SPRITESHEET-CONTRACT.md](docs/SPRITESHEET-CONTRACT.md)；语音 `.m4a/.mp3/.wav/.ogg/.opus/.flac/.aac`，单条 1–20s 且 ≤10MB。
- **换形象不换语音**：管理对话框按组增删语音后「保存修改」（清单自动备份更新）。

## 开发

```sh
npm install
npm run build      # esbuild：src/host → lib/index.js（ESM），src/client → lib/client.js（单文件 iife）
npm run validate   # 静态校验（既有检查 + 产物纯度 / 声明一致 / 路由前缀 / 版本 / 错误码表 / 内置清单）
npm run typecheck  # tsc --noEmit（客户端 TSX）
npm test           # vitest（纯逻辑 + 真实临时目录管线 + mock fetch）
```

```
dsh-foxbell-pet/
├── assets/         内置 foxbell 素材（精灵图 + 31 条语音 + v2 清单 pet.json）
├── lib/            发布产物（main 与 ./client 入口；esbuild 生成，随包提交）
├── src/host/       宿主半源码（纯 JS：状态聚合/商店/导入/守卫/路由族）
├── src/client/     客户端半源码（TSX：本体/菜单/设置卡/对话框/错误码字典）
├── test/           vitest 套件（含真实临时目录与 mock fetch）
├── scripts/        构建 + 校验 + 内置清单生成
├── docs/           图集规格 / QA 清单 / 历史设计文档
├── demo/           独立离线预览页
├── package.json  dsh.plugin.json  cordis.patch.yml
├── IMPLEMENTATION_NOTES.md   决策记录 / MAM 对齐索引表 / 前向风险评估
└── README.md  README.en.md  LICENSE  CHANGELOG.md
```

本机开发安装：`dsh plugin --profile web add <仓库路径>` 装的是 symlink；改完 `src/` 后
`npm run build`，**重启 `dsh web`** 并硬刷新浏览器即生效。

## License

[MIT](LICENSE)

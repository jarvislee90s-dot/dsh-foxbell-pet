# 人工实机 QA 清单 — dsh-foxbell-pet v2.0.0（rc.1 WebUI）

> 实机验证由维护者人工执行。环境：`dsh-v0.1.2-rc.1`（`npx @deepseek-ai/dsh@0.1.2-rc.1 web` 或本地
> harness 检出 `git checkout dsh-v0.1.2-rc.1` 后启动 web profile）。浏览器建议 Chrome/Edge
> 最新版（webkitdirectory 与 Audio 元数据探测依赖）。每项给出【步骤】与【预期】。

## 0. 准备

- [ ] 0.1 本仓库根执行 `npm install && npm run build && npm run validate && npx vitest run`
  - 预期：validate 输出 `VALIDATE OK`；vitest 全绿；`lib/index.js`、`lib/client.js` 已更新。
- [ ] 0.2 `grep -E "^\s*(import|export)\b" lib/client.js`
  - 预期：零命中（产物纯度）。
- [ ] 0.3 安装插件到 web profile：`dsh plugin --profile web add <本仓库绝对路径>`（symlink 安装）
  - 预期：命令成功；`~/.dsh/profiles/web/node_modules/dsh-foxbell-pet` 指向本仓库。
- [ ] 0.4 依赖与构建前置（白名单提示）
  - 运行时依赖（`npm install` 会拉取，若企业代理/白名单环境需放行）：
    `@deepseek-ai/dsh-settings@^0.1.2-rc.1`、`@deepseek-ai/schemastery@^3.18.1`、
    `yauzl@^3.4.0`（zip 解压，NOTES D22 说明理由）；客户端 bundle **零新增运行时依赖**
    （只 require 平台种子词 react / react/jsx-runtime，validate §7 锁死）。
  - 构建/测试 devDependencies：`esbuild`（安装时有 postinstall 二进制下载，代理环境需放行
    registry.npmjs.org 与 esbuild 的 optional 平台包）、`vitest`、`typescript`、
    `@types/react`、`@types/node`。
  - 预期：`npm ls yauzl esbuild` 可解析；`npm run build` 无网络亦可通过（esbuild 已装好时）。

## 1. rc.1 兼容恢复（B1/B2/B3）

- [ ] 1.1 启动 `dsh web`，浏览器打开 WebUI，**硬刷新**（Cmd/Ctrl+Shift+R）
  - 预期：右下角出现桌宠（内置 Foxbell）（B3：客户端半挂载成功）；宿主日志含
    `[foxbell-pet] host mounted: sprite=2654210 builtinVoices=31 …`。
- [ ] 1.2 侧栏底部出现 🦊 开关；点击切换
  - 预期：宠物即时隐藏/显示；刷新页面后状态保持（localStorage）。**（回归项）**
- [ ] 1.3 发起一个会话任务（任意 prompt），观察头顶状态卡
  - 预期：任务运行中出**黄**卡（B1：snapshotEvents 聚合生效，卡片有数据非静默失效）；
    标题=会话标题或项目 id，卡内最多 2 行最新进展。
- [ ] 1.4 打开设置页 → 插件配置区
  - 预期：出现「foxbell-pet」设置卡（B2：installSection 注册 + settings.plugin.item 派发），
    单卡双分区：「配置」（声音/语音字幕/落地物理/四个动作下拉/大小三档）与「宠物管理」
    （当前宠物 + 切换/导入/管理按钮 + Petdex 链接）。
- [ ] 1.5 在设置卡切换「落地物理」为关，右键宠物看菜单
  - 预期：菜单「🧲 物理坠落」同步显示关（同一份配置双端同步）；刷新页面后仍为关
    （持久化到 `~/.dsh/settings.yaml`，可 `grep foxbell-pet ~/.dsh/settings.yaml` 验证）。
- [ ] 1.6 浏览器 DevTools → Network，过滤 `dyn-pet-foxbell`
  - 预期：`/state` 每 1.5s 轮询一次，200 JSON；响应含 `activePet`、`pets[]`、`guard:[]`、
    `voices[]`（url 指向 `/dyn-pet-foxbell/pets/foxbell/voice/…`）。
- [ ] 1.7 多标签页竞态（机制见 NOTES D24，未自动化——本项为实机核对）
  - 步骤：开两个 WebUI 标签 A/B。① A 改「大小」为 1.25；② B 改名某外部宠物；③ A 同时
    对同一宠物点删除；④ 两标签各自拖拽宠物到不同位置后刷新其一。
  - 预期：① B 在 ≤1.5s 内（下一轮轮询/onChange）同步为 1.25；② 先提交者成功；③ 后到
    操作得到**可读内联错误**（pet-not-found / pet-exists），无白屏、无半成品目录
    （`ls ~/.dsh/foxbell-pet/pets/` 核对）；④ 位置 last-write-wins，刷新后取最后保存值。
    全程两标签 `/state` 轮询互不中断。

## 2. 宠物本体全交互（MAM 基准）

- [ ] 2.1 单击宠物
  - 预期：播挥手动画（行 3），不出声，不弹菜单。
- [ ] 2.2 双击宠物
  - 预期：随机播 general 组语音 + 「双击动作」（默认挥手）+ 字幕气泡（=语音文件名）；
    字幕时长与音频对齐（≥2.5s）；连续双击不连续重复同一条语音。
- [ ] 2.3 拖拽宠物：慢速左移 / 右移 / 上拎
  - 预期：左移播向左跑（行 2）、右移播向右跑（行 1）、上拎播跳跃（行 4）；拖动中光标 grabbing。
- [ ] 2.4 快速水平甩出后松手（落地物理=开）
  - 预期：宠物带水平惯性抛物线坠落，落地瞬间压扁（scaleY 0.55）回弹 + 补跳一段；
    最终停在地面（视口底上方 76px 落点），不弹跳穿透。
- [ ] 2.5 刷新页面
  - 预期：宠物停在上次落点（位置记忆 {x,y}），不回默认右下角。
- [ ] 2.6 拖到视口边缘外甩出
  - 预期：x 钳制在视口内（不出屏）。
- [ ] 2.7 关闭「落地物理」后拖拽松手
  - 预期：停在松手处不坠落，位置被记忆。
- [ ] 2.8 静置 6 秒不操作
  - 预期：宠物播放环视（look 行 9→10，16 帧顺时针扫视一圈）后回 idle；期间任何拖拽/双击立即打断。
- [ ] 2.9 右键宠物
  - 预期：菜单含（自上而下）🔊出声 / 💬语音字幕 / 🧲物理坠落 · 📏大小 ·
    🖱️双击动作 / 🔴红灯动作 / 🟥深红灯动作 / 🟢绿灯动作 · 🔁切换宠物 · 🦊隐藏桌宠 · ℹ️关于。
- [ ] 2.10 进入「🖱️ 双击动作」子页
  - 预期：宠物本体循环播放当前选中动作（实时预览）；点选其它动作立即切换预览；
    「← 返回」后预览停止。
- [ ] 2.11 菜单外点击 / Esc
  - 预期：菜单关闭。
- [ ] 2.12 「ℹ️ 关于」
  - 预期：显示 `dsh-foxbell-pet v2.0.0`。
- [ ] 2.13 「🦊 隐藏桌宠」
  - 预期：宠物消失，侧栏 🦊 变灰；任务完成时**不出声不播动画**（隐藏闸门）。

## 3. 状态卡片（MAM 色彩口径 — 用户可见变化）

- [ ] 3.1 触发待审批（会话执行需批准的工具，审批策略 ask）
  - 预期：**红**卡（#ef4444），首行「等待批准」；宠物播 approvalAction（默认等待姿态）+
    approval 组语音；10 秒内多个项目同时挂审批只播一次语音（限流）。
- [ ] 3.2 任务运行中
  - 预期：**黄**卡（#eab308）；当前会话运行时宠物为工作姿态（行 7）。
- [ ] 3.3 任务完成
  - 预期：**绿**卡（#22c55e）首行「已完成」；宠物播 doneAction（默认跳跃）+ done 组语音 + 字幕。
- [ ] 3.4 点击绿卡
  - 预期：立即切到对应会话（sessions.open）且卡片**立即消失**（点击即确认）；不再复活。
- [ ] 3.5 制造报错（如断网/无效 API key 跑一轮）
  - 预期：**深红**卡（#7f1d1d）+ 标题前 ⚠ 标识，首行「本轮运行失败」；与待审批红肉眼可区分；
    宠物播 errorAction（默认委屈）+ error 组语音。
- [ ] 3.6 点深红卡进入会话后
  - 预期：卡消失（已读）；同会话再次报错重新亮深红。
- [ ] 3.7 运行中的会话直接杀掉进程/关闭（从 roots 消失）
  - 预期：卡转深红「断联」；60s 后消失。
- [ ] 3.8 同时 >6 个活跃项目卡
  - 预期：最多 6 张卡 + 「+N 更多」胶囊；排序 error > approval > running > done。

## 4. 外部宠物体系 — 四来源导入

**样本准备（逐步照做）**：

1. 素材基底：任取一张 1536×2288（11 行，v2）或 1536×1872（9 行，v1）的 Codex V2 规格
   图集命名 `spritesheet.webp`；无现成图集时可直接复制本仓库内置素材做样本：
   ```bash
   mkdir -p /tmp/pet-sample && cp <本仓库>/assets/spritesheet.webp /tmp/pet-sample/
   for g in general approval done error; do
     mkdir -p /tmp/pet-sample/voice/$g
     cp <本仓库>/assets/voice/$g/$(ls <本仓库>/assets/voice/$g | head -1) /tmp/pet-sample/voice/$g/
   done
   ```
   （语音需 1–20s 的 m4a；内置素材天然满足。）
2. **文件夹来源**样本 = `/tmp/pet-sample` 直接用（4.1）。
3. **zip 来源**样本：`cd /tmp && zip -r pet-sample.zip pet-sample`（含一层包装目录，验证脱壳，4.5）。
4. **恶意 zip** 样本（4.6）：`cd /tmp && zip evil.zip ../evil.txt`；或用本仓库
   `test/helpers/zipwriter.mjs`（可构造正规 writer 拒绝写出的 `../`/`..\` 条目名）。
5. **codex 来源**样本：`mkdir -p ~/.codex/pets/test-pet && cp -r /tmp/pet-sample/* ~/.codex/pets/test-pet/`（4.7）。
6. **petdex 来源**样本：线上 `https://petdex.dev/pets/<slug>` 任取一条（4.8）；离线环境
   仅能验证拒绝面（4.9）。

- [ ] 4.1 设置卡 →「导入宠物」→「文件夹 / 压缩包」页签 → 选择文件夹（选中素材目录）
  - 预期：进入「配置确认」步：左侧图集预览（半倍帧）+ v1/v2 徽标；宠物名预填目录名；
    语音四组列表显示文件名+时长（并行探测自动回填）。
- [ ] 4.2 宠物名实时校验：依次输入 `../evil`、`con`、`foxbell`、65 个 a、`中文`、已存在 id
  - 预期：分别内联提示 非法字符 / Windows 保留设备名 / 内置保留名 / 超 64 字符 / 非法字符 /
    已存在同名宠物；「执行导入」按钮禁用。
- [ ] 4.3 语音分组编辑：添加一条 >20s 音频、删除一条、重复添加同名文件
  - 预期：>20s 行出现「时长 ≥20s」红徽标且不计入四组齐全；重复添加自动落盘为 `名-2.ext`
    不覆盖；缺组时底部提示「缺少分组：…（该宠物将无语音）」。
- [ ] 4.4 四组齐全后勾选/取消「同步导入字幕」，填显示名与描述，点「执行导入」
  - 预期：进入「导入成功」步显示 id；点「立即激活」→ 宠物**立即**变为新宠物（无需刷新）。
- [ ] 4.5 zip 来源：同一素材打包 zip（含一层包装目录）上传
  - 预期：自动脱一层壳，预填名=内层目录名，其余同 4.1。
- [ ] 4.6 恶意 zip 防护：构造含 `../evil.txt` 条目的 zip 上传（可用
    `cd /tmp && zip evil.zip ../evil.txt` 或本仓库 test/helpers/zipwriter.mjs）
  - 预期：内联错误「压缩包内含非法路径」，`~/.dsh/foxbell-pet/` 外无 evil.txt 落盘，
    暂存区无残留。
- [ ] 4.7 codex 来源：`mkdir -p ~/.codex/pets/test-pet` 放入素材后打开导入向导 codex 页签
  - 预期：列表出现 test-pet（含 pet.json 时显示 displayName 与 vN 徽标）；「暂存所选」进入
    配置步；导入后该条目标注「已导入」。
- [ ] 4.8 petdex 来源：粘贴 `https://petdex.dev/pets/<slug>` 或关键词搜索
  - 预期：搜索返回命中列表（宿主代理，浏览器 Network 无 petdex.dev 直连请求）；
    「下载并暂存」进入配置步，宠物名预填 slug；无 zip 的条目禁选并标注。
- [ ] 4.9 petdex 拒绝面：粘贴 `https://evil.com/pets/abc`
  - 预期：下载被拒（拒绝非 petdex 域下载：evil.com）。
- [ ] 4.10 取消导入 / 中途关闭对话框
  - 预期：`.import-staging/` 对应暂存目录被清理（`ls ~/.dsh/foxbell-pet/pets/.import-staging`）。
- [ ] 4.11 崩溃自愈：手动在 `.import-staging/` 造残留目录后重启 `dsh web`
  - 预期：宿主日志 `sweptStaging=1`，残留被清扫，宠物目录不受影响。

## 5. 热切换 / 管理 / 守卫

- [ ] 5.1 右键菜单 →「🔁 切换宠物」
  - 预期：子菜单列出 内置 Foxbell + 全部外部宠物，当前项 ✓ 打勾；点击其它项立即热切换
    （精灵/语音/字幕全替换，无需刷新）；双击新宠物播**新宠物**的语音。
- [ ] 5.2 菜单 →「切换宠物…」打开卡片对话框
  - 预期：foxbell 恒第一张带「内置」徽标；每卡 48×52 缩略图 + vN/v? + 🔊💬 能力图标；
    激活卡高亮。
- [ ] 5.3 切到 v1（9 行图集）宠物后静置 6s
  - 预期：不播环视（v1 无 look 行，静默跳过），其余动画正常，backgroundSize 按 9 行渲染不裂图。
- [ ] 5.4 切到无语音宠物（导入时缺组）
  - 预期：任务完成只播动画不出声；右键菜单「🔊 出声」置灰 + 悬停提示「该宠物没有可用语音…」；
    无字幕宠物「💬 语音字幕」同理置灰、气泡不出现。
- [ ] 5.5 管理对话框：改名 / 编辑显示名描述 / 增删语音 / 字幕开关 / 保存
  - 预期：改名后目录与 manifest.id 同步（`ls ~/.dsh/foxbell-pet/pets/`），存在
    `manifest.json.bak`；保存提示「已保存（manifest 已备份更新）」；语音增删即时落盘、
    保存后写入清单。
- [ ] 5.6 编辑**当前激活**宠物
  - 预期：进入编辑即提示「该宠物正在使用，已自动切回 foxbell」（闪切保护）；保存成功后
    自动切回（改名场景切回新 id）；不保存直接关对话框也自动切回原宠物。
- [ ] 5.7 管理对话框「目录路径」
  - 预期：显示 `~/.dsh/foxbell-pet/pets/<id>` 实际路径，复制按钮生效。
- [ ] 5.8 删除宠物
  - 预期：出现二次确认文案；确认后宠物消失，目录移入 `~/.dsh/foxbell-pet/.trash/<id>-<时间戳>`
    （**不物理删除**，可手动移回恢复）；删除激活中宠物先闪切 foxbell 不回切。
- [ ] 5.9 守卫场景 A（图集被删）：`rm ~/.dsh/foxbell-pet/pets/<激活id>/spritesheet.webp`，刷新页面
  - 预期：弹「宠物素材校验」fatal 视图（图集缺失），**无**「更新清单」按钮，提供
    「切回 foxbell」「隐藏宠物」；切回后宠物恢复 foxbell。
- [ ] 5.10 守卫场景 B（语音变动）：向激活宠物 `voice/general/` 塞一个新 m4a，刷新页面
  - 预期：弹修复对话列出「未登记的语音文件：voice/general/xxx」；点「根据现有素材更新
    manifest（自动备份）」→ 重探时长、写回清单、提示已更新、不再弹；`.bak` 已生成。
- [ ] 5.11 守卫场景 C（清单缺失）：`rm …/<id>/manifest.json{,.bak}` 后刷新
  - 预期：弹「manifest 缺失」修复对话；更新后按直投首建（全量探测）。
- [ ] 5.12 「忽略并继续」
  - 预期：对话关闭按磁盘现状运行；同一问题不再重复弹（签名记忆）；再次改动素材（签名变化）
    重新弹出。
- [ ] 5.13 宠物拖拽/坠落进行中触发守卫条件（另一标签改文件后回到拖拽）
  - 预期：本体运行中不弹对话，静止后才弹。
- [ ] 5.14 切换到一个磁盘已被破坏的宠物（切换时校验）
  - 预期：切换对话框内嵌「素材与 manifest 不一致」三选面板（更新/忽略降级/取消切换），
    不闪退不白屏；取消后激活宠物不变。

## 6. 缩放

- [ ] 6.1 设置卡「大小」三档切换（小 0.75 / 中 1 / 大 1.25）
  - 预期：精灵、状态卡、字幕气泡、右键菜单**整体**缩放；地面落点随档位重算不悬空；
    位置被钳制回视口内；刷新后档位保持（settings 持久化）。
- [ ] 6.2 右键菜单「📏 大小」子页
  - 预期：与设置卡同一配置双向同步，当前档高亮。

## 7. 旧配置兼容 / TUI 降级（回归项）

- [ ] 7.1 旧配置升级：先在 v1.3.0 环境保存过配置（或直接编辑 `~/.dsh/settings.yaml` 的
    foxbell-pet 段只留 7 个旧字段），启动 v2
  - 预期：正常加载零报错；scale=1、activePetId=foxbell 默认补齐；旧字段值保留生效。
- [ ] 7.2 TUI 降级：`dsh`（无 web，TUI 模式）运行任意会话
  - 预期：宿主无 `[foxbell-pet]` 报错、无路由注册（webServer 不在场插件不 apply）；
    TUI 功能完全不受影响。
- [ ] 7.3 无 settings 服务环境（若可构造）
  - 预期：设置卡不出现但宠物/开关/菜单正常（防御式注入）；配置回落 localStorage。

## 8. 安全抽查（实机复核测试面）

- [ ] 8.1 `curl -s 'http://127.0.0.1:3080/dyn-pet-foxbell/pets/..%2f..%2fetc/manifest.json'`
  - 预期：4xx JSON 错误（WHATWG URL 先规范化 `%2f..` 路径 → 404 路由不命中；即便命中，
    id 白名单也会以 `pet-name-*` 拒绝）——任何情况下不得泄漏文件内容。
  - 补充：`curl -s -X POST .../api/scan -d '{"id":"../x"}'` → 400 `pet-name-dot-prefix`
    （JSON 体内的逃逸 id 由白名单校验拒绝，vitest routes.test.mjs 已锁）。
- [ ] 8.2 `curl -s -X POST 'http://127.0.0.1:3080/dyn-pet-foxbell/api/delete' -H 'Origin: https://evil.example.com' -d '{"id":"x"}'`
  - 预期：400 `origin-forbidden`。
- [ ] 8.3 `curl -s 'http://127.0.0.1:3080/dyn-pet-foxbell/pets/foxbell/voice/general/<encodeURIComponent(真实文件名)>'`
  - 预期：200 audio/mp4 字节（中文文件名路由正常）。
- [ ] 8.4 错误响应形状抽查（任一失败请求）
  - 预期：统一 `{code, params, detail}` JSON；客户端对话框内联文案为 zh/en 字典映射
    （浏览器语言 en 时全英文界面文案）。
- [ ] 8.5 symlink 不逃逸（NOTES D23 修复的实机复核）
  - 步骤：`mkdir -p /tmp/outside-pet && cp <本仓库>/assets/spritesheet.webp /tmp/outside-pet/ &&
    ln -s /tmp/outside-pet ~/.dsh/foxbell-pet/pets/linked`，然后
    `curl -s 'http://127.0.0.1:3080/dyn-pet-foxbell/pets/linked/spritesheet.webp' -o /dev/null -w '%{http_code}'`
  - 预期：404（pet-not-found JSON）；`GET /pets` 列表不含 `linked`；设置卡切换对话框不出现
    该条目；`POST /api/activate {"id":"linked"}` → 404。清理：`rm ~/.dsh/foxbell-pet/pets/linked`。

## 9. 参考仓库只读复核（MAM / harness 均为只读参照，勿写入）

- [ ] 9.1 `git -C <MAM 仓库路径> status --porcelain` → 空
- [ ] 9.2 `git -C <harness 仓库路径> status --porcelain` → 空

## 10. v2.4.0 子代理用量并入（Issue #9）真机验收

> 修复内容：看板 token 统计此前只算 `agents.roots()` 的主会话；现经 `sessionQuery`
> 全语料采集（`src/host/corpus.js`）并入子代理与已收尾会话。本节验收「并入正确 +
> 宠物 UX 不回退 + 边界不双计」。symlink 安装下未提交的工作树改动即时生效。

- [ ] 10.0 前置
  - 步骤：仓库根 `npm run build && npm run validate && npx vitest run`（预期 VALIDATE OK /
    420+ 用例全绿；注：本机 `test/host-index.test.mjs` 因 schemastery 环境问题在干净树上
    也导入失败，属已知噪声，不计入）；`dsh plugin --profile web add <本仓库绝对路径>`
    （若已装 release/main 通道版本，先卸载再装本地路径，命令以 `dsh plugin --help` 为准）；
    重启 `dsh web` + 浏览器硬刷新（Cmd/Ctrl+Shift+R）。
- [ ] 10.1 服务接线与启动收敛（观测点：`/state` 的 `diag.corpus*`）
  - 步骤：DevTools → Network 过滤 `dyn-pet-foxbell`，找全量 `/state` 响应（非 unchanged），
    查看 `diag.corpusAvailable` 与 `diag.corpus`；重启后每 ~10s 刷新观察 1–2 分钟。
  - 预期：`corpusAvailable === true`（false = 宿主缺 sessionQuery，静默降级旧口径——
    先解决环境再继续）；`diag.corpus.folds` 每 10s 一批（每批 ≤25，冷读预算）增长后稳定
    在「近 32 天非根会话数」量级；同窗口 `dashboard.usage.grandTotal` 阶梯式上涨后稳定。
- [ ] 10.2 核心验收：子代理扇出用量进「今日」（Issue 定案判据复刻）
  - 步骤：① 记基线 A = 悬停宠物（或右键「🏷 今日用量」）迷你条的「请求输入」，精确值可
    curl `/state` 取 `dashboard.usage.day.{inputTokens,cacheReadTokens}` 之和；
    ② 主会话发扇出指令（示例：「用 Task 工具并行派 3 个子代理，分别把三段不同的长文本
    压缩成要点清单」，子代理输出量越大判据越清晰）；③ 子代理全部完成后再等 ≤30s
    （10s 采集周期 + 活→冷终读），取读数 B。
  - 预期：B − A 包含全部子代理用量（重度扇出时显著大于主会话自身增量）；宠物状态卡
    **不**出现子代理条目（scan 侧仍只认主会话）；`usage.trend` 当日桶与 hero 同步变大
    （同一整点内趋势图也刷新——trend 门修复点）；看板「7 天」hero 同步包含该增量。
- [ ] 10.3 独立口径对照（有逐事件复算工具时执行）
  - 步骤：重跑 Issue #9 第二节的核对（主会话 / 主+子 分开统计），与插件 7 天 hero 对照。
  - 预期：hero ≈「主+子」合计（修复前 ≈ 仅主、低约 59%）；5 小时窗 hero 同理一位对上。
- [ ] 10.4 fork/续跑不双计（谱系继承前缀切片）
  - 步骤：选一个历史用量大的会话，在 DSH UI 里 fork/续跑（只 fork、不发新消息），
    等一轮采集（≤10s）。
  - 预期：hero 增量 ≈ 0；若瞬间跳增 ≈ 父会话全部历史量，则继承前缀双计回归。
- [ ] 10.5 重启恢复（冷读重放路径）
  - 步骤：重启 `dsh web`（或桌面端重载插件），硬刷新，观察 `grandTotal` 1 分钟内变化。
  - 预期：≤1 分钟回到重启前量级（`diag.corpus.folds` 分批重建后稳定）。
- [ ] 10.6 宠物 UX 回归扫一眼
  - 预期：状态卡只有主会话（红/黄/绿语义不变）；迷你条「本会话」行 = 最近**主**会话
    （设计如此）；审批提醒 / 完成未读 / pace 档位 / 双击语音 / 位置记忆均正常；
    Console 无新增报错，`/state` 仍 1.5s 一轮。
- 已知预期行为（非 bug）：首轮收敛完成时，日阈值/里程碑警报可能相对启动前「跳档」补发
  一次（历史存量并入，数字真实、按日去重只发一次）；创建于 32 天窗口外的**冷**历史不计入
  （trend 14 日 + 区间 31 日的外沿）；宿主无 `sessionQuery` 时静默降级为旧口径
  （`diag.corpusAvailable` 为 false）。

## 11. 双页看板：设计逐项对照与本机验收

对照《Foxbell：Token 用量、API 等效费用与 DSH 输出速度》§1–§6。下表的自动用例在 Node 中运行；宿主和浏览器项目单独记录，不能用模拟服务或测试总数替代。正式验收使用同一份本地构建，Web 与官方桌面分别记录版本、profile、输入和结果。

| 设计条目 | 本分支实现与自动证据 | 待本机验证 |
| --- | --- | --- |
| §1 范围和原功能 | `Pet.tsx`、`index.tsx`、`dashboard-entries.ts` 沿用主列入口；`dashboard.test.mjs` 保留 80%/100% 日限额回归。未引入其他采集器、独立应用或真实账单；别名绑定、记录中心等暂缓项不在本版范围。 | 右键、迷你条详情→黑板、黑板→主列；会话切换、语音、旧设置和实际提醒。 |
| §2.1 用量看板 | `DashboardPanel.tsx`、`UsagePanel.tsx`、`dashboard-view.ts`：默认用量页，五块依次展示，局部趋势不改变全局；`usage-view.test.ts` 对照分组、筛选及 Token-only 导出。 | 页签返回保存状态，分布/费用默认展开，活动默认折叠；同源不同模型及同模型不同供应商；Top 5/展开、旧复制及评语图的实际内容。 |
| §2.2 速度看板 | `SpeedPanel.tsx`、`SpeedChart.tsx`、`speed-view.ts`、`session-speed.ts`：独立范围、按主列宽度排组合和指标；`speed-view.test.ts`、`session-speed.test.ts` 检查筛选、空桶断线和停轮询。 | 主列 1280/680px，中英文和深浅主题；实际键盘焦点、悬停/固定/Esc、无匹配后清除、加载和空态；用量页切换不影响速度范围。 |
| §3.1 原生测速 | `speed.js`、`local-clock.js`、`state.js`：当前用原生投影，历史按可靠结算；`fusion-host.test.mjs`、`speed.test.mjs`、`retry-attribution.test.mjs` 对照加权、有/无可信时间、DST、24h 边界。 | 两条不同耗时的真实结算核对 TPS；切会话即清旧值，TTFT、模型和工具用时只反映可归属事件，当前会话不混入历史。 |
| §3.2 用量归属 | `usage-facts.js`、`corpus.js`、`usage-window.js`：四桶、原生身份去重、冷读预算与覆盖提示；`usage-facts.test.mjs`、`corpus-usage.test.mjs`、`fusion-host.test.mjs` 核对重放、失败用量与窗口。 | 真实子代理/已收尾会话、retry、普通 fork 对账，未知路由不猜，冷读结束与数据缺席明确区分。 |
| §4.1–§4.2 计价和币种 | `price-rules.js`、`cost.js`、`PriceRulesDialog.tsx`：定点累计、固定/分时、逐桶回退、双币种；`price-rules.test.mjs`、`cost.test.mjs`、`fusion-host.test.mjs` 涵盖跨夜、跨进程陈旧 revision 与失效写者、缺价及微额。 | 从行内打开编辑，核对显示的时区、规则和单价；填写 0、留空、跨午夜与保存失败，切币种看真实来源和精度。 |
| §4.3 价格同步 | `price-catalog.js`、`CostPanel.tsx`：公开价格和汇率查询，保留最后有效快照；`price-catalog.test.mjs` 以受控响应验证成功、失败和并发。 | 真实网络/断网/无 FX，核对日期和错误；价格失败不阻塞用量或速度，自动、过期与手动刷新都检查。 |
| §4.4 CSV 与既有导出 | `dashboard-routes.js`、`cost-csv.js`、`UsagePanel.tsx`、`usage-export.ts`：同次估价输出固定 USD CSV，旧导出无金额。`cost-csv.test.mjs`、`cost.test.mjs`、`targeted-time-cost.test.mjs`、`targeted-review.test.ts` 验证列、日期、固定 USD 来源、折叠及同范围快照。 | 真实下载（不只看按钮）：切到当前范围后晚到旧同步不换内容；折叠、币种、Top 5 和趋势选择不改变同一快照 CSV。核对 19 列、缺价行和无总计。 |
| §5–§6 宿主与组合验收 | `host-auth.js`、`index.js`、`routes.js`：新增路由由宿主 owner 和可选能力门控，旧路由不迁移。`host-index.test.mjs`、`dashboard-routes.test.mjs` 覆盖增量状态及冷读、解绑与重挂、能力缺席、卸载期间阻止写入和拒绝。 | rc.5 Web + 官方桌面、新配置冷启动、owner 与非 owner、真实双页和卸载；0.1.2-rc.1 Web／0.2.0-rc.2 桌面保底，无 UI profile 不挂载。 |

**本机执行顺序**：先用隔离 profile 开启 rc.5 Web 与官方桌面，确认从原入口进入新双页；再在同一会话数据下核对用量和速度，下载 CSV 和自定义评语图。跑旧版矩阵之前先确认新宿主的冷启动、能力晚到和卸载行为。不要用日常 DSH 配置，也不要把尚未执行的矩阵标为通过。

### 11.1 证据状态与条件数据

- 上表「本分支实现与自动证据」为源码及自动层；最后一列在本轮未启动 DSH 前均是**待手测**，不记真机通过。§1 的设计排除项/暂缓项记为**范围外**。
- §4.2 的「只有可信日聚合、无法恢复时段」已覆盖估价内核的低谷回退，但生产路由目前只接入有可证时间的 DSH 用量事实。当前尚未验证目标宿主提供可接入、可去重的可信日档，因此这条标为**内核已测、生产入口未验证**；不会把事件缺时间直接当成低谷价格。
- 授权服务、会话投影、冷读覆盖、R4 截图及本机 UI 是不同证据。只读复核已完成；安装、真实 CSV 文件对账、真实键盘命中和完整宿主矩阵均需在正式 DSH 环境中实际执行。

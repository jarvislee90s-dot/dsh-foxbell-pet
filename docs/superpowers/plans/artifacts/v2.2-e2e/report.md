# v2.2.0 用量看板 E2E 真机验证报告（artifacts/v2.2-e2e/report.md）

- 日期：2026-09-12
- 环境：dsh web @ dsh-v0.1.5-rc.2（harness @ fb2c4b9e69，树干净，仅 gitignore 范围 .zcode/）；profile `~/.dsh/profiles/web` 的 dsh-foxbell-pet local link → 本分支工作树；端口 3080。
- 插件：feature/v2.2-usage-dashboard @ f382741（四绿）；服务日志确认 `[foxbell-pet] host mounted: sprite=2654210 builtinVoices=31`。
- 工具：Playwright（真实鼠标点击/右键/拖拽 + 截图）；所有点击均为真实 hit-test 点击，未用合成事件。

## 结论

12 项中 9 项 PASS、2 项 PARTIAL、1 项 PARTIAL-FAIL；过程中发现并修复 2 个真机缺陷（1 Critical + 1 路由级）。已修复后复验通过。

## E2E 发现并已修复的缺陷

1. **[Critical] 客户端整插件加载失败**（ca8b68f 修复）：`ctx.get("layout")` 对未声明服务抛 `cannot get property "layout" without inject`，整插件 apply 失败、宠物不挂载（首屏截图呈 "Failed to load plugins: dsh-foxbell-pet"）。修复：layout 改 `ctx.inject(["layout"], cb)` 可选注入（cordis 服务在场才回调，缺席静默降级——spec R6 预案）。修复后宠物正常挂载、selectPanel 切面板实测可用。
2. **[/sounds 路由 404]**（f382741 修复）：Task 6 注册路径带尾斜杠 `.../sounds/`，真机 harness matcher 语义为 `p === prefix || p.startsWith(prefix + '/')`，尾斜杠注册永不匹配（vitest 假派发较宽松故测试未拦）。修复：去尾斜杠 + 测试假派发对齐真机规则（RED 复现后 GREEN）。修复后 `/sounds/alert-1.wav` → 200 audio/wav 30034B，穿越 → 400，坏文件名 → 404。

## 逐项结果

| # | 项目 | 结果 | 证据/说明 |
|---|---|---|---|
| E1 | 服务+插件加载 | **PASS**（修复后） | E1-load.png：宠物渲染、主界面正常；console 无 foxbell 报错（仅无关插件 dsh-emoji 405 ×2 与 git-graph warning） |
| E2 | L1 迷你条钻取 | **PASS** | E2a：悬停出迷你条（五口径行 + 「详情 »」）；真实点击「详情 »」→ E2b：黑板开、迷你条消失（互斥）；详情外区域由 v2.1 继承 wrap 层承接（CSS 与 main 逐字节一致，非 v2.2 变更面），`.dyn-pet-mini` 保持 pointer-events:none、仅详情按钮 auto |
| E3 | 黑板加料+锚定 | **PASS** | E2b：sparkline（7 日蓝紫渐变）/模型行（无数据正确跳过）/「查看完整看板 →」三行齐全；黑板锚定宠物左侧 `petX−310−12`（实测 x=617.2 精确）、拖拽跟随（E3b）、宠物拖至左缘时右翻转 `petX+petW+12`（实测 286.9 精确）；✕/15s TTL 关闭后悬停恢复迷你条（TTL 实测复现） |
| E4 | L3 大看板 | **PASS** | E4a：五分区完整（头部选项卡+hero+五口径网格+渐变趋势图+模型/工具卡）+ 口径脚注「纯 token · 含子代理 · 本地聚合」；周命中行「本周命中 X%（上周 Y% · ±Z.pt）」；5 小时视图 x 轴=01:00–05:00 五个完整整点桶（进行中小时正确排除）；30 日视图走 /dashboard/range 日轴（E4b/E4c） |
| E5 | 自定义范围 | **PASS** | 设 from=2026-07-01（73 天）→ 钳到 2026-08-13（至 09-12 恰 31 天含首尾）+ 提示「已截断为最近 31 天」，无 400（E5-custom-clamp.png） |
| E6 | 模型分布对账 | **PASS**（数据核级） | 真机会话事件重放 → 出仓 foldUsage 与官方 tokenUsage totals 四口径 diff 全 0（见 reconciliation.md）；byRoute 内部一致（路由和=grand、请求数和=requestCount）；识别 3 条路由。偏差：本环境无活跃用量（见「环境限制」），L3 模型行呈「暂无数据」空态 |
| E7 | 右键菜单 | **PASS** | E7a：右键出全量 v2.1 菜单 + 新「📈 用量看板」项；真实点击 → 菜单关、L3 开（E7b） |
| E8 | 侧栏入口门控 | **PARTIAL-FAIL** | 设置卡 3 项渲染正常（E8a）、保存链路通（muted 与 dashboardSidebarEntry 两次 update 均在线上抓包证实、yaml 落盘 `dashboardSidebarEntry: true`）；重启后 gate 读值为 true；但 sidebar.panellist 图标不渲染（DOM 无 .dyn-pet-sideicon）。注册形状与 slot-catalog 示例逐字一致、无 console 报错，疑似子槽声明生命周期/投影问题，需上游排查。退化路径可用：右键菜单与黑板链均直达 L3 |
| E9 | 警报音效 | **PARTIAL** | 3 枚合成 chime 经 /sounds 实测可播（0.34/0.34/0.42s，与配方时长一致）；警报链（四组齐→general 语音，否则 chime；muted 短路）代码级评审通过。完整 day-warn 触发需真实用量跨越阈值，本环境无法生成（见环境限制） |
| E10 | 导出图片/复制文本 | **PASS** | 「复制文本」抓包内容含五口径全部行+模型段；「导出图片」真实下载 PNG（E10-export.png）：1200×675、标题/hero/蓝紫渐变趋势线/口径网格/宠物立绘+评语气泡（评语池 total===0 规则命中「今天还没开工，日志本空空的。」） |
| E11 | P3/P4 生效 | **PASS**（P3）/ **PARTIAL**（P4） | P3：16s 连续 11 次轮询全部 unchanged、恒 122B、间隔 ~1507ms（对照全量 14,513B）；服务端实测 unchanged 均值 0.62ms vs 全量 0.76ms。P4：visibilitychange 监听已注册（bundle 证实）+ 降频逻辑单测钉住；自动化浏览器无法真实切后台，5s 间隔未做运行时测量 |
| E12 | 降级回归 | **PASS** | 状态卡（session id + 本轮运行失败 + 时长，随宠物锚定）；右键菜单全量 v2.1 项；黑板 TTL/✕；迷你条五口径行名词与排版未动。滚轮穿透/双击气泡/隐藏为不变面（代码零改动，v2.1 E2E 基线沿用） |

## 性能抽查

- 轮询节奏：客户端 16s 实测 11 次请求，间隔 1505–1508ms（1.5s 契约保持）。
- `/state` unchanged 短路：载荷 134B vs 全量 14,513B（−99.1%）；服务端时延均值 0.62ms vs 0.76ms（20 次采样，min/max 0.49–0.85 / 0.60–1.04ms）。
- P1 增量缓存：`stats.rescans` 指纹命中单测钉住；空闲下 compute 降为廉价操作（趋势/小时桶整点节流，TrendCache 引用恒等单测）。
- 空闲 CPU 影响：0.62ms/1.5s ≈ 单核 0.04%（服务端），客户端解析开销随载荷 −99.1% 同比下降。

## 环境限制（影响 E6 展示面 / E9 完整触发 / E11 P4 运行时测量）

- 本地源码版 harness 缺 `native/system/packages/darwin-arm64/bin/system.node`（flock 原生件，来自 GitHub release 产物，本机无 .release 缓存），任何 agent 会话启动即报 `本轮运行失败 Cannot find module … system.node`（E12-error-card.png 佐证）→ 无法产生真实 token 用量。
- 因此：L3 模型/工具/趋势在真机上呈零值空态（数据核正确性由 E6 重放对账闭环）；E9 阈值跨越无法自然触发；P4 隐藏降频无法运行时测量。
- 附带收益：该失败轮次恰好真机验证了 v2.1 状态卡报错链路（E12）。

## 检验产物清单（本文件夹）

E1-load.png, E2a-minibar-hover.png, E2b-board-open-mini-gone.png, E3a-after-drag.png, E3b-board-follows-drag.png, E4a-panel-7d.png, E4b-panel-5h.png, E4c-panel-30d.png, E5-custom-clamp.png, E7a-context-menu.png, E7b-menu-item-opens-panel.png, E8a-settings-3items.png, E8b-sidebar-icon.png, E10-export.png, reconciliation.md, report.md

（约定：本文件夹仅随分支供评审，合并 main 前整体删除；CHANGELOG/README 不引用其中文件。）

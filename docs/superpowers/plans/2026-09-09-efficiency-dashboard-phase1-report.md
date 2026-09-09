# 效率看板一期 执行报告（v1.4.0）

- 分支：`feature/efficiency-dashboard-p1`（自 main @ 8d51894 切出，21 个提交）
- 执行方式：subagent-driven development——每任务独立实现者 + 任务级双裁决审查（spec 合规 + 代码质量），共 20 轮任务审查 + 4 轮修复复审 + 1 轮全分支终审
- 执行依据：`docs/superpowers/plans/2026-09-09-efficiency-dashboard-phase1.md`（15 任务）；裁决依据：`docs/superpowers/specs/2026-09-09-efficiency-dashboard-brainstorm.md`
- 终验：`npm run build && npm run validate && npm test` 三绿（23/23 测试通过）；src↔lib 三文件字节一致（validate 现已覆盖 dashboard.js，含负向测试证明）

## 1. 任务号 × commit hash × 测试结果对照表

| 任务 | commit | 测试结果 | 审查结论 |
|---|---|---|---|
| T1 基建 + sessionEvents 双兼容 | `67d8759` | 3/3（TDD RED→GREEN）；三绿 | Spec ✅ / Approved |
| T2 derivePaceTier 档位引擎 | `2be89dd` | 9/9；三绿 | Spec ✅ / Approved |
| T3 foldUsage 三分账 | `9eaab30` | 14/14；三绿 | Spec ✅ / Approved |
| T4 evaluateAlerts 阈值阶梯 | `0b838be` | 20/20；三绿 | Spec ✅ / Approved |
| T5 ageLabel + summarize | `c1e800c` | 23/23；三绿 | Spec ✅ / Approved |
| T6 宿主集成 /state + Config | `3593d8f` + 修复 `2400d99` | 23/23；三绿 + stub 宿主功能性 /state 实测（契约逐字段、警报一次性、三门控） | 修复复审 ✅ / Approved |
| T7 客户端配置管道 + 右键三项 + 会话一览 | `0e0f187` | 23/23；三绿 + sanitize/clampNum 行为验证 | Spec ✅ / Approved |
| T8 档位接入动画 | `d28d32a` | 23/23；三绿 + 优先级链推演 | Spec ✅ / Approved |
| T9 年龄标注 + 审批直达确认 | `bb36293` | 23/23；三绿 | Spec ✅ / Approved |
| T10 悬停迷你条 + 节奏表盘 | `c3a0fda` | 23/23；三绿 | Spec ✅ / Approved |
| T11 举牌 + 语音三优先级 | `5ab4485` + 修复 `1cfad84` | 23/23；三绿 | 修复复审 ✅ / Approved |
| T12 小黑板 + 入口 + 关宠分发 | `55e5f07` + 修复 `23d97da` | 23/23；三绿 | 修复复审 ✅（2 Important 已修）/ Approved |
| T13 标题闪烁 | `294fdba` | 23/23；三绿 | Spec ✅ / Approved |
| T14 ESC 分层 + 滚轮穿透 | `bf11f94` | 23/23；三绿 | Spec ✅ / Approved |
| T15 v1.4.0 收尾（版本/CHANGELOG/README） | `a65b530` | 23/23；三绿 + 版本串一致性 | Spec ✅ / Approved |
| 自检对齐 spec（7 处，见 §3） | `4a3530f` | 23/23（含新增耗时断言）；三绿 | — |
| 二期接口预留（见 §5） | `b73a37d` | 23/23；三绿 | — |
| 终审合并前项（validate 补 dashboard.js） | `7ed191d` | 23/23；三绿 + 负向测试（篡改 lib → VALIDATE FAILED） | — |

注：T7–T14 为客户端任务，仓库测试集（node --test）只覆盖宿主纯函数，客户端以「三绿 + purity 检查 + stub 宿主浏览器 QA（§4）」验证。

## 2. 与计划的所有偏差及原因

计划自身矛盾/缺口（执行中裁决并记录，均为使实现符合计划自身声明或 spec）：

1. **T6 `agg5m` 窗口锚定 `now`**（`2400d99`）。计划代码草图调用 `events5mCount(cache, m.lastEventTime)`，但计划对该函数的**定义**是 `e.time > now - 300000`（无锚点参数），spec 6.1 亦为「近 5 分钟」。按草图调用会让数小时前静默会话的尾巴永久计入全局强度。以计划定义 + spec 语义为准。
2. **T8 `tierAnim()` 置于 `s.task` 之前**（`d28d32a`）。计划字面链 `s.task || tierAnim() || …` 使 tierAnim 成为死代码（tierAnim 仅在 `task==='running'` 时非空，`s.task` 必先短路），与计划自身声明的产出「task==='running' && tier==='longrun' → 播 waiting」矛盾。换位后 tierAnim 只覆写纯 running 态，审查确认无新优先级反转。
3. **T6 `latestSession` 取扁平形状**。计划 Interface 契约定义 `usage.session = {title, 四键} | null`（扁平），而草图代码嵌套 `usage`。契约是客户端 T10 MiniBar 的消费依据——以 Interface 为准。
4. **T6 `scanSession` 共享事件数组**（第三参传入，单次采集）+ 复用既有 `decidedIds` 集过滤 pendingList + 用 schema 解析后的 `entry` 读配置（`apply(ctx, config)` 的 `config` 是原始值，默认值在 `entry`）——均为计划「实现注意」授权范围内的落地选择。
5. **T11 警报语音不叠加字幕气泡**（`1cfad84`）。计划代码 `playVoice(v, a.text, …)` 会经既有字幕逻辑把警报文本同时放上气泡，违反 spec 6.2「举牌 + 可选语音，不叠加字幕气泡」（轮 5 用户裁决）。`playVoice` 增加 `noBubble` 参数，警报调用传 true；其余调用点行为不变。当前为潜伏矛盾（无 usage 语音资产），资产加入即触发，故提前修复。
6. **T12 📖 入口与语音解耦**（`55e5f07`）。计划「handleCompletions 末尾追加」会把入口触发放在 `if (!v) return`（无语音资产即早退）之后，违反 spec 6.4「任务完成事件 → 限时入口」。移至 `first.agentId` 守卫之后、语音逻辑之前。
7. **T12 修复两处计划缺陷**（`23d97da`）：① 📖 入口从 fragment 层移入主 root 内（`.dyn-pet-entry` 的 absolute 偏移以 192×208 root 为锚；spec 6.0/6.4「宠物旁」+ 计划 CSS 注释自身要求；原位置会锚定到宿主覆盖层容器）；② 黑板 ttl 统一（`openBoard`/`closeBoard` 集中管理定时器）——spec/计划 QA 步骤要求黑板每次出现都「停留 boardTtlSec 自动消失」，计划草图只在 farewell 路径设了 ttl，且该定时器跨模式泄漏；另修入口 ttl 定时器堆叠。
8. **自检批次 7 处**（`4a3530f`，详见 §3）。
9. **二期预留使 dashboard 契约增量扩展**（`b73a37d`）：`usage.models: {}` 空桶（目标书第 3 节显式要求）；Board/MiniBar 行结构数组化（渲染输出逐字节不变）。
10. **终审合并前项**（`7ed191d`）：validate 的 src==lib 字节检查循环补上 dashboard.js（终审裁定唯一合并前必改项，已附负向测试）。
11. **流程偏差**：本会话 Agent 工具无模型参数，子代理均继承会话模型（技能的 Model Selection 章节无法执行）；T15 Step 2 全量手工 QA 所需的 dsh web 宿主未运行（3080 端口无响应，18789 为无关 SPA），以 stub 宿主浏览器 QA 替代（§4）。

## 3. 自检（只读 spec 找矛盾）发现与修改清单

关上计划文档、只读 spec（6.0–6.6、第 7 章）逐项核查交互歧义、容器分工、浮窗互让、配置语义、每目标单行为，发现 7 处实现-spec 矛盾，一次提交 `4a3530f` 修复（全部三绿 + 复审）：

| # | 矛盾 | spec 依据 | 修改 |
|---|---|---|---|
| 1 | 黑板工具 Top3 只有次数，无耗时 | §6.4 指标集「工具调用 Top3（次数+耗时）」、§3.1 F31 | 宿主 scanSession 以 callId 配对 tool/call↔tool/result 计时长（harness rc.1 契约已核实：`message.source.callId`/`content[0].toolCallId`）；summarize 渲染 `bash×5（共 18.0 秒）`；补测试；CHANGELOG/README 同步 |
| 2 | 里程碑警报走举牌 | §6.2 表现面 3「一句话气泡」+ 三形态规则「一句话（里程碑）→ 气泡」（谱系#4 的「里程碑数值」措辞从两者） | 客户端按 kind 分流：milestone → 气泡，day-warn/day-hit → 举牌；语音链不变 |
| 3 | 设置卡无 token 口径说明 | §7.3 / F71「纯 token 口径在设置卡说明」 | 设置卡尾行「用量均为纯 token 口径，不折算金额」 |
| 4 | 关闭「节奏档位」后动画仍按冻结的旧档位走 | 配置开关语义（用户关闭应停用） | 宿主 `pace: entry.paceEnabled ? paceState : null`；客户端清 paceRef/pace；MiniBar 档位兜底显示「—」 |
| 5 | 关闭「用量统计」后迷你条仍显示用量行 | 配置开关语义 | MiniBar 增 `usageOn` prop，仅门控「今日/本会话」两行；状态计数行（组件③ roll-call）不受其管 |
| 6 | dashUiRef 同步被 `dash.pace` 条件包住（T13 审查发现） | T10 意图「保存最近一次 r.dashboard」 | `if (dash)` 独立同步 + forceMini |
| 7 | 右键状态卡/📖入口会弹菜单（根节点 contextmenu 冒泡） | §6.6 规则 8「右键响应范围仅宠物本体」 | 卡片与入口 `onContextMenu` stopPropagation |

另核查后**判定不改**并在 §5 记录的：ESC 顺序在「隐藏迷你条层」上的消耗（计划全局约束钉死 ESC 顺序 迷你条→黑板→菜单，与互让规则 1 的「黑板优先」存在 spec 内部张力——按计划执行并记录）；里程碑多倍跳跃只播最高档（spec 只要求一句话、不轰炸，行为合理）。

## 4. 手工 QA 结果（stub 宿主浏览器，被测对象 lib@b73a37d）

环境说明：dsh web 宿主未运行，搭建了 stub 宿主页（React 18.3.1 UMD + 假 slots/sessions/fetch + 可变 /state），由浏览器逐场景驱动。IAB 面板在工具调用间会隐藏页面，Chrome 对隐藏页计时器闩锁降频（客户端 1.5s 轮询在长命页面实例上停滞）——纯环境现象，按测试组重载页面规避；真实宿主中页面可见无此问题。

| QA 步骤 | 结果 | 证据 |
|---|---|---|
| 1 悬停迷你条 | ✅ | 悬停 ~0.5s 出现（档位「活跃」+ 表盘 + 「今日 136.3万 · 本会话 22.7万」+ roll-call「1 等审批 · 1 运行 · 1 完成」+ 会话标题）；移开消失；右键「今日用量」手动开；ESC 关 |
| 2 阈值举牌/里程碑 | ✅ | day-warn 举牌「🏷 今日 token 已用 80% · 12.3万」、milestone 走气泡（容器分工）；4.2s 牌面时限；同 id 重发不重播（宿主跨阈值一次性另有单测）；TTS/静默降级链路经代码审查（stub 无音频资产，听感 N/A） |
| 3 标题闪烁 | ⚠️ 部分 | 页面可见时正确**不**启动（含 waitMin=6 ≥ 阈值）；「页面不可见才启动/恢复」路径无法在 IAB 模拟（页面始终报告 visible），代码逐字实现经审查，留待真机 |
| 4 黑板/入口/farewell | ✅ | 完成事件→📖 入口→点击展开黑板（会话/turn/报错/三分账/工具Top3次数+耗时/最长turn）→✕ 关闭→右键唤回→15s 自动消失→隐藏桌宠→「今日收工 🦊」farewell→自动消失→宠物保持隐藏 |
| 5 档位动画 | ✅ | 对照实验：无审批时 running+longrun → 看表行(row6)，tier 改 active → 工作行(row7)；摸鱼档环视被抑制（9s 仅 idle 行），对照组（active）环视恢复(row9)；全程不变速 |
| 6 卡片年龄标注 | ✅ | 首行行尾灰色 12s/3m；空串不显示；轮询更新（45s 出现）；点卡片 sessions.open 跳转被调用 |
| 7 会话一览 | ✅ | 子页列出全部会话+状态色点；点击跳转（sessions.open 调用记录）；返回主菜单 |
| 8 回归 | ✅ | 滚轮穿透（sprite 上滚 → 页面 scrollY≈120，宠物不劫持）；卡片右键不开菜单、本体右键开菜单（规则 8）；ESC 分层（手动迷你条→黑板→菜单逐层剥离）；拖拽物理（方向动画+惯性+落点 x 持久化 localStorage）；双击语音 N/A（stub 无语音资产）；四场景动作绑定代码零改动 + ActionPage 正常打开 |

## 5. 已知降级清单 + 二期接口预留清单

**已知降级**（均已在 issue #4 或本报告挂账）：

- 姿态专属动画行（狂奔/擦汗/看表/咸鱼四阶）缺图集：longrun→`waiting` 看表代用、loaf→抑制环视、不变速 → issue #4「姿态专属动画行」
- F05 按模型分布：harness 事件暂无 model 字段 → 一期 `usage.models` 空桶 → issue #4「F05」
- 审批锚点直达为会话级（sessions.open 后审批命令在会话视图内可见，无滚动定位）→ issue #4「审批锚点直达增强」
- 标题闪烁页外启动/恢复路径待真机 QA（本环境无法模拟页面 hidden，见 §4 步骤 3）
- 双击语音听感、usage 语音组听感未验证（stub 无音频）；语音三优先级降级链（组音频>TTS>静默）经代码审查与 pickVoice 空组降级逻辑覆盖
- 终审裁定的非阻塞后续项（全部「acceptable-as-is」，随二期处理）：sign 定时器不取消（连续警报可截断 TTL）、ESC 对隐藏迷你条层的消耗、滚轮转发缺 preventDefault/deltaMode（当前宿主布局无 body 滚动，潜伏）、foldUsage 缺 time 字段守卫、BOOL_KEYS 死代码、Board ttlSec 死 prop、宿主侧数字不钳制（设置卡为正常路径）、拖拽松手 0.5s 恢复悬停未实现（计划级缺口，spec 6.6 规则 3 后半）、en README 档位措辞微调

**二期接口预留**（`b73a37d`，每个预留点带 issue #4 条目注释）：

| 预留点 | 位置 | issue #4 条目 |
|---|---|---|
| `usage.models` 模型维度空桶 | src/index.js dashState.usage | F05 按模型/供应商 token 分布 |
| 黑板 summary 行可插拔（rows 数组） | src/client.js Board | F38 周报 / F40 缓存率趋势 / F41 失败率 / F42 耗时漂移 / F45 导出 |
| 迷你条数据行可扩展（sparkline 位） | src/client.js MiniBar | F10 sparkline 迷你趋势 |

## 6. 完整性核对声明

- 计划 15 任务逐项完成并经任务级双裁决审查；全分支终审（含 14 项 Minor 裁量）结论 **With fixes**——唯一合并前项已修复并验证（`7ed191d`），其余裁定为非阻塞后续项（§5）。
- 硬约束核对：纯 JS 无转译 ✓；client.js 仅 `require('react')`（每任务 purity 检查）✓；纯 token 零金额 ✓；宠物上无 prompt 原文/代码/密钥（终审复核新表面仅数字/标题/工具名/时长）✓；installSettingsSection 与 package.json `dsh.client` 声明未动 ✓；localStorage 三键未改名、轮询 1.5s、路由前缀不变 ✓；每任务三绿后提交 ✓。
- 交互规则以 spec 6.6 为准：单击每目标唯一行为、悬停纯读取（迷你条零可点元素 + pointer-events:none）、拖拽无附加命令、ESC 分层关闭、宠物区滚轮穿透——终审逐条核验通过。

## 6. Review 处置记录（2026-09-10，独立审查后修复）

独立审查结论：0 Critical / 3 Important / 7 Minor，判定 With fixes。三条 Important 经复核全部属实，已修复并补回归测试（25/25 通过，三绿）：

1. **跨天日阈值警报静默**（Important #1）：`day-warn`/`day-hit` 恒定 id + 客户端 `seenAlertsRef` 页面生命周期去重，长驻 SPA 次日同档警报被永久跳过。修复：`evaluateAlerts` 增加可选 `dateKey` 参数拼入 id（`day-warn:2026-09-10`），宿主调用侧传入 `dayKey`。回归测试：不同日键产生不同 id。
2. **dsh.plugin.json 版本漏更**（Important #2）：1.3.0 → 1.4.0。
3. **宿主侧配置门冻结在 apply 快照**（Important #3）：`setSource: () => {}` 丢弃了 dsh-settings 的 live getter，设置卡改 `paceEnabled`/`dayLimitTokens` 等宿主门不生效直至重载。修复：接住 getter（`configSource`），聚合时读 live 值并逐键回退 schema 默认（`cfgB`/`cfgN`）。
4. **顺手加固**（Minor #5a 前半）：`foldUsage` 对无 `ev.time` 的样本加守卫，杜绝 `byDay['NaN-NaN-NaN']` 桶。回归测试补齐。

Minor #4/#5b/#6/#7/#8/#9/#10（同轮双跨覆盖显示、死代码清理、滚轮 preventDefault、黑板锚定跟随宠物、拖拽后悬停恢复、增量扫描、测试缺口）未在本期处理，已归档至 issue #4 评论跟踪；其中黑板锚定与悬停恢复为 spec 6.6/6.4 与计划草图之间的张力项，按 spec 语义应在二期补齐。

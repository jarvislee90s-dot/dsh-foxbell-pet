# dsh-foxbell-pet 交互娱乐性升级（借鉴 dsh-niulai-pet）设计文档

日期：2026-08-18
状态：已批准（brainstorming 三节确认）
目标版本：v1.3.0

## 背景与目标

foxbell 是工作助手型桌宠（多项目状态监控 + 完成语音提醒）。本次升级在**维持狐狸形象与现有提醒功能不变**的前提下，借鉴 dsh-niulai-pet 的娱乐性与可交互性：

1. 右键菜单 + 丰富单宠交互（戳反馈、表演一下、物理手感）
2. 设置卡片（dsh settings 配置持久化，rc.7+）

用户明确排除：多皮肤、多只 + 物理碰撞 + 全家福、语音停喊、自定义角色包、大小滑杆、自定义语录。

## 方案：fox 现有架构上增量扩展（方案 A）

现有"host 状态扫描 + HTTP 素材伺服 + client 轮询"架构**零删除、零重构**，纯增量添加能力；素材零改动（动画复用现有 11 行 spritesheet 图集）。依赖 +2：`@deepseek-ai/dsh-settings`、`@deepseek-ai/schemastery`。

## 第 1 节：架构与组件

```
dsh-foxbell-pet v1.3.0
├── lib/index.js        host 半（现有逻辑不动）
│   ├── 现有：素材加载 / 会话扫描 / 状态推导 / HTTP 路由  —— 原样保留
│   └── 新增：FoxConfig schema + settings 命名空间注册
├── lib/client.js       client 半（现有 Pet 组件不动）
│   ├── 现有：动画状态机/语音/轮询/项目卡片/🦊开关 —— 原样保留
│   └── 新增：
│       ├── ConfigStore（双后端：localStorage + settings scope，乐观更新）
│       ├── PetMenu（右键菜单组件，React）
│       ├── Physics（拖拽末段采样 → 松手重力 rAF → 落地压扁回弹）
│       ├── PokeFeedback（点击触发可配置动作）
│       └── SettingsCard 适配（读同一 ConfigStore）
└── package.json        依赖 +2
```

要点：
- host settings 注册用 `ctx.inject(['settings'])` 可选注入，settings 服务不在场（rc.6 及更早）时静默跳过，桌宠其余能力不受影响（照 ni 的处理）。
- 配置模型放 host（schemastery schema，`~/.dsh/settings.yaml` 持久化）；client ConfigStore 与设置卡片共用，右键菜单与设置卡片读写同一份配置、双向即时同步。

## 第 2 节：交互细节

### 右键菜单（PetMenu）

- 触发：`contextmenu` 事件（按住形象 500ms 也触发，兼容触屏），气泡在桌宠上方展开，点击外部 / Esc 关闭。
- 结构（单级菜单，深色底）：

```
🔊 声音           [开/关]      ← muted
📣 完成时喊       [开/关]      ← shoutOnDone
💬 气泡唠叨       [开/关]      ← talkative
───
🎯 完成时动作     → 子级      ← doneAction
👉 戳我动作       → 子级      ← pokeAction
🎬 表演一下                   ← 喊一句 general 语音 + 播 doneAction
───
🦊 隐藏桌宠                    ← 等效 🦊 侧栏开关
ℹ️ 关于                        ← 版本 + 素材说明
⚙️ 设置                        ← 打开 dsh 设置页插件配置卡片
```

- 动作枚举（复用现有动画行）：`jumping`（默认完成）、`waving`（默认戳）、`failed`（委屈）、`waiting`（等待）、`review`（审查）。run 系与 idle 不进可绑定集合。

### 物理手感（Physics）

- 拖拽中记录末段指针样本（时间戳 + 横坐标，150ms 窗口）用于松手水平初速度。
- 松手：垂直 rAF 重力坠落至 `BOTTOM` 停；水平按抛掷速度惯性滑行 + 阻尼；落地压扁回弹（scaleY 0.6 → 1 缓动）。
- 坠落期间 mood 保持 drag 优先级（照 ni pet.ts fallRaf 模式），落地前不切 idle。
- 拖拽方向动画（左跑/右跑/上跳）保留。

### 交互行为调整

| 动作 | 现状 | 改后 |
|---|---|---|
| 单击（未移动） | 只挥手 | 播 `pokeAction`（默认挥手）+ 可选语音 |
| 双击 | 说话+挥手 | 保留 |
| 拖动 | 移动 | 移动 + 物理手感 |
| 右键 | 无 | 打开菜单 |
| 点项目卡片 | 切会话+已读 | 保留 |

## 第 3 节：配置模型、兼容回退与测试

### 配置模型（host schemastery schema）

```ts
FoxConfig = {
  muted:       boolean  false
  shoutOnDone: boolean  true
  talkative:   boolean  true
  doneAction:  enum['jumping','waving','failed','waiting','review']  'jumping'
  pokeAction:  enum[同上]  'waving'
}
```

- rc.7+ 走 `~/.dsh/settings.yaml`（schema 默认 < cordis entry < user 三层）；更早版本自动回退 localStorage。
- 显隐键 `dyn-pet-foxbell-visible` 保持独立 localStorage，不进设置（设备态，照 ni 的 x 原则）。
- 完成提醒主流程不变：host 扫描 → `/state` → client 差分 → done 语音 + `doneAction` 动作 + 气泡（动作从写死 jumping 改为读配置）。

### ConfigStore（client，照 ni config.ts 简化）

- `getSnapshot()/set(patch)`，乐观更新 + pending 覆盖层。
- 双后端：`localStorage('dyn-foxbell-pet:state-v1')` + settings scope。
- 首次 ready 时把 localStorage 旧值 seed 进 user 层（不覆盖已改值）。

### 兼容回退与错误处理

| 场景 | 行为 |
|---|---|
| dsh < rc.7 | settings 注册静默跳过；配置落 localStorage；无设置卡片 |
| 无 webServer（TUI） | 现有路由照旧跳过 |
| 菜单在拖拽/坠落期间打开 | 状态机 drag > menu，菜单不打断动画 |
| 语音自动播放被拦 | 现有 unlock 机制覆盖 |

### 测试

- `scripts/validate.mjs` 扩展：校验 schema 合法性、动作枚举。
- 手动清单：菜单开关生效且菜单↔设置卡片互改互见；戳/双击/拖拽手感；松手坠落压扁回弹；完成提醒仍正常（含 doneAction 切换）；旧 localStorage 迁移；rc.6 回退（无卡片但功能在）。
- demo 页面同步更新展示菜单与手感。

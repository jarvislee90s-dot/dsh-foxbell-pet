# Foxbell 桌宠：状态语音分组 + 克隆音色产出（设计 Spec）

- 日期：2026-08-18
- 范围：`dsh-foxbell-pet`（插件）+ `mock-voice`（过程目录）
- 状态：设计已确认，插件部分已实现（本地 commit，**未推送**）；语音产出待用户确认

## 1. 背景与目标

桌宠有 4 个状态灯（红/黄/绿/蓝）。目标：**红（报错）、黄（待批准）、蓝（完成）各对应一组语音**，双击播通用语音；**运行（绿）不播语音**（用户在跑时不需要提示）。每组语音放一个文件夹，可轮播（随机、组内不连续重复）。语音要**保持现有小孩音色的克隆**，贴合工作场景，且**不要引入过多复杂度**。

用户明确：
- 现有 4 条语音是小红书上找的小孩配音，不是官方语音；目标是**克隆这个音色**。
- 剪映（无声音克隆/无会员）、配音阁（讯飞付费）均不可用 → 走**电脑开源方案**（Spark-TTS）。
- **不做占位语音**（不生成与音色不符的临时文件）。
- 过程文件全放 `mock-voice/`，只有最终确认的成品进包。
- 完成并确认前**不推 GitHub**。

## 2. 目录安排

```
dsh-foxbell-pet/                         # 插件仓库（git，本地已 commit，未 push）
├── assets/voice/
│   ├── general/     双击闲聊（现有 4 条已移入）
│   ├── approval/    待批准语音（待产出）
│   ├── error/       报错语音（待产出）
│   └── done/        完成语音（待产出）
└── docs/superpowers/specs/ 本 spec

mock-voice/                              # 过程目录（非插件、不推 GitHub）
├── .venv/           Python 虚拟环境（py3.12 + sparktts）
├── reference/       参考音频（现有 4 条 + reference-16k.wav 拼接归一化版，16.16s）
├── Spark-TTS/       Spark-TTS 仓库 clone（含 cli/）
├── generated/       逐条合成中间 wav
├── final/           <done|error|approval>/ 最终成品 m4a（待产出）
├── scripts/         gen_spark.py（合成脚本，已写好）
└── README.md        流程说明（已写）
```

## 3. 语音分组与台词

- **general（双击闲聊）**：你下班了吗 / 你是世界上最好最棒的妈妈 / 今天也是很棒的妈妈哦 / 是给贝贝买了鸡腿吗（现有 4 条）＋ 可选新增：哈喽，我在呢~ / 今天也要一起加油哦
- **done（完成/蓝）**：搞定啦！ / 任务完成啦，夸夸我！ / 耶，搞定！ / 完成咯，给你一个赞！
- **error（报错/红）**：呜… 出错了 / 哎呀，翻车了… / 对不起，这次没做好… / 呜哇，失败了…
- **approval（待批准/黄）**：这里需要你批准哦 / 等你点一下确认哦 / 快来批准我嘛 / 有个请求等你通过哦

文件名即字幕（插件按文件名显示字幕）；所有情形（含红/蓝状态语音）字幕都等于实际播放语音的文件名——状态已由灯色表达，无需模板字幕。

## 4. 插件改动（已实现，本地 commit，未推送）

### 4.1 host（`src/index.js`，已改 + build 同步 lib/）
- 语音按 `assets/voice/` 子文件夹加载：顶层文件 → `general` 组；子文件夹 → 文件夹名作组（approval/error/done/…）；无 voice 目录时平铺兜底。
- 每条语音带 `group`；`/state` 的 `voices` 返回 `{ index, name, group }`；路由 `/voice/<i>` 不变。

### 4.2 client（`src/client.js`，已改）
- 新增 `pickVoice(group)`：组内随机、组内不连续重复（`lastVoiceRefs` 按组记录）；group 缺省=全部。
- 状态 → 语音/动画映射：
  - 完成（done 蓝）→ 播 `done` 组 + 高兴跳（jumping）+ 字幕 = 语音文件名。
  - 报错（error 红）→ 播 `error` 组 + 委屈动画（failed）+ 字幕 = 语音文件名；组空则只动画（无字幕）。
  - 待批准出现（approval 黄）→ 播 `approval` 组 + 等待姿态（waiting），**10s 限频**防多项目刷屏。
  - 双击 → `general` 组（回退任意）。
  - **running 不播语音**。
- 空组静默跳过（不报错）。
- 语音预加载（v1.1.1）保留：每个语音文件一个 `Audio` 元素，即时出声。

## 5. 克隆工具与流程（Spark-TTS）

### 工具选型结论（实测）
- Chatterbox：依赖 `pkuseg`，其 C++ 含 CPython 内部头 `longintrepr.h`（**Python 3.12 已删除**）→ 装不了。
- Fish Speech：依赖 `pyaudio`，**无 macOS arm64 轮子**（需 brew portaudio 源码编译）→ 放弃。
- GPT-SoVITS：`pyopenjtalk` 无轮子 + `vocos` 依赖冲突 → 放弃。
- **Spark-TTS（讯飞开源）**：依赖全有轮子，py3.12/M4(MPS) 可用 → **采用**。

### 流程（mock-voice/scripts/gen_spark.py 已写好）
1. 参考音频：4 条 m4a → `reference/reference-16k.wav`（ffmpeg 拼接，16kHz 单声道，16.16s，已完成）。
2. 模型：`SparkAudio/Spark-TTS-0.5B`（ModelScope 下载到 `pretrained_models/`；下载进行中，用户要求暂停——**待恢复**）。
3. 合成：`gen_spark.py` 用 `SparkTTS(model_dir, device=mps/cpu)` + `inference(text, prompt_speech_path=reference, prompt_text="今天也是很棒的妈妈哦。你是世界上最好最棒的妈妈。你下班了吗。是给贝贝买了鸡腿吗。")` 逐条合成 → `generated/<组>-NN.wav`（16kHz）。
4. 后处理：ffmpeg 去首尾静音、响度归一 → AAC m4a → `final/<组>/*.m4a`（文件名=台词）。

### 交付
- 用户试听 `mock-voice/final/`；确认后 m4a 移入 `assets/voice/<组>/`（用户或助手操作）。
- 语音进包后本地 commit；**等用户确认全部功能完成后才推 GitHub**。

## 6. 提交策略

- 整个过程只在本地 commit（含本 spec），**不 push GitHub**。
- 用户确认功能完成后，一次性推送。

## 7. 验收标准

- [ ] `assets/voice/` 4 个文件夹就位（general 已有 4 条）
- [ ] 双击→general；完成→done 组；报错→error 组（有声音）；待批准→approval 组（限频）；运行→无声；空组不报错
- [ ] 克隆音色与原小孩配音尽量一致（用户试听确认）
- [ ] `npm run build` + `npm run validate` + client bundle 测试通过
- [ ] GitHub 未推送（等待确认）

## 8. 未决 / 待办

- Spark-TTS 模型下载（ModelScope）未完成（用户暂停安装）。
- 合成质量/音色保真度待实测；不满意可换 GPT-SoVITS（重装）或调参考音频。
- general 组是否新增台词（"哈喽，我在呢~" 等）待用户定。

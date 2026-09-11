// Pet.tsx — 桌宠本体（MAM FoxbellPet.tsx 基准重写移植；Tauri 窗口几何 → WebUI DOM 定位）。
// 动画优先级：拖拽 > 瞬时动作 > 任务态 > 环视 > 待机（MAM spec §7）。
// 交互：单击挥手 / 双击语音+可配置动作 / 拖拽方向动画 / 投掷惯性 / 重力坠落 / 落地压扁回弹 /
//       环视待机 / 右键菜单（含切换宠物子菜单）。
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ANIM, FRAME_H, FRAME_W, frameStyle, LOOK_FRAMES, type PetAnimKey } from "./animations";
import {
  clampPos, dragDirection, pushSample, SQUASH_TIMING, stepFall, throwVelocity, viewportBounds,
  type FallState, type Sample,
} from "./physics";
import {
  loadGuardIgnored, loadPosition, loadVisible,
  savePosition, guardSignature,
  type PetConfig,
} from "./config";
import { MIN_SPEECH_MS } from "./voices";
import type { VoiceGroup } from "./validation";
import { appStore, ackProject, cfgStore, petStore, playDefaultAlertSound, voicePlayer, type ActivePetRuntime } from "./store";
import { apiPost, type ActivateResult, type GuardIssue, type PaceTier, type ProjectCard } from "./api";
import { DOT_COLOR, DOT_HALO, lightOf, taskPoseOf } from "./statuscards";
import { t, alertText, getLang } from "./i18n";
import { PetMenu, type MenuPage } from "./PetMenu";
import { Sign } from "./Sign";
import { MiniBar, type MiniMode } from "./MiniBar";
import { Board, type BoardMode } from "./Board";
import { openDialog } from "./dialogs/host";

const BOTTOM_MARGIN = 76; // 精灵底边距视口底（v1 默认 bottom:76 落点，随 scale 缩放）
const LOOK_FRAME_MS = 250;
const LOOK_IDLE_MS = 6000;
const TRANSIENT_WAVE_MS = 1700;
const APPROVAL_THROTTLE_MS = 10_000;
const MINI_HOVER_MS = 500; // 悬停 0.5s 出迷你条（源 client.js L888 定时时长）
const BOARD_W = 310; // 黑板固定版式宽（与 styles.ts .dyn-pet-board 同源；锚定跟随偏移用）
const BOARD_GAP = 12; // 黑板与宠物本体间距
const BOARD_EDGE = 8; // 左侧锚定越界阈值（left < 8 → 翻宠物右侧）

interface PetProps {
  ctx: { get(name: string): unknown };
  useSessions: (sel: (s: { current?: string }) => unknown) => unknown;
}

export function Pet(props: PetProps): React.ReactElement | null {
  const petCtx = props.ctx;
  // useSessions 恒为稳定 hook（index.tsx makeUseSessions：sessions 缺席时退化为 undefined 读取）
  const currentId = props.useSessions((s) => s && s.current) as string | undefined;
  const currentIdRef = useRef(currentId);
  currentIdRef.current = currentId;

  const [cfg, setCfg] = useState<PetConfig>(cfgStore.getSnapshot());
  useEffect(() => cfgStore.subscribe(() => setCfg(cfgStore.getSnapshot())), []);
  const cfgRef = useRef(cfg);
  useEffect(() => { cfgRef.current = cfg; }, [cfg]);

  const [visible, setVisible] = useState(petStore.visible);
  // 关宠分发（源 client.js L196-200 客户端聚合）：隐藏桌宠时若 summaryEnabled 且最近总结在 → farewell 黑板
  // （黑板在宠物隐藏后仍渲染，ttl 到点自动消失）。effect 首挂载后才执行，捕获首渲染绑定
  // （openBoard/cfgRef 稳定：openBoard 只触 refs/setState——同源 openBoard 声明在本 effect 之后的 const 惯例）
  useEffect(() => petStore.subscribe(() => {
    setVisible(petStore.visible);
    if (petStore.visible === false && cfgRef.current.summaryEnabled) {
      const dash = appStore.getSnapshot()?.dashboard ?? null;
      if (dash && dash.summary) openBoardRef.current("farewell");
    }
  }), []);

  const [snap, setSnap] = useState(appStore.getSnapshot());
  const [runtime, setRuntime] = useState<ActivePetRuntime>(appStore.getRuntime());
  useEffect(
    () => appStore.subscribe(() => { setSnap(appStore.getSnapshot()); setRuntime(appStore.getRuntime()); }),
    []
  );
  const runtimeRef = useRef(runtime);
  useEffect(() => { runtimeRef.current = runtime; }, [runtime]);

  const scale = cfg.scale;
  const px = useCallback((v: number) => Math.round(v * scale), [scale]);
  const frameW = px(FRAME_W);
  const frameH = px(FRAME_H);
  const bottomMargin = px(BOTTOM_MARGIN);

  // ---- 位置（视口为工作区；位置记忆 + 边界钳制保留）----
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    const p = loadPosition();
    if (p === null) return null; // 首次：默认右下角锚点
    if (Number.isNaN(p.y)) {
      const b = viewportBounds(window.innerWidth, window.innerHeight, FRAME_W, FRAME_H, BOTTOM_MARGIN);
      return clampPos(p.x, b.groundY, FRAME_W, FRAME_H, window.innerWidth, window.innerHeight, BOTTOM_MARGIN);
    }
    return clampPos(p.x, p.y, FRAME_W, FRAME_H, window.innerWidth, window.innerHeight, BOTTOM_MARGIN);
  });
  // 缩放/视口变化：重新钳制
  useEffect(() => {
    setPos((p) => (p === null ? null : clampPos(p.x, p.y, frameW, frameH, window.innerWidth, window.innerHeight, bottomMargin)));
    const onResize = () =>
      setPos((p) => (p === null ? null : clampPos(p.x, p.y, frameW, frameH, window.innerWidth, window.innerHeight, bottomMargin)));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [frameW, frameH, bottomMargin]);

  // ---- 动画状态机（拖拽 > 瞬时 > 任务态 > look > idle）----
  const [anim, setAnim] = useState<PetAnimKey>("idle");
  const [frame, setFrame] = useState(0);
  const [lookFrame, setLookFrame] = useState(-1);
  const animRef = useRef<PetAnimKey>("idle");
  const frameRef = useRef(0);
  const stepTimer = useRef<number | null>(null);
  const stateRef = useRef<{ drag: PetAnimKey | null; transient: PetAnimKey | null; task: PetAnimKey | null; look: boolean }>({
    drag: null, transient: null, task: null, look: false,
  });
  const lookStop = useRef<(() => void) | null>(null);
  const genRef = useRef({ transient: 0, look: 0 });
  const rowsRef = useRef<9 | 11>(11);
  useEffect(() => { rowsRef.current = runtime.rows; }, [runtime.rows]);

  const later = useRef((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    return () => window.clearTimeout(id);
  }).current;

  const cancelStep = () => {
    if (stepTimer.current !== null) { window.clearTimeout(stepTimer.current); stepTimer.current = null; }
  };
  const stepLoop = () => {
    const def = ANIM[(animRef.current === "look" ? "idle" : animRef.current) as keyof typeof ANIM];
    const i = frameRef.current;
    const ms = def.d[i] ?? 160;
    stepTimer.current = window.setTimeout(() => {
      frameRef.current = (i + 1) % def.d.length;
      setFrame(frameRef.current);
      stepLoop();
    }, ms);
  };
  const stopLook = () => {
    lookStop.current?.();
    lookStop.current = null;
    if (stateRef.current.look) { stateRef.current.look = false; setLookFrame(-1); }
  };
  const applyAnim = (key: PetAnimKey) => {
    if (animRef.current === key) return;
    animRef.current = key;
    setAnim(key);
    cancelStep();
    // 离开 look（更高优先级状态抢占）时完整停掉扫视
    if (animRef.current !== "look") stopLook();
    frameRef.current = 0;
    setFrame(0);
    stepLoop();
  };
  // 档位动画（v2.1 移植）：仅任务态为 running 且档位 longrun 时切"看表"代用行；不变速。
  // 档位从最新快照读（看板未下发 → 无档位 → 返回 null）
  const tierAnim = (): PetAnimKey | null => {
    if (stateRef.current.task === "running"
      && appStore.getSnapshot()?.dashboard?.pace?.tier === "longrun") return "waiting"; // 长任务看表（代用行）
    return null;
  };
  const refreshAnim = () => {
    const s = stateRef.current;
    // tierAnim 须排在 s.task 之前（v1.4.0 已验证修正）：它仅在 task==='running' 且档位 longrun 时
    // 返回 'waiting'；放在 s.task 之后会被 ||/?? 短路成死代码。返回 null 时其余链路照旧。
    applyAnim(s.drag ?? s.transient ?? tierAnim() ?? s.task ?? (s.look ? "look" : "idle"));
  };
  /** 瞬时动作（代数计数防过期覆盖，spec F4） */
  const playTransient = useRef((key: PetAnimKey, ms: number) => {
    const gen = ++genRef.current.transient;
    stateRef.current.transient = key;
    refreshAnim();
    later(() => {
      if (genRef.current.transient === gen && stateRef.current.transient === key) {
        stateRef.current.transient = null;
        refreshAnim();
      }
    }, ms);
  }).current;

  // ---- look 环视：空闲 6s 触发，16 向 250ms/帧，任何状态打断（v1 图集静默跳过）----
  const scheduleNextLook = useRef<() => void>(() => {});
  scheduleNextLook.current = () => {
    const gen = ++genRef.current.look;
    later(() => {
      if (genRef.current.look !== gen) return;
      if (rowsRef.current !== 11) { scheduleNextLook.current(); return; }
      const s = stateRef.current;
      // 摸鱼档位（loaf1..4）：咸鱼不东张西望——抑制本轮环视，直接重排保持循环存活
      // （源 startLook 处移植；档位读最新快照，看板未下发视为非摸鱼；不变速）
      const tier = appStore.getSnapshot()?.dashboard?.pace?.tier;
      if (typeof tier === "string" && tier.startsWith("loaf")) { scheduleNextLook.current(); return; }
      if (!s.drag && !s.transient && !s.task) {
        s.look = true;
        setLookFrame(0);
        refreshAnim();
        let i = 0;
        const id = window.setInterval(() => {
          i += 1;
          if (i >= LOOK_FRAMES.length) {
            window.clearInterval(id);
            lookStop.current = null;
            stopLook();
            refreshAnim();
            scheduleNextLook.current();
          } else {
            setLookFrame(i);
          }
        }, LOOK_FRAME_MS);
        lookStop.current = () => window.clearInterval(id);
      } else {
        scheduleNextLook.current();
      }
    }, LOOK_IDLE_MS);
  };

  // ---- 语音与字幕 ----
  const [subtitle, setSubtitle] = useState<string | null>(null);
  const bubbleGen = useRef(0);
  const unlockedRef = useRef(false);
  const showBubble = (text: string, ms: number) => {
    const gen = ++bubbleGen.current;
    setSubtitle(text);
    later(() => { if (bubbleGen.current === gen) setSubtitle(null); }, ms);
  };

  /** 播一组语音 + 动作 + 字幕（MAM playVoice 闸门链）：
   *  可见性 → 动作先播（无语音宠物也有动作）→ hasVoice → pick → 字幕（talkative && hasSubtitle）→
   *  muted 只拦声音。审批语音 10s 限流在差分调用侧。 */
  const playVoice = (group: VoiceGroup, action: PetAnimKey) => {
    if (!loadVisible()) return;
    playTransient(action, TRANSIENT_WAVE_MS);
    if (!runtimeRef.current.hasVoice) return; // 无语音宠物：只播动画不出声
    const entry = voicePlayer.pick(group);
    if (!entry) return; // 空组静默跳过
    if (cfgRef.current.talkative && runtimeRef.current.hasSubtitle) showBubble(entry.name, MIN_SPEECH_MS);
    voicePlayer.play(entry, {
      muted: cfgRef.current.muted,
      onSubtitle: (name, ms) => {
        if (!cfgRef.current.muted && cfgRef.current.talkative && runtimeRef.current.hasSubtitle && ms > MIN_SPEECH_MS) {
          showBubble(name, ms);
        }
      },
    });
  };
  const playVoiceRef = useRef(playVoice);
  useEffect(() => { playVoiceRef.current = playVoice; });

  // ---- v2.1 效率看板接入（源 client.js L249-261 状态声明移植）----
  const [sign, setSign] = useState<string | null>(null); // 举牌文本（数字类警报，牌面 ttl 4.2s）
  const seenAlertsRef = useRef(new Set<string>()); // 警报按 id 去重（usageEnabled=false 时也记 seen；会话生命周期一次）
  const [entry, setEntry] = useState(false); // 📖 限时总结入口（ttl summaryEntrySec）
  // Task 7 挂接点：入口按钮的渲染（.dyn-pet-entry 样式）与点击 → 开黑板在 Task 7 落地，此处仅驱动状态与 ttl
  const entryTimerRef = useRef<(() => void) | null>(null); // 入口 ttl 定时器：新完成事件先清旧定时器，防堆叠后最早到期误关
  const signTimerRef = useRef<(() => void) | null>(null); // 举牌 4.2s 清除定时器（review Minor1：卸载可清理）
  const paceTierRef = useRef<PaceTier | null>(null); // 档位差分：档位变化重算动画（源 useEffect([pace]) 语义）

  // ---- v2.1 迷你条（源 client.js L254-265 状态移植）：null | 'hover' | 'manual' ----
  // hover：sprite 悬停 0.5s 定时进入、离开即退；manual：菜单「今日用量」进入（ESC/点外部退出）。
  // 渲染守卫见 JSX 处 miniVisible 条件（拖拽强制隐藏 + 黑板优先挂钩点）。
  const [miniMode, setMiniMode] = useState<MiniMode | null>(null);
  const hoverTimerRef = useRef<(() => void) | null>(null);
  const clearHoverTimer = () => {
    if (hoverTimerRef.current) { const d = hoverTimerRef.current; hoverTimerRef.current = null; try { d(); } catch { /* ignore */ } }
  };
  const rootRef = useRef<HTMLDivElement | null>(null); // 手动迷你条「点外部关闭」的宠物本体 contains 判定

  // ---- v2.1 小黑板（源 client.js L266-283 状态簇移植）：null 关闭 / manual 菜单或📖入口 / farewell 关宠分发 ----
  // 黑板开着不渲染迷你条（黑板优先，渲染守卫见 JSX 处 board === null 条件）
  const [board, setBoard] = useState<{ mode: BoardMode } | null>(null);
  const boardTimerRef = useRef<(() => void) | null>(null); // 黑板 ttl 定时器：所有打开路径统一走 openBoard，防跨模式泄漏/堆叠
  const boardRef = useRef<HTMLDivElement | null>(null); // 「点外部关闭」的黑板 contains 判定
  const openBoardRef = useRef<(mode: BoardMode) => void>(() => {}); // 关宠 effect（声明在本组件更早处）的稳定调用口
  // 开黑板（spec ④：黑板出现→停留 boardTtlSec→自动消失，manual/farewell 一视同仁）：先清旧 ttl 再按当前配置重设
  const openBoard = (mode: BoardMode) => {
    if (boardTimerRef.current) { const d = boardTimerRef.current; boardTimerRef.current = null; try { d(); } catch { /* ignore */ } }
    setBoard({ mode });
    boardTimerRef.current = later(() => { boardTimerRef.current = null; setBoard(null); }, (cfgRef.current.boardTtlSec || 15) * 1000);
  };
  useEffect(() => { openBoardRef.current = openBoard; }); // 每渲染同步（闭包只触 refs/setState，稳定）
  // 关黑板（✕/点外部/ESC 三路等价收口）：同时取消 ttl 定时器（源 closeBoard 原样语义）
  const closeBoard = () => {
    if (boardTimerRef.current) { const d = boardTimerRef.current; boardTimerRef.current = null; try { d(); } catch { /* ignore */ } }
    setBoard(null);
  };

  // ---- 状态卡片差分（approval 10s 限流 / done / error）----
  const prevStatusRef = useRef<Record<string, string>>({});
  const lastApprovalAtRef = useRef(0);
  const sinceSeqRef = useRef<number | null>(null);

  useEffect(() => {
    if (!snap) return;
    const cards: ProjectCard[] = Array.isArray(snap.projects) ? snap.projects : [];
    const dash = snap.dashboard;
    // 完成事件：宿主 completions 队列按 seq 差分（v1 同款）
    const since = sinceSeqRef.current;
    sinceSeqRef.current = snap.seq;
    if (since !== null && Array.isArray(snap.completions)) {
      const fresh = snap.completions.filter((c) => c && typeof c.seq === "number" && c.seq > since);
      if (fresh.length > 0) {
        // 📖 限时总结入口：任何有效完成事件都触发（不依赖语音是否存在，spec 6.4）；
        // 先清旧 ttl 定时器防堆叠（否则入口在首个事件的截止时刻提前消失）
        if (cfgRef.current.summaryEnabled) {
          if (entryTimerRef.current) { const d = entryTimerRef.current; entryTimerRef.current = null; try { d(); } catch { /* ignore */ } }
          setEntry(true);
          entryTimerRef.current = later(() => setEntry(false), (cfgRef.current.summaryEntrySec || 15) * 1000);
        }
        playVoiceRef.current("done", cfgRef.current.doneAction);
      }
    }
    // ---- v2.2 警报举牌/气泡 + 音效链（R7/R10）：
    // 四组配齐 → general 组宠物语音 > 内置合成 chime（spec 默认裁定②：TTS 不参与音效链）；
    // 先按 id 去重（usageEnabled=false 时也记 seen，开启瞬间不补发旧警报）
    if (dash && Array.isArray(dash.alerts)) {
      for (const a of dash.alerts) {
        if (!a || typeof a.id !== "string" || seenAlertsRef.current.has(a.id)) continue;
        seenAlertsRef.current.add(a.id);
        if (!cfgRef.current.usageEnabled) continue;
        // 里程碑一句话走气泡容器（spec 6.2 表现面3；一句话→气泡），数字类警报仍举牌。
        // v2.2 R10：文案结构化拼装 t(kind→键)+fmtTokens(reached)（随界面语言）；
        // 旧宿主缺 reached 时回退下发文本 a.text（防御陈旧拼装）
        const txt = typeof a.reached === "number" ? alertText(getLang(), a.kind, a.reached) : a.text;
        if (a.kind === "milestone") showBubble(txt || a.text, 4200);
        else { setSign(txt || a.text); if (signTimerRef.current) { try { signTimerRef.current(); } catch { /* ignore */ } } signTimerRef.current = later(() => setSign(null), 4200); }
        playTransient("jumping", 1600);
        if (cfgRef.current.muted) continue;
        // v2.2 R7 音效链：四组配齐 → general 组宠物语音命中即播；否则内置合成 chime（语音组 > 默认音效；TTS 不参与）
        if (runtimeRef.current.hasVoice) {
          const v = voicePlayer.pick("general");
          if (v) {
            // 里程碑：气泡即容器，语音时长对齐刷新气泡；数字警报：举牌即容器，不叠加字幕气泡（spec 6.2 容器分工）
            voicePlayer.play(v, {
              muted: cfgRef.current.muted,
              onSubtitle: a.kind === "milestone"
                ? (name, ms) => { if (!cfgRef.current.muted && cfgRef.current.talkative && runtimeRef.current.hasSubtitle) showBubble(txt || name, ms); }
                : undefined,
            });
            continue;
          }
        }
        playDefaultAlertSound();
      }
    }
    // error / approval / running 差分
    const prev = prevStatusRef.current;
    const statuses: Record<string, string> = {};
    let errAppeared = false;
    let approvalAppeared = false;
    let runningAppeared = false;
    for (const p of cards) {
      if (!p || !p.id) continue;
      statuses[p.id] = p.status;
      if (p.status === "error" && prev[p.id] !== "error") errAppeared = true;
      if (p.status === "approval" && prev[p.id] !== "approval") approvalAppeared = true;
      if (p.status === "running" && prev[p.id] !== "running") runningAppeared = true;
    }
    prevStatusRef.current = statuses;
    if (errAppeared) {
      // 出错 → error 组语音 + errorAction 动作；无语音宠物只播动作（playVoice 闸门链）
      playVoiceRef.current("error", cfgRef.current.errorAction);
    }
    if (approvalAppeared) {
      const now = Date.now();
      if (now - lastApprovalAtRef.current > APPROVAL_THROTTLE_MS) {
        lastApprovalAtRef.current = now;
        playVoiceRef.current("approval", cfgRef.current.approvalAction);
      }
    }
    if (runningAppeared) {
      // 开始运行 → general 组语音 + runningAction 动作（黄灯差分；无语音宠物只播动作）
      playVoiceRef.current("general", cfgRef.current.runningAction);
    }
    // 任务姿态（MAM 口径）：waiting > running；全绿/无卡回落
    const task = taskPoseOf(cards);
    if (stateRef.current.task !== task) {
      stateRef.current.task = task;
      refreshAnim();
    }
    // 档位变化也要重算动画（源 useEffect(() => { refreshAnim() }, [pace]) 移植）：
    // running 中档位变为 longrun 时刷新链才会切到看表代用行
    const tier = dash && dash.pace ? dash.pace.tier : null;
    if (paceTierRef.current !== tier) {
      paceTierRef.current = tier;
      refreshAnim();
    }
    // 当前会话的 done/error 未读卡自动 ack（v1 已读即消失语义不变）
    const active = currentIdRef.current;
    for (const p of cards) {
      if (p && p.unread && (p.status === "done" || p.status === "error") && p.id === active) ackProject(p.id);
    }
  }, [snap]);

  // ---- 拖拽 / 物理 ----
  const dragRef = useRef<{ pointerId: number; dx: number; dy: number; movedX: number; movedY: number; moved: boolean; samples: Sample[] } | null>(null);
  const fallRaf = useRef(0);
  const spriteRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const busyRef = useRef(false); // 拖拽/坠落中 = 「宠物本体运行中」（守卫不弹对话）

  const onPointerDown = (e: React.PointerEvent) => {
    clearHoverTimer(); if (miniMode !== "manual") setMiniMode(null); // 拖拽即隐藏（手动模式除外；手动层由渲染守卫强制隐藏）
    if (e.button !== 0) return; // 右键留给菜单
    if (fallRaf.current) { cancelAnimationFrame(fallRaf.current); fallRaf.current = 0; }
    e.preventDefault();
    stopLook();
    if (!unlockedRef.current) { unlockedRef.current = true; voicePlayer.unlock(); }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragRef.current = {
      pointerId: e.pointerId,
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
      movedX: 0,
      movedY: 0,
      moved: false,
      samples: [],
    };
    setDragging(true);
    busyRef.current = true;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const now = performance.now();
    pushSample(d.samples, now, e.clientX, e.clientY);
    d.moved = true;
    // 方向动画按 150ms 采样窗增量判定（MAM 原版语义）
    const winAnchor = d.samples[0];
    d.movedX = e.clientX - winAnchor.x;
    d.movedY = e.clientY - winAnchor.y;
    setPos({ x: e.clientX - d.dx, y: e.clientY - d.dy });
    const dir = dragDirection(d.movedX, d.movedY);
    if (dir && stateRef.current.drag !== dir) {
      stateRef.current.drag = dir;
      refreshAnim();
    }
  };

  const startFall = (x0: number, y0: number, vx0: number) => {
    if (fallRaf.current) cancelAnimationFrame(fallRaf.current);
    let s: FallState = { x: x0, y: y0, vx: vx0, vy: 0, landed: false, rest: false };
    let last = performance.now();
    let landFired = false;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const b = viewportBounds(window.innerWidth, window.innerHeight, frameW, frameH, bottomMargin);
      const wasAir = !s.landed;
      s = stepFall(s, dt, b.groundY, b.minX, b.maxX);
      if (s.landed && wasAir && !landFired) { landFired = true; squashAnim(); }
      setPos({ x: s.x, y: s.y });
      if (s.rest || fallRaf.current === 0) {
        if (s.rest) savePosition({ x: s.x, y: s.y });
        fallRaf.current = 0;
        busyRef.current = false;
        return;
      }
      fallRaf.current = requestAnimationFrame(tick);
    };
    fallRaf.current = requestAnimationFrame(tick);
  };

  /** 落地压扁回弹 + 补跳（MAM onLand 时序：60ms 压扁 → 240ms 回弹 → +260ms 补跳 1500ms） */
  const squashAnim = () => {
    const el = spriteRef.current;
    if (!el) return;
    const T = SQUASH_TIMING;
    el.style.transition = `transform ${T.squashMs}ms ease-out`;
    el.style.transform = `scale(1, ${T.squashScaleY})`;
    later(() => {
      const el2 = spriteRef.current;
      if (!el2) return;
      el2.style.transition = `transform ${T.bounceMs}ms ${T.bounceEasing}`;
      el2.style.transform = "scale(1, 1)";
      later(() => {
        const el3 = spriteRef.current;
        if (!el3) return;
        el3.style.transition = "";
        el3.style.transform = "";
        playTransient("jumping", T.hopAnimMs);
      }, T.settleMs);
    }, T.squashMs);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    stateRef.current.drag = null;
    if (!d.moved) playTransient("waving", TRANSIENT_WAVE_MS); // 单击：固定挥手（不出声）
    refreshAnim();
    const current = posRef.current;
    const gravityOn = cfgRef.current.gravity;
    if (gravityOn && d.moved && d.samples.length >= 2) {
      const vx = throwVelocity(d.samples);
      const anchor = current ?? { x: e.clientX - d.dx, y: e.clientY - d.dy };
      startFall(anchor.x, anchor.y, vx);
    } else {
      if (d.moved && current) savePosition(current); // 非物理松手：停在拖拽处并记忆
      busyRef.current = false;
    }
  };
  const posRef = useRef(pos);
  useEffect(() => { posRef.current = pos; }, [pos]);

  const onDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    playVoiceRef.current("general", cfgRef.current.dblAction); // 双击说话 + dblAction
  };

  // 滚轮穿透（spec 6.6 规则 7；源 client.js L808-830 原样移植）：宠物本体上滚动 → 暂时摘掉自身
  // pointer-events，用 elementFromPoint 找到下方元素，把滚动量转给其最近可滚动祖先（无则落到页面
  // 滚动元素）。黑板/菜单是独立 fixed 元素不经过此 handler（仅宠物根挂 onWheel），内部滚动天然正常
  const scrollableAncestor = (el: Element): Element => {
    let n: Element | null = el;
    while (n && n !== document.body && n !== document.documentElement) {
      const st = window.getComputedStyle(n);
      if (n.scrollHeight > n.clientHeight + 1 && /auto|scroll|overlay/.test(st.overflowY)) return n;
      n = n.parentElement;
    }
    return document.scrollingElement || document.body;
  };
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const root = e.currentTarget;
    const prev = root.style.pointerEvents;
    root.style.pointerEvents = "none";
    const el = document.elementFromPoint(e.clientX, e.clientY);
    root.style.pointerEvents = prev || "auto";
    if (!el) return;
    const sc = scrollableAncestor(el);
    if (sc) sc.scrollTop += e.deltaY;
  };

  // ---- 右键菜单 ----
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [menuPage, setMenuPage] = useState<MenuPage>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const previewLoop = useRef<number | null>(null);
  const stopPreview = useCallback(() => {
    if (previewLoop.current !== null) { clearInterval(previewLoop.current); previewLoop.current = null; }
  }, []);
  /** 动作子页实时预览（MAM B4）：进入立即播一次 + 1700ms 循环；返回/关闭即停 */
  const handlePreview = useCallback((action: PetAnimKey | null) => {
    if (action) {
      stopPreview();
      playTransient(action, 1600);
      previewLoop.current = window.setInterval(() => playTransient(action, 1600), TRANSIENT_WAVE_MS);
    } else {
      stopPreview();
    }
  }, [playTransient, stopPreview]);
  const closeMenu = useCallback(() => { setMenu(null); setMenuPage(null); stopPreview(); }, [stopPreview]);
  // 菜单「点外部关闭」独立收口（源 client.js L279-282 原样）；ESC 键路径随 Task 8 并入下方统一分层 effect
  useEffect(() => {
    if (menu === null || !visible) return;
    const onDown = (e: PointerEvent) => { if (menuRef.current && menuRef.current.contains(e.target as Node)) return; closeMenu(); };
    window.addEventListener("pointerdown", onDown, true);
    return () => { window.removeEventListener("pointerdown", onDown, true); };
  }, [menu, visible, closeMenu]);

  // 手动迷你条/黑板/菜单统一分层关闭（源 client.js L281-300 原样移植）：
  // 点外部（宠物本体/迷你条/黑板/菜单之外）关闭——手动迷你条与黑板可同时关（源两连 if 原样）；
  // ESC 一次剥一层，源序：手动迷你条 → 黑板 → 菜单；黑板层必须走 closeBoard（同时取消 ttl 定时器）。
  // 菜单层走 closeMenu（连带剥 menuPage + 停预览，v2 等价于源 setMenu(null) 的收尾语义）。
  // 迷你条 pointer-events:none（spec 6.6 纯读取），点击必落在其外，无需 contains 检查。
  useEffect(() => {
    if (miniMode !== "manual" && board === null && menu === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (miniMode === "manual") { setMiniMode(null); return; }
      if (board !== null) { closeBoard(); return; }
      if (menu !== null) closeMenu();
    };
    const onDown = (e: PointerEvent) => {
      if (miniMode !== "manual" && board === null) return; // 菜单点外部由其自身 effect 收口（源 L279-282 分立）
      const target = e.target as Node;
      // 宠物本体（含状态卡/举牌/迷你条/📖入口挂点）、菜单与黑板内部点击不关
      if (rootRef.current && rootRef.current.contains(target)) return;
      if (menuRef.current && menuRef.current.contains(target)) return;
      if (boardRef.current && boardRef.current.contains(target)) return;
      if (miniMode === "manual") setMiniMode(null);
      if (board !== null) closeBoard();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onDown, true); };
  }, [miniMode, board, menu, closeMenu]);

  /** 切换宠物（菜单子项/切换对话框共用）：activate 校验 → 热切换写配置 */
  const switchTo = useCallback(async (id: string): Promise<ActivateResult | null> => {
    try {
      const r = await apiPost<ActivateResult>("/api/activate", { id });
      if (r.status === "activated") {
        cfgStore.set({ activePetId: id });
        appStore.refresh();
        return r;
      }
      if (r.status === "mismatch") {
        // 素材不一致：弹修复对话（更新清单 / 换回 foxbell / 忽略 / 隐藏）
        openDialog("guard", { targetId: id, issues: (r.issues ?? []) as GuardIssue[], plan: r.plan, onResolved: (choice: "update" | "ignore" | "foxbell" | "hide") => {
          if (choice === "ignore") { cfgStore.set({ activePetId: id }); appStore.refresh(); }
        } });
        return r;
      }
      openDialog("guard", { targetId: id, issues: (r.issues ?? []) as GuardIssue[], fatal: true });
      return r;
    } catch (e) {
      openDialog("guard", { targetId: id, issues: [{ kind: "scan-fail", detail: String((e as Error)?.message ?? e) }], fatal: true });
      return null;
    }
  }, []);

  // ---- 激活守卫（快照 guard 下发；宠物本体运行中不弹对话；「忽略」按签名记忆）----
  const guardPromptedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!snap || !visible) return;
    const issues = Array.isArray(snap.guard) ? snap.guard : [];
    const activeId = snap.activePet?.id ?? "foxbell";
    if (issues.length === 0 || activeId === "foxbell") { guardPromptedRef.current = null; return; }
    const sig = guardSignature(activeId, issues);
    if (guardPromptedRef.current === sig) return;
    if (loadGuardIgnored() === sig) return;
    if (busyRef.current || dragRef.current !== null || stateRef.current.transient !== null) return; // 运行中不弹
    guardPromptedRef.current = sig;
    openDialog("guard", { targetId: activeId, issues, fatal: issues.some((i) => i.fatal) });
  }, [snap, visible]);

  // ---- 生命周期 ----
  useEffect(() => {
    stepLoop();
    scheduleNextLook.current();
    return () => {
      cancelStep();
      stopLook();
      clearHoverTimer(); // 迷你条 hover 定时器随卸载清掉（源 clearHoverTimer 卫生）
      if (boardTimerRef.current) { const d = boardTimerRef.current; boardTimerRef.current = null; try { d(); } catch { /* ignore */ } } // 黑板 ttl 随卸载清掉
      if (entryTimerRef.current) { const d = entryTimerRef.current; entryTimerRef.current = null; try { d(); } catch { /* ignore */ } } // 入口 ttl 随卸载清掉（review Minor1）
      if (signTimerRef.current) { const d = signTimerRef.current; signTimerRef.current = null; try { d(); } catch { /* ignore */ } } // 举牌清除随卸载清掉（review Minor1）
      genRef.current.look += 1; // 使在途 look 调度链失效
      stopPreview();
      if (fallRaf.current) { cancelAnimationFrame(fallRaf.current); fallRaf.current = 0; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!visible && fallRaf.current) { cancelAnimationFrame(fallRaf.current); fallRaf.current = 0; busyRef.current = false; }
  }, [visible]);

  // 标题闪烁（组件③页外召集，spec 6.3；源 client.js L644-667 原样移植）：页面不可见且存在
  // waitMin ≥ approvalFlickerMin（0=关）的未决审批时，document.title 每秒轮换「🦊 审批等待中…」/
  // 原标题；回到页面或审批 decided（不再满足）即恢复。全部走 ref/快照直读（cfgRef + appStore，
  // 同 alerts 消费段的最新快照读取方式），挂载时捕获原标题，卸载/停止必恢复
  useEffect(() => {
    const base = document.title;
    const flickerText = t("dash.flickerTitle");
    let on = false, flip = false, flickIv: number | null = null;
    const stop = () => {
      if (flickIv !== null) { window.clearInterval(flickIv); flickIv = null; }
      if (on) { document.title = base; on = false; }
    };
    const tick = () => {
      const min = cfgRef.current.approvalFlickerMin;
      const dash = appStore.getSnapshot()?.dashboard ?? null;
      const hit = min > 0 && dash !== null && Array.isArray(dash.approvals)
        && dash.approvals.some((a) => a && a.waitMin >= min)
        && document.visibilityState !== "visible";
      if (hit && !on) {
        on = true;
        flickIv = window.setInterval(() => { flip = !flip; document.title = flip ? flickerText : base; }, 1000);
      } else if (!hit && on) stop();
    };
    tick();
    const iv = window.setInterval(tick, 1500);
    const onVis = () => tick();
    document.addEventListener("visibilitychange", onVis);
    return () => { window.clearInterval(iv); stop(); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  // ---- 卡片点击：跳会话 + 已读（语义不变）----
  const onProjectClick = (p: ProjectCard) => {
    try {
      const sessions = petCtx.get("sessions") as { open?: (id: string) => void } | undefined;
      if (sessions && typeof sessions.open === "function") sessions.open(p.id);
    } catch { /* unknown id or service missing */ }
    ackProject(p.id);
    // 绿卡点击即确认：本地立即消卡（MAM ackDone 同款），宿主下一轮快照收敛
    setLocalAcked((s) => new Set(s).add(p.id));
  };
  const [localAcked, setLocalAcked] = useState<Set<string>>(new Set());
  useEffect(() => {
    // 宿主快照更新后清掉与快照一致的本地 ack 标记（快照已收敛）
    if (!snap) return;
    setLocalAcked((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      for (const id of prev) {
        const card = snap.projects.find((p) => p.id === id);
        if (card && card.unread) next.add(id); // 快照仍未读：保持本地隐藏
      }
      return next.size === prev.size ? prev : next;
    });
  }, [snap]);

  // 小黑板：fragment 层渲染（源 L924-926：farewell 要在宠物隐藏后仍显示；无 summary 时 Board 自身返回 null）。
  // 定位（Task 11 R4 重锚定）：fixed 但锚定宠物侧——左优先 left = petX - BOARD_W - 12，越界（<8）翻右侧
  // petX + petW + 12；y 对齐宠物顶部；随拖拽（pos 变更重渲染）跟随。pos 未落定（首次默认右下锚）时按
  // right:24/bottom:BOTTOM_MARGIN 反推虚拟锚点。三档 scale 沿用 boardLayer transform（origin 随锚点改 top left）。
  // 层级 zIndex 与宠物 root 同层
  const boardLayer = board !== null ? (() => {
    const p = posRef.current;
    const petX = p ? p.x : window.innerWidth - 24 - frameW;
    const petY = p ? p.y : window.innerHeight - BOTTOM_MARGIN - frameH;
    let left = petX - BOARD_W - BOARD_GAP;
    if (left < BOARD_EDGE) left = petX + frameW + BOARD_GAP; // 左侧放不下 → 翻宠物右侧
    return (
      <div
        ref={boardRef}
        style={{ position: "fixed", top: petY, left, zIndex: 2147483000, transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        <Board
          dash={snap?.dashboard ?? null}
          mode={board.mode}
          ttlSec={cfg.boardTtlSec}
          onClose={closeBoard}
          onOpenPanel={() => {}} // v2.2 R4 入口行占位（L3 大看板开板回调在 Task 13 落地时替换为真切换）
        />
      </div>
    );
  })() : null;

  if (!visible) return boardLayer; // 关宠后黑板仍在（ttl 到点自动消失；✕/点外部/ESC 可关）

  const cards = (snap?.projects ?? []).filter((p) => !(p.status === "done" && localAcked.has(p.id)));
  const shown = cards.slice(0, 6);
  const extra = cards.length - shown.length;
  const style = frameStyle(anim, frame, lookFrame, scale, runtime.rows);
  const rootStyle: React.CSSProperties = {
    position: "fixed", zIndex: 2147483000, pointerEvents: "auto", touchAction: "none",
    userSelect: "none", WebkitUserSelect: "none",
  };
  if (pos) { rootStyle.left = pos.x; rootStyle.top = pos.y; }
  else { rootStyle.right = 24; rootStyle.bottom = BOTTOM_MARGIN; }

  return (
    <>
      <div
        ref={rootRef}
        className="dyn-pet-root"
        style={rootStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({
            x: Math.min(e.clientX, window.innerWidth - px(200)),
            y: Math.min(e.clientY, window.innerHeight - px(340)),
          });
          setMenuPage(null);
        }}
      >
        <div className="dyn-pet-top" style={{ marginBottom: px(10), gap: px(5), maxWidth: px(320) }}>
          {shown.map((p) => {
            const light = lightOf(p);
            return (
              <div
                key={p.id}
                className="dyn-pet-proj"
                style={{ padding: `${px(5)}px ${px(10)}px`, borderRadius: px(10), gap: px(7), fontSize: px(12) }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onProjectClick(p); }}
                onContextMenu={(e) => e.stopPropagation()} /* 右键响应范围仅宠物本体（spec 6.6 规则 8），状态卡右键无自定义行为 */
              >
                <span
                  className="dyn-pet-dot"
                  style={{
                    width: px(8), height: px(8), marginTop: px(4),
                    background: DOT_COLOR[light],
                    boxShadow: `0 0 0 2px ${DOT_HALO[light]}`,
                  }}
                />
                <div className="dyn-pet-proj-body">
                  <div className="dyn-pet-proj-title" style={{ fontSize: px(12) }}>
                    {light === "error-darkred" ? "⚠ " : ""}{p.title}
                  </div>
                  {Array.isArray(p.lines) ? p.lines.map((l, i) => (
                    <div key={i} className="dyn-pet-proj-line" style={{ fontSize: px(11.5) }}>
                      {l}
                      {/* v2.1 卡片年龄标注（源 L874）：仅首行且 age 非空 */}
                      {i === 0 && p.age ? <span className="dyn-pet-age" style={{ fontSize: px(10) }}>{" " + p.age}</span> : null}
                    </div>
                  )) : null}
                </div>
              </div>
            );
          })}
          {extra > 0 ? (
            <div className="dyn-pet-proj-more" style={{ fontSize: px(11) }}>+{extra} {t("card.more")}</div>
          ) : null}
        </div>
        {/* 警报举牌（源 L880：'🏷 ' + text；容器分工见 alerts 消费段） */}
        {sign ? <Sign text={sign} scale={scale} /> : null}
        {subtitle ? (
          <div
            className="dyn-pet-bubble"
            style={{ marginTop: px(8), padding: `${px(6)}px ${px(12)}px`, fontSize: px(13), borderRadius: px(12), maxWidth: px(320) }}
          >
            {subtitle}
          </div>
        ) : null}
        {/* 五口径迷你条（源 L882 挂载点：sprite 之前、miniMode !== null 时渲染）。
            渲染守卫：拖拽激活（dragging 于 pointerdown 置位，覆盖按下→方向阈值窗口；stateRef.drag 为方向动画段）
            强制隐藏 + 黑板优先（board !== null 时不渲染迷你条——源 L884 miniMode !== null && board === null 原样）。 */}
        {miniMode !== null && board === null && !dragging && stateRef.current.drag === null ? (
          <div className="dyn-pet-mini-wrap">
            <MiniBar
              dash={snap?.dashboard ?? null}
              cards={cards}
              mode={miniMode}
              scale={scale}
              usageOn={cfg.usageEnabled}
              onDetail={() => openBoard("manual")} // v2.2 R6：详情 » 钻取 → 黑板（L2 主链；hover/manual 共用此挂载点）
            />
          </div>
        ) : null}
        <div
          ref={spriteRef}
          className={"dyn-pet-sprite " + (dragging ? "dragging" : "")}
          onPointerEnter={() => { // 悬停 0.5s 出迷你条（源 L888；手动模式不重设定时器）
            if (miniMode !== "manual") { clearHoverTimer(); hoverTimerRef.current = later(() => setMiniMode("hover"), MINI_HOVER_MS); }
          }}
          onPointerLeave={() => { clearHoverTimer(); if (miniMode === "hover") setMiniMode(null); }} // 源 L889
          style={{
            width: frameW, height: frameH,
            backgroundImage: runtime.spriteUrl ? `url('${runtime.spriteUrl}')` : undefined,
            backgroundPosition: style.backgroundPosition,
            backgroundSize: style.backgroundSize,
            backgroundRepeat: "no-repeat",
            cursor: dragging ? "grabbing" : "grab",
          }}
        />
        {/* 📖 限时总结入口（源 L891-896 移植）：挂主 root 内 sprite 右上（.dyn-pet-entry 的 absolute
            偏移以 192×208 root 为锚，spec 6.0/6.4 宠物旁限时出现）；点击展开黑板并自毁 */}
        {entry ? (
          <div
            className="dyn-pet-entry"
            style={{ fontSize: px(12) }}
            onPointerDown={(e) => e.stopPropagation()} // 入口只点按：不触发 root 拖拽/单击挥手（与项目卡片同模式）
            onContextMenu={(e) => e.stopPropagation()} // 右键响应范围仅宠物本体（spec 6.6 规则 8），浮层右键无自定义行为
            onClick={(e) => { e.stopPropagation(); setEntry(false); openBoard("manual"); }}
          >
            {t("dash.summaryEntry")}
          </div>
        ) : null}
      </div>
      {menu !== null ? (
        <div ref={menuRef} className="dyn-pet-menu-wrap" style={{ left: menu.x, top: menu.y, zIndex: 2147483001 }}>
          <PetMenu
            page={menuPage}
            setPage={setMenuPage}
            cfg={cfg}
            scale={scale}
            voiceCapable={runtime.hasVoice}
            subtitleCapable={runtime.hasSubtitle}
            activePetId={runtime.id}
            pets={snap?.pets ?? []}
            onClose={closeMenu}
            onPreview={handlePreview}
            onHide={() => { closeMenu(); petStore.set(false); }}
            onSwitchPet={(id) => { closeMenu(); void switchTo(id); }}
            onMiniUsage={() => { closeMenu(); setMiniMode("manual"); }} // 🏷 今日用量：手动迷你条（源 miniOpen）
            onBoardSummary={() => { closeMenu(); openBoard("manual"); }} // 📊 查看最近总结：关菜单 + 开黑板（源 boardOpen）
            onSessionPick={(p) => { closeMenu(); onProjectClick(p); }} // 🗂 会话一览点选：关菜单 + 跳会话（源 SessionsPage onPick）
            sessions={snap?.projects ?? []}
          />
        </div>
      ) : null}
      {boardLayer}
    </>
  );
}

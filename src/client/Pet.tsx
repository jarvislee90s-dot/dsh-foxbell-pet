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
import { appStore, ackProject, cfgStore, petStore, voicePlayer, type ActivePetRuntime } from "./store";
import { apiPost, type ActivateResult, type GuardIssue, type ProjectCard } from "./api";
import { DOT_COLOR, DOT_HALO, lightOf, taskPoseOf } from "./statuscards";
import { t } from "./i18n";
import { PetMenu, type MenuPage } from "./PetMenu";
import { openDialog } from "./dialogs/host";

const BOTTOM_MARGIN = 76; // 精灵底边距视口底（v1 默认 bottom:76 落点，随 scale 缩放）
const LOOK_FRAME_MS = 250;
const LOOK_IDLE_MS = 6000;
const TRANSIENT_WAVE_MS = 1700;
const APPROVAL_THROTTLE_MS = 10_000;

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
  useEffect(() => petStore.subscribe(() => setVisible(petStore.visible)), []);

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
  const refreshAnim = () => {
    const s = stateRef.current;
    applyAnim(s.drag ?? s.transient ?? s.task ?? (s.look ? "look" : "idle"));
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

  // ---- 状态卡片差分（approval 10s 限流 / done / error）----
  const prevStatusRef = useRef<Record<string, string>>({});
  const lastApprovalAtRef = useRef(0);
  const sinceSeqRef = useRef<number | null>(null);

  useEffect(() => {
    if (!snap) return;
    const cards: ProjectCard[] = Array.isArray(snap.projects) ? snap.projects : [];
    // 完成事件：宿主 completions 队列按 seq 差分（v1 同款）
    const since = sinceSeqRef.current;
    sinceSeqRef.current = snap.seq;
    if (since !== null && Array.isArray(snap.completions)) {
      const fresh = snap.completions.filter((c) => c && typeof c.seq === "number" && c.seq > since);
      if (fresh.length > 0) playVoiceRef.current("done", cfgRef.current.doneAction);
    }
    // error / approval 差分
    const prev = prevStatusRef.current;
    const statuses: Record<string, string> = {};
    let errAppeared = false;
    let approvalAppeared = false;
    for (const p of cards) {
      if (!p || !p.id) continue;
      statuses[p.id] = p.status;
      if (p.status === "error" && prev[p.id] !== "error") errAppeared = true;
      if (p.status === "approval" && prev[p.id] !== "approval") approvalAppeared = true;
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
    // 任务姿态（MAM 口径）：waiting > running；全绿/无卡回落
    const task = taskPoseOf(cards);
    if (stateRef.current.task !== task) {
      stateRef.current.task = task;
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
  useEffect(() => {
    if (menu === null || !visible) return;
    const onDown = (e: PointerEvent) => { if (menuRef.current && menuRef.current.contains(e.target as Node)) return; closeMenu(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeMenu(); };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("pointerdown", onDown, true); window.removeEventListener("keydown", onKey); };
  }, [menu, visible, closeMenu]);

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
      genRef.current.look += 1; // 使在途 look 调度链失效
      stopPreview();
      if (fallRaf.current) { cancelAnimationFrame(fallRaf.current); fallRaf.current = 0; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!visible && fallRaf.current) { cancelAnimationFrame(fallRaf.current); fallRaf.current = 0; busyRef.current = false; }
  }, [visible]);

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

  if (!visible) return null;

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
        className="dyn-pet-root"
        style={rootStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
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
                    <div key={i} className="dyn-pet-proj-line" style={{ fontSize: px(11.5) }}>{l}</div>
                  )) : null}
                </div>
              </div>
            );
          })}
          {extra > 0 ? (
            <div className="dyn-pet-proj-more" style={{ fontSize: px(11) }}>+{extra} {t("card.more")}</div>
          ) : null}
        </div>
        {subtitle ? (
          <div
            className="dyn-pet-bubble"
            style={{ marginTop: px(8), padding: `${px(6)}px ${px(12)}px`, fontSize: px(13), borderRadius: px(12), maxWidth: px(320) }}
          >
            {subtitle}
          </div>
        ) : null}
        <div
          ref={spriteRef}
          className={"dyn-pet-sprite " + (dragging ? "dragging" : "")}
          style={{
            width: frameW, height: frameH,
            backgroundImage: runtime.spriteUrl ? `url('${runtime.spriteUrl}')` : undefined,
            backgroundPosition: style.backgroundPosition,
            backgroundSize: style.backgroundSize,
            backgroundRepeat: "no-repeat",
            cursor: dragging ? "grabbing" : "grab",
          }}
        />
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
          />
        </div>
      ) : null}
    </>
  );
}

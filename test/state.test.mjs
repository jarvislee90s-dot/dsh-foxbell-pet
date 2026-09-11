// 状态映射测试：B1 迁移后 readEvents/scanSession/derive/状态引擎与 v1.3.0 判定逻辑一致。
import { describe, expect, it } from "vitest";
import {
  blocksText, createStateEngine, derive, estimateTokens, readEvents, scanSession, truncate,
} from "../src/host/state.js";

/** rc.1 形态的假 Session：snapshotEvents() 方法（无 events 属性） */
function fakeSession(events) {
  return { snapshotEvents: () => Object.freeze(events.map((e) => Object.freeze(e))) };
}

const ev = (type, seq, data) => ({ type, seq, time: 0, data });

describe("readEvents (B1)", () => {
  it("reads from snapshotEvents()", () => {
    const s = fakeSession([ev("turn/start", 1, { turn: 1 })]);
    expect(readEvents(s)).toHaveLength(1);
    expect(readEvents(s)[0].type).toBe("turn/start");
  });
  it("returns [] when method missing / throws / null session", () => {
    expect(readEvents({})).toEqual([]);
    expect(readEvents(null)).toEqual([]);
    expect(readEvents({ snapshotEvents: () => { throw new Error("boom"); } })).toEqual([]);
  });
});

describe("text helpers (v1 parity)", () => {
  it("blocksText joins text blocks only", () => {
    expect(blocksText([{ type: "text", text: "a" }, { type: "image" }, { type: "text", text: "b" }])).toBe("a\nb");
    expect(blocksText(null)).toBe("");
  });
  it("estimateTokens counts CJK per char, latin per word", () => {
    expect(estimateTokens("你好世界")).toBe(4);
    expect(estimateTokens("hello world")).toBe(2);
    expect(estimateTokens("hi 你好")).toBe(3);
  });
  it("truncate appends ellipsis beyond maxTokens", () => {
    expect(truncate("short", 24)).toBe("short");
    const long = "词".repeat(40);
    const t = truncate(long, 24);
    expect(t.endsWith("…")).toBe(true);
    expect(estimateTokens(t.slice(0, -1))).toBe(24);
  });
});

describe("scanSession", () => {
  it("detects pending approval (asked without decided)", () => {
    const s = fakeSession([
      ev("turn/start", 1, { turn: 1 }),
      ev("approval/asked", 2, { id: "a1", toolName: "Bash" }),
    ]);
    const info = scanSession(s, () => ({ title: "T" }));
    expect(info.pendingApproval).toBe(true);
    expect(info.title).toBe("T");
  });
  it("decided approval clears pending", () => {
    const s = fakeSession([
      ev("approval/asked", 2, { id: "a1" }),
      ev("approval/decided", 3, { id: "a1", outcome: "allowed-once" }),
    ]);
    expect(scanSession(s).pendingApproval).toBe(false);
  });
  it("captures latest turn/end reason and newest turn/start seq", () => {
    const s = fakeSession([
      ev("turn/start", 1, { turn: 1 }),
      ev("turn/end", 2, { turn: 1, reason: { kind: "completed" } }),
      ev("turn/start", 3, { turn: 2 }),
      ev("turn/end", 4, { turn: 2, reason: { kind: "error", error: { message: "boom", code: "E" } } }),
    ]);
    const info = scanSession(s);
    expect(info.lastEnd).toEqual({ seq: 4, kind: "error", error: "boom" });
    expect(info.latestTurnStartSeq).toBe(3);
  });
  it("collects up to 2 latest status lines from newest events", () => {
    const s = fakeSession([
      ev("user/message", 1, { content: [{ type: "text", text: "第一行任务" }] }),
      ev("tool/call", 2, { name: "Bash", arguments: "ls" }),
      ev("assistant/message", 3, { message: { content: [{ type: "text", text: "做完了" }] } }),
    ]);
    const info = scanSession(s);
    expect(info.lines[0]).toBe("做完了");
    expect(info.lines[1]).toBe("运行 Bash ls");
  });
});

describe("derive (priority error > approval > running > done)", () => {
  const agent = { id: "p1", status: "running" };
  const base = { title: "T", lines: ["l"], lastEnd: null, latestTurnStartSeq: null, pendingApproval: false };

  it("error wins over approval and running", () => {
    const info = { ...base, lastEnd: { seq: 5, kind: "error", error: "x" }, pendingApproval: true };
    expect(derive(agent, info, undefined, false).status).toBe("error");
  });
  it("newer turn/start suppresses stale error", () => {
    const info = { ...base, lastEnd: { seq: 5, kind: "error", error: "x" }, latestTurnStartSeq: 6 };
    expect(derive({ ...agent }, info, undefined, false).status).toBe("running");
  });
  it("approval over running", () => {
    const info = { ...base, pendingApproval: true };
    expect(derive(agent, info, undefined, false).status).toBe("approval");
  });
  it("running when agent running", () => {
    expect(derive(agent, base, undefined, false).status).toBe("running");
  });
  it("done on new completion; acked done disappears", () => {
    const idle = { id: "p1", status: "idle" };
    const d = derive(idle, base, { lastTurnEndSeq: 1, status: "running", unread: false }, true);
    expect(d.status).toBe("done");
    expect(d.unread).toBe(true);
    // 已读后（unread=false）不再出卡
    const d2 = derive(idle, base, { lastTurnEndSeq: 9, status: "done", unread: false }, false);
    expect(d2).toBe(null);
  });
  it("error unread keeps card until ack", () => {
    const info = { ...base, lastEnd: { seq: 5, kind: "error", error: "x" } };
    const first = derive({ id: "p", status: "idle" }, info, undefined, false);
    expect(first.status).toBe("error");
    // 同一 lastEnd（非 fresh）且已读 → 消失
    const acked = derive({ id: "p", status: "idle" }, info, { lastTurnEndSeq: 5, status: "error", unread: false }, false);
    expect(acked).toBe(null);
    // 未读保持
    const kept = derive({ id: "p", status: "idle" }, info, { lastTurnEndSeq: 5, status: "error", unread: true }, false);
    expect(kept.status).toBe("error");
  });
});

describe("state engine", () => {
  function harness(roots, sessions) {
    let now = 1000;
    const eng = createStateEngine({
      roots: () => roots,
      getSession: (id) => sessions.get(id),
      getTitle: () => undefined,
      now: () => now,
    });
    return { eng, setNow: (n) => { now = n; } };
  }

  it("emits completion events once per new turn/end", () => {
    const events = [
      ev("turn/start", 1, { turn: 1 }),
      ev("turn/end", 2, { turn: 1, reason: { kind: "completed" } }),
    ];
    const sessions = new Map([["p1", fakeSession(events)]]);
    const { eng } = harness([{ id: "p1", status: "idle" }], sessions);
    eng.compute(); // 首轮：prev undefined → newCompletion=false（v1 语义）
    expect(eng.queue).toHaveLength(0);
    events.push(ev("turn/start", 3, { turn: 2 }), ev("turn/end", 4, { turn: 2, reason: { kind: "completed" } }));
    eng.compute();
    expect(eng.queue).toHaveLength(1);
    expect(eng.queue[0].agentId).toBe("p1");
    const seqBefore = eng.queue[0].seq;
    eng.compute(); // 无新 end：不再入队
    expect(eng.queue).toHaveLength(1);
    expect(eng.queue[0].seq).toBe(seqBefore);
  });

  it("running vanish → error(断联); cleanup after 60s", () => {
    const sessions = new Map([["p1", fakeSession([ev("turn/start", 1, { turn: 1 })])]]);
    const roots = [{ id: "p1", status: "running" }];
    const { eng, setNow } = harness(roots, sessions);
    eng.compute();
    expect(eng.list()[0].status).toBe("running");
    roots.length = 0; // 从 roots 消失
    setNow(2000);
    eng.compute();
    expect(eng.list()[0].status).toBe("error");
    expect(eng.list()[0].lines).toEqual(["断联"]);
    setNow(2000 + 61000);
    eng.compute();
    expect(eng.list()).toHaveLength(0);
  });

  it("ack clears unread", () => {
    const sessions = new Map([["p1", fakeSession([
      ev("turn/start", 1, { turn: 1 }),
      ev("turn/end", 2, { turn: 1, reason: { kind: "error", error: { message: "x" } } }),
    ])]]);
    const { eng } = harness([{ id: "p1", status: "idle" }], sessions);
    eng.compute();
    expect(eng.list()[0].unread).toBe(true);
    eng.ack("p1");
    expect(eng.projects.get("p1").unread).toBe(false);
  });

  it("list() carries age label from last event time (v2.1 卡片年龄标注)", () => {
    // 注意：scanInfo 以 `ev.time > lastEventTime(null)` 记最后事件，time=0 不入（源同款），须用真实时间戳
    const at = (time, type, seq, data) => ({ ...ev(type, seq, data), time });
    const events = [
      at(60000, "turn/start", 1, { turn: 1 }),
      at(60000, "user/message", 2, { content: [{ type: "text", text: "hi" }] }),
    ];
    const sessions = new Map([["p1", fakeSession(events)]]);
    const { eng, setNow } = harness([{ id: "p1", status: "running" }], sessions);
    setNow(105000); // 距最后事件 45s
    eng.compute();
    expect(eng.list()[0].age).toBe("45s");
    setNow(230000); // 距最后事件 170s → 2m
    eng.compute();
    expect(eng.list()[0].age).toBe("2m");
  });

  it("list() age falls back to '' when session unresolvable (metrics 缺失路径)", () => {
    const { eng } = harness([{ id: "ghost", status: "running" }], new Map());
    eng.compute();
    expect(eng.list()[0].age).toBe("");
  });

  it("sorts error > approval > running > done", () => {
    const sessions = new Map([
      ["d", fakeSession([ev("turn/start", 1, {}), ev("turn/end", 2, { reason: { kind: "completed" } })])],
      ["r", fakeSession([ev("turn/start", 1, {})])],
      ["a", fakeSession([ev("approval/asked", 1, { id: "x" })])],
      ["e", fakeSession([ev("turn/end", 1, { reason: { kind: "error", error: { message: "m" } } })])],
    ]);
    const { eng } = harness(
      [
        { id: "d", status: "idle" },
        { id: "r", status: "running" },
        { id: "a", status: "running" },
        { id: "e", status: "idle" },
      ],
      sessions,
    );
    eng.compute(); // done 需要 newCompletion：首轮 prev undefined → d 无卡
    const order = eng.list().map((p) => p.status);
    expect(order).toEqual(["error", "approval", "running"]);
  });
});

// v2.2 Task 4（P1 增量缓存）：fp（事件数:末事件 seq）未变 → 复用 scan+folded 不重扫；fp 变化才重扫。
describe("state engine 指纹增量缓存", () => {
  it("engine caches per-session folds by fingerprint and rescans only on change", () => {
    let evts = [{ type: "turn/start", seq: 1, time: 1000, data: { turn: 0 } }];
    const deps = {
      roots: () => [{ id: "a" }],
      getSession: () => ({ snapshotEvents: () => evts }),
      getTitle: () => "A",
      now: () => 2000,
    };
    const eng = createStateEngine(deps);
    eng.compute();
    evts = evts.slice(); // 同长度同末 seq（新数组）：fp 不变
    eng.compute();
    expect(eng.stats.rescans).toBe(1); // 第二轮 fp 相同 → 0 次新增重扫（首轮算 1）
    evts = [...evts, { type: "turn/end", seq: 2, time: 1500, data: { turn: 0, reason: { kind: "stop" } } }];
    eng.compute();
    expect(eng.stats.rescans).toBe(2); // fp 变化 → 重扫
  });
});

// v2.2 Task 4 引擎侧快照扩展：usage.counts（projects Map 计数并入）+ trend 整点锚定节流。
describe("state engine v2.2 快照扩展", () => {
  it("usage.counts 由引擎从 projects Map 并入（approval/running/done 计数；仅 status 非空）", () => {
    const sessions = new Map([
      ["a", fakeSession([ev("turn/start", 1, { turn: 1 })])], // root running + 开着 turn → running
      ["b", fakeSession([ev("approval/asked", 1, { id: "x" })])], // 未决审批 → approval
    ]);
    const eng = createStateEngine({
      roots: () => [{ id: "a", status: "running" }, { id: "b", status: "idle" }],
      getSession: (id) => sessions.get(id),
      getTitle: () => undefined,
      now: () => 1000,
    });
    eng.compute();
    expect(eng.dashboard().usage.counts).toEqual({ approval: 1, running: 1, done: 0 });
  });

  it("trend 整点锚定节流：fp 与整点未变时复用同一缓存引用，fp 变化才重算", () => {
    const events = [ev("turn/start", 1, { turn: 1 })];
    const sessions = new Map([["p1", fakeSession(events)]]);
    const eng = createStateEngine({
      roots: () => [{ id: "p1", status: "running" }],
      getSession: (id) => sessions.get(id),
      getTitle: () => undefined,
      now: () => 1000,
    });
    eng.compute();
    const t1 = eng.dashboard().usage.trend;
    eng.compute(); // fp 未变 + 同整点 → 复用缓存（同引用）
    expect(eng.dashboard().usage.trend).toBe(t1);
    events.push({ type: "assistant/message", seq: 2, time: 900, data: { turn: 1, step: 0, usage: { inputTokens: 10, outputTokens: 5 } } });
    eng.compute(); // fp 变化 → 重算（新引用；形状不变：14 日 + 24 桶）
    const t2 = eng.dashboard().usage.trend;
    expect(t2).not.toBe(t1);
    expect(t2.days).toHaveLength(14);
    expect(t2.hours).toHaveLength(24);
  });
});

// ---- 终审修复：contentRev 补齐审批等待量化 + 项目 id（rows 由 status:unread:title:lines
// 扩为 id:status:unread:title:lines；末段追加量化 max approval waitMin）。审批挂起期间
// （agent 阻塞 → 零事件 → 其余 rev 输入全稳）rev 仍每整分钟推进，客户端 waitMin 门槛
// （标题闪烁）不再被稳定 rev 冻结；age 依旧不参与。
describe("contentRev 审批等待量化 + 项目 id（终审修复）", () => {
  function approvalEngine(nowRef) {
    const events = [
      { type: "turn/start", seq: 1, time: 1000, data: { turn: 1 } },
      { type: "approval/asked", seq: 2, time: 60000, data: { id: "a1" } },
    ];
    const eng = createStateEngine({
      roots: () => [{ id: "p1", status: "running" }],
      // rc.1 冻结数组契约保持：每次快照返回冻结拷贝，源数组可变（decided 用例事后补事件）
      getSession: () => ({ snapshotEvents: () => Object.freeze(events.slice()) }),
      getTitle: () => undefined,
      now: () => nowRef.now,
      readConfig: () => ({ paceEnabled: false }), // 关 pace：waitMin 成为唯一随钟推进的 rev 输入
    });
    return { eng, events };
  }

  it("pending approval：rev 同一分钟内稳定、跨过下一整分钟后推进（waitMin 量化进 rev）；age 仍不参与", () => {
    const ref = { now: 61000 };
    const { eng } = approvalEngine(ref);
    eng.compute();
    expect(eng.list()[0].status).toBe("approval");
    expect(eng.dashboard().approvals).toHaveLength(1);
    expect(eng.dashboard().approvals[0].waitMin).toBe(0);
    const rev1 = eng.contentRev();
    ref.now = 90000; // +30s 仍在同一分钟：waitMin 0→0，ages 推进而 rev 稳定
    eng.compute();
    expect(eng.list()[0].age).toBe("30s"); // ages 每轮现算（短路响应的 ages 字段仍刷新）
    expect(eng.contentRev()).toBe(rev1);
    ref.now = 121000; // +60s：waitMin 0→1 → rev 推进（挂起期间每整分钟一次）
    eng.compute();
    expect(eng.dashboard().approvals[0].waitMin).toBe(1);
    expect(eng.contentRev()).not.toBe(rev1);
  });

  it("decided 后审批清除 → 量化 wait 段归 0（rev 末段回 0）", () => {
    const ref = { now: 61000 };
    const { eng, events } = approvalEngine(ref);
    eng.compute();
    const pendingRev = eng.contentRev();
    events.push({ type: "approval/decided", seq: 3, time: 70000, data: { id: "a1", outcome: "allowed-once" } });
    eng.compute();
    expect(eng.dashboard().approvals).toHaveLength(0);
    const rev = eng.contentRev();
    expect(rev).not.toBe(pendingRev);
    expect(rev.endsWith("#0")).toBe(true); // 末段 = 量化 max waitMin 归 0
  });

  it("rows 含项目 id：不同 id、同 status/unread/title/lines 的两引擎 rev 不同", () => {
    const mkRev = (id) => {
      const eng = createStateEngine({
        roots: () => [{ id, status: "running" }],
        getSession: () => ({ snapshotEvents: () => Object.freeze([{ type: "turn/start", seq: 1, time: 1000, data: { turn: 1 } }]) }),
        getTitle: () => ({ title: "同题" }),
        now: () => 2000,
        readConfig: () => ({ paceEnabled: false }),
      });
      eng.compute();
      return eng.contentRev();
    };
    expect(mkRev("p1")).not.toBe(mkRev("zz9"));
  });

  it("队列帽 8 后零用量补完成仍推进 rev（completion 不被 unchanged 短路吞掉）", () => {
    const ref = { now: 2000 };
    const events = [];
    const eng = createStateEngine({
      roots: () => [{ id: "p1", status: "idle" }],
      getSession: () => ({ snapshotEvents: () => Object.freeze(events.slice()) }),
      getTitle: () => undefined,
      now: () => ref.now,
      readConfig: () => ({ paceEnabled: false }),
    });
    const pushTurn = (n) => {
      events.push({ type: "turn/start", seq: n * 2 + 1, time: ref.now, data: { turn: n } });
      events.push({ type: "turn/end", seq: n * 2 + 2, time: ref.now, data: { turn: n, reason: { kind: "completed" } } });
      ref.now += 1000;
      eng.compute();
    };
    for (let n = 0; n < 9; n++) pushTurn(n); // 9 次完成 → 队列帽：长度恒 8
    expect(eng.queue).toHaveLength(8);
    const revBefore = eng.contentRev();
    pushTurn(9); // 第 10 次：行内容不变（done+unread/同题/已完成）、零用量、pace 关
    expect(eng.queue).toHaveLength(8);
    expect(eng.queue[eng.queue.length - 1].seq).toBeGreaterThan(0);
    expect(eng.contentRev()).not.toBe(revBefore); // review Important#1：队列末 seq 必须推动 rev
  });
});

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

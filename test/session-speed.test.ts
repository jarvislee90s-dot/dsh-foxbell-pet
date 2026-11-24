import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acceptSessionSpeed,
  createSessionSpeedPoller,
  SESSION_SPEED_POLL_MS,
  type SessionSpeed,
} from "../src/client/session-speed";
// @ts-expect-error host JavaScript modules intentionally have no TypeScript declarations
import { readSessionSpeed } from "../src/host/speed.js";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("readSessionSpeed native projection", () => {
  it("reads only the loaded session and calculates 1000 tokens / 8000 ms = 125", () => {
    const session = { id: "a" };
    const sessions = { get: vi.fn(() => session) };
    const snapshot = vi.fn(() => ({ values: { sessionStats: { decodeTokens: 1000, decodeMs: 8000 } } }));
    expect(readSessionSpeed({ sessions, projections: { snapshot } }, "a")).toEqual({
      sessionId: "a", tps: 125, status: "ready",
    });
    expect(sessions.get).toHaveBeenCalledWith("a");
    expect(snapshot).toHaveBeenCalledWith(session, new Set(["sessionStats"]));
  });

  it("distinguishes unsupported fields from a valid projection with no sample", () => {
    const projections = (sessionStats: unknown) => ({ snapshot: () => ({ values: { sessionStats } }) });
    const services = (sessionStats: unknown) => ({
      sessions: { get: () => ({ id: "a" }) }, projections: projections(sessionStats),
    });
    expect(readSessionSpeed(services(undefined), "a").status).toBe("unsupported");
    expect(readSessionSpeed(services({ decodeTokens: 10 }), "a").status).toBe("unsupported");
    expect(readSessionSpeed(services({ decodeTokens: 0, decodeMs: 0 }), "a")).toEqual({
      sessionId: "a", tps: null, status: "empty",
    });
    expect(readSessionSpeed(services({ decodeTokens: 10, decodeMs: 0 }), "a").status).toBe("empty");
    expect(readSessionSpeed(services({ decodeTokens: -1, decodeMs: 10 }), "a").status).toBe("unsupported");
    expect(readSessionSpeed({ sessions: { get: () => undefined }, projections: projections({}) }, "a").status).toBe("empty");
    expect(readSessionSpeed({ sessions: { get: () => ({}) } }, "a").status).toBe("unsupported");
  });

  it("contains projection failures and never turns them into zero", () => {
    const result = readSessionSpeed({
      sessions: { get: () => ({ id: "a" }) },
      projections: { snapshot: () => { throw new Error("not available"); } },
    }, "a");
    expect(result).toEqual({ sessionId: "a", tps: null, status: "unsupported" });
  });
});

describe("acceptSessionSpeed", () => {
  it("accepts only the current session's valid ready reading", () => {
    expect(acceptSessionSpeed("b", { sessionId: "a", tps: 125, status: "ready" })).toBeNull();
    expect(acceptSessionSpeed("b", { sessionId: "b", tps: 80, status: "ready" })).toBe(80);
    expect(acceptSessionSpeed("b", { sessionId: "b", tps: 0, status: "ready" })).toBeNull();
    expect(acceptSessionSpeed("b", { sessionId: "b", tps: null, status: "empty" })).toBeNull();
    expect(acceptSessionSpeed(null, { sessionId: "b", tps: 80, status: "ready" })).toBeNull();
    expect(acceptSessionSpeed("b", null)).toBeNull();
  });
});

describe("headless session speed polling", () => {
  it("clears on session changes and ignores an older in-flight response", async () => {
    const a = deferred<SessionSpeed>();
    const b = deferred<SessionSpeed>();
    const values: Array<number | null> = [];
    const read = vi.fn((id: string) => id === "a" ? a.promise : b.promise);
    const poller = createSessionSpeedPoller({ read, onValue: (value) => values.push(value), document: null });
    poller.update("a", true);
    poller.update("b", true);
    expect(values).toEqual([null, null]);
    a.resolve({ sessionId: "a", tps: 125, status: "ready" });
    await a.promise;
    await Promise.resolve();
    expect(values).toEqual([null, null]);
    b.resolve({ sessionId: "b", tps: 80, status: "ready" });
    await b.promise;
    await Promise.resolve();
    expect(values).toEqual([null, null, 80]);
    poller.update(null, true);
    expect(values).toEqual([null, null, 80, null]);
    poller.dispose();
  });

  it("stops unsupported polling until the session changes instead of filling zero", async () => {
    vi.useFakeTimers();
    const read = vi.fn(async (sessionId: string): Promise<SessionSpeed> => ({ sessionId, tps: null, status: "unsupported" }));
    const values: Array<number | null> = [];
    const poller = createSessionSpeedPoller({ read, onValue: (value) => values.push(value), document: null });
    poller.update("a", true);
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(1);
    expect(values).toEqual([null, null]);
    await vi.advanceTimersByTimeAsync(SESSION_SPEED_POLL_MS * 6);
    expect(read).toHaveBeenCalledTimes(1);
    poller.update("b", true);
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(2);
    poller.dispose();
  });

  it("handles current-generation 404 failures, clears the value, and stops legacy polling", async () => {
    vi.useFakeTimers();
    const failure = Object.assign(new Error("not found"), { status: 404 });
    const read = vi.fn(async (): Promise<SessionSpeed> => { throw failure; });
    const values: Array<number | null> = [];
    const errors: unknown[] = [];
    const poller = createSessionSpeedPoller({ read, onValue: (value) => values.push(value), onError: (error) => errors.push(error), document: null });
    poller.update("a", true);
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(1);
    expect(values).toEqual([null, null]);
    expect(errors).toEqual([failure]);
    await vi.advanceTimersByTimeAsync(SESSION_SPEED_POLL_MS * 4);
    expect(read).toHaveBeenCalledTimes(1);
    poller.dispose();
  });

  it("polls at most once per five seconds and stops while hidden or disposed", async () => {
    vi.useFakeTimers();
    let hidden = false;
    let listener: (() => void) | undefined;
    const documentLike = {
      get hidden() { return hidden; },
      addEventListener: (_type: string, fn: () => void) => { listener = fn; },
      removeEventListener: () => { listener = undefined; },
    };
    const read = vi.fn(async (sessionId: string): Promise<SessionSpeed> => ({ sessionId, tps: 80, status: "ready" }));
    const poller = createSessionSpeedPoller({ read, onValue: () => {}, document: documentLike });
    poller.update("a", true);
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(SESSION_SPEED_POLL_MS - 1);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(2);

    hidden = true;
    listener?.();
    const calls = read.mock.calls.length;
    await vi.advanceTimersByTimeAsync(SESSION_SPEED_POLL_MS * 3);
    expect(read).toHaveBeenCalledTimes(calls);
    hidden = false;
    listener?.();
    expect(read).toHaveBeenCalledTimes(calls + 1);
    poller.update("a", false);
    const inactiveCalls = read.mock.calls.length;
    await vi.advanceTimersByTimeAsync(SESSION_SPEED_POLL_MS * 2);
    expect(read).toHaveBeenCalledTimes(inactiveCalls);
    poller.dispose();
  });
});

// Current-session DSH speed acceptance and visibility-aware polling. The polling controller
// is headless for Node tests; useSessionSpeed is a thin React adapter for the client bundle.
import React from "react";
import { apiGet } from "./api";
import { appStore } from "./store";

export interface SessionSpeed {
  sessionId: string;
  tps: number | null;
  status: "ready" | "empty" | "unsupported";
}

export const SESSION_SPEED_POLL_MS = 5_000;

let sharedRead: { id: string; at: number; promise: Promise<SessionSpeed> } | null = null;

export function apiGetSessionSpeed(sessionId: string): Promise<SessionSpeed> {
  const now = Date.now();
  if (sharedRead?.id === sessionId && now - sharedRead.at < 4_500) return sharedRead.promise;
  const promise = apiGet<SessionSpeed>(`/dashboard/session-speed?sessionId=${encodeURIComponent(sessionId)}`);
  sharedRead = { id: sessionId, at: now, promise };
  promise.catch(() => {
    // Transport failures may be retried; unsupported responses are stopped by the controller.
    if (sharedRead?.promise === promise) sharedRead = null;
  });
  return promise;
}

/** A response for another/currently-cleared session can never populate the mini bar. */
export function acceptSessionSpeed(
  currentId: string | null | undefined,
  response: SessionSpeed | null | undefined,
): number | null {
  if (!currentId || !response || response.sessionId !== currentId || response.status !== "ready") return null;
  return typeof response.tps === "number" && Number.isFinite(response.tps) && response.tps > 0 ? response.tps : null;
}

export type SessionSpeedReader = (sessionId: string) => SessionSpeed | Promise<SessionSpeed>;
export interface SessionSpeedDocument {
  readonly hidden: boolean;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}
export interface SessionSpeedPollerOptions {
  read: SessionSpeedReader;
  onValue: (tps: number | null) => void;
  onError?: (error: unknown) => void;
  /** Null disables visibility integration (useful for non-DOM hosts and tests). */
  document?: SessionSpeedDocument | null;
  intervalMs?: number;
  setTimeout?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout?: (timer: ReturnType<typeof setTimeout>) => void;
}
export interface SessionSpeedPoller {
  update(sessionId: string | null | undefined, active: boolean): void;
  refresh(): void;
  dispose(): void;
}

function browserDocument(): SessionSpeedDocument | null {
  return typeof document === "undefined" ? null : document;
}

/**
 * One in-flight request per controller, followed by a five-second delay. Changing id/active
 * or hiding the document invalidates old responses and cancels the next scheduled request.
 */
export function createSessionSpeedPoller(options: SessionSpeedPollerOptions): SessionSpeedPoller {
  const read = options.read;
  const onValue = options.onValue;
  const onError = options.onError ?? (() => {});
  const intervalMs = options.intervalMs ?? SESSION_SPEED_POLL_MS;
  const scheduleTimeout = options.setTimeout ?? ((callback, ms) => setTimeout(callback, ms));
  const cancelTimeout = options.clearTimeout ?? ((timer) => clearTimeout(timer));
  const doc = options.document === undefined ? browserDocument() : options.document;
  let currentId: string | null = null;
  let active = false;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let unsupported = false;

  const clearTimer = () => {
    if (timer !== null) cancelTimeout(timer);
    timer = null;
  };
  const canPoll = () => !disposed && !unsupported && active && currentId !== null && !(doc?.hidden ?? false);

  const schedule = (gen: number) => {
    if (gen !== generation || !canPoll()) return;
    timer = scheduleTimeout(() => {
      timer = null;
      if (gen === generation && canPoll()) poll(gen);
    }, intervalMs);
  };

  const poll = (gen: number) => {
    const id = currentId;
    if (id === null || gen !== generation || !canPoll()) return;
    let request: SessionSpeed | Promise<SessionSpeed>;
    try {
      request = read(id);
    } catch (error) {
      if (gen === generation) {
        onError(error);
        schedule(gen);
      }
      return;
    }
    void Promise.resolve(request)
      .then((response) => {
        if (gen !== generation || disposed || currentId !== id) return;
        if (response.status === "unsupported") unsupported = true;
        onValue(acceptSessionSpeed(id, response));
      })
      .catch((error: unknown) => {
        if (gen === generation && !disposed) {
          const status = (error as { status?: number; code?: string })?.status;
          const code = (error as { code?: string })?.code;
          if (status === 404 || status === 403 || code === "capability-unavailable" || code === "owner-required") {
            unsupported = true;
            onValue(null);
          }
          onError(error);
        }
      })
      .finally(() => schedule(gen));
  };

  const restart = (clearValue: boolean) => {
    generation += 1;
    clearTimer();
    if (clearValue) onValue(null);
    if (canPoll()) poll(generation);
  };
  const onVisibility = () => restart(false);
  doc?.addEventListener("visibilitychange", onVisibility);

  return {
    update(sessionId, nextActive) {
      const id = typeof sessionId === "string" && sessionId.length > 0 ? sessionId : null;
      const next = !!nextActive;
      if (id === currentId && next === active) return;
      if (id !== currentId || !next) unsupported = false;
      currentId = id;
      active = next;
      restart(true);
    },
    refresh() {
      if (canPoll()) restart(false);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      clearTimer();
      doc?.removeEventListener("visibilitychange", onVisibility);
    },
  };
}

interface Reading {
  id: string | null;
  tps: number | null;
}

/** Poll only while the owning mini bar/speed page is active and the document is visible. */
export function useSessionSpeed(sessionId: string | null | undefined, active: boolean): number | null {
  const id = typeof sessionId === "string" && sessionId.length > 0 ? sessionId : null;
  const snap = React.useSyncExternalStore(appStore.subscribe, appStore.getSnapshot);
  const enabled = active && snap?.diag?.additiveApiCapability === true && snap?.diag?.sessionSpeedCapability === true;
  const [reading, setReading] = React.useState<Reading>({ id: null, tps: null });
  React.useEffect(() => {
    setReading({ id, tps: null });
    const poller = createSessionSpeedPoller({
      read: apiGetSessionSpeed,
      onValue: (tps) => setReading({ id, tps }),
      onError: () => setReading({ id, tps: null }),
    });
    poller.update(id, enabled);
    return () => poller.dispose();
  }, [id, enabled]);
  // Effects run after render; tagging the value prevents one-frame stale display on id changes.
  return enabled && reading.id === id ? reading.tps : null;
}

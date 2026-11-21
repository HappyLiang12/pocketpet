import { describe, expect, it } from "vitest";
import { WAKE_LABELS, keepAwake, type WakeStatus } from "../web/src/wake.js";

function createSentinel() {
  const listeners: Array<() => void> = [];
  let released = false;
  return {
    get released(): boolean {
      return released;
    },
    async release(): Promise<void> {
      released = true;
    },
    addEventListener(type: string, listener: () => void): void {
      if (type === "release") listeners.push(listener);
    },
    fireRelease(): void {
      for (const listener of [...listeners]) listener();
    },
  };
}

type FakeSentinel = ReturnType<typeof createSentinel>;

interface PendingRequest {
  type: string;
  resolve: (sentinel: FakeSentinel) => void;
  reject: (error: unknown) => void;
}

function setup(options: { secure?: boolean; api?: boolean } = {}) {
  const pending: PendingRequest[] = [];
  const docListeners = new Set<() => void>();
  let visibilityState: "visible" | "hidden" = "visible";

  const doc = {
    get visibilityState(): "visible" | "hidden" {
      return visibilityState;
    },
    addEventListener(type: string, listener: () => void): void {
      if (type === "visibilitychange") docListeners.add(listener);
    },
    removeEventListener(type: string, listener: () => void): void {
      docListeners.delete(listener);
    },
  };
  const win = {
    isSecureContext: options.secure ?? true,
    navigator: {
      wakeLock: options.api === false ? undefined : {
        request(type: string): Promise<FakeSentinel> {
          return new Promise<FakeSentinel>((resolve, reject) => {
            pending.push({ type, resolve, reject });
          });
        },
      },
    },
  };

  const statuses: WakeStatus[] = [];
  const stop = keepAwake((status) => statuses.push(status), { win, doc });
  const setVisibility = (state: "visible" | "hidden"): void => {
    visibilityState = state;
    for (const listener of [...docListeners]) listener();
  };

  return { pending, statuses, stop, setVisibility, docListeners };
}

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("WAKE_LABELS", () => {
  it("localizes every wake status", () => {
    expect(WAKE_LABELS).toEqual({
      active: "已啟用",
      idle: "待命",
      denied: "已拒絕",
      unsupported: "不支援",
      insecure: "非安全連線，請設定螢幕逾時",
    });
  });
});

describe("keepAwake", () => {
  it("reports insecure contexts without requesting a lock", async () => {
    const { statuses, pending, stop } = setup({ secure: false });
    await flush();
    expect(statuses).toEqual(["insecure"]);
    expect(pending).toHaveLength(0);
    stop();
  });

  it("reports unsupported browsers without requesting a lock", async () => {
    const { statuses, pending, stop } = setup({ api: false });
    await flush();
    expect(statuses).toEqual(["unsupported"]);
    expect(pending).toHaveLength(0);
    stop();
  });

  it("reports denied when the request rejects", async () => {
    const { statuses, pending, stop } = setup();
    pending[0]!.reject(new Error("not allowed"));
    await flush();
    expect(statuses).toEqual(["denied"]);
    stop();
  });

  it("reports active, then idle and re-acquires after a visible release", async () => {
    const { statuses, pending, stop } = setup();
    const first = createSentinel();
    pending[0]!.resolve(first);
    await flush();
    expect(statuses).toEqual(["active"]);
    expect(pending).toHaveLength(1);

    first.fireRelease();
    await flush();
    expect(statuses).toEqual(["active", "idle"]);
    expect(pending).toHaveLength(2);

    pending[1]!.resolve(createSentinel());
    await flush();
    expect(statuses).toEqual(["active", "idle", "active"]);
    stop();
  });

  it("ignores a stale release from a previous sentinel", async () => {
    const { statuses, pending, stop } = setup();
    const first = createSentinel();
    pending[0]!.resolve(first);
    await flush();

    first.fireRelease();
    await flush();
    expect(pending).toHaveLength(2);
    const second = createSentinel();
    pending[1]!.resolve(second);
    await flush();
    expect(statuses).toEqual(["active", "idle", "active"]);

    first.fireRelease();
    await flush();
    expect(statuses).toEqual(["active", "idle", "active"]);
    expect(pending).toHaveLength(2);

    second.fireRelease();
    await flush();
    expect(pending).toHaveLength(3);
    stop();
  });

  it("starts only one request when visibility changes during the first acquire", async () => {
    const { statuses, pending, stop, setVisibility } = setup();
    expect(pending).toHaveLength(1);

    setVisibility("hidden");
    setVisibility("visible");
    setVisibility("hidden");
    setVisibility("visible");
    expect(pending).toHaveLength(1);

    pending[0]!.resolve(createSentinel());
    await flush();
    expect(statuses).toEqual(["active"]);
    expect(pending).toHaveLength(1);
    stop();
  });

  it("releases an in-flight acquire and stays quiet when disposed", async () => {
    const { statuses, pending, stop, setVisibility, docListeners } = setup();
    expect(docListeners.size).toBe(1);

    stop();
    expect(docListeners.size).toBe(0);

    const late = createSentinel();
    pending[0]!.resolve(late);
    await flush();
    expect(late.released).toBe(true);
    expect(statuses).toEqual([]);
    expect(pending).toHaveLength(1);

    setVisibility("visible");
    await flush();
    expect(pending).toHaveLength(1);
  });
});

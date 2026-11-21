export type WakeStatus = "active" | "unsupported" | "denied" | "insecure" | "idle";

interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
}

interface WakeLockLike {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
}

export interface WakeEnvironment {
  win: {
    isSecureContext: boolean;
    navigator: { wakeLock?: WakeLockLike };
  };
  doc: {
    visibilityState: DocumentVisibilityState;
    addEventListener(type: "visibilitychange", listener: () => void): void;
    removeEventListener(type: "visibilitychange", listener: () => void): void;
  };
}

export function keepAwake(
  onChange: (status: WakeStatus) => void,
  env: WakeEnvironment = { win: window, doc: document },
): () => void {
  let sentinel: WakeLockSentinelLike | null = null;
  let disposed = false;
  let acquiring = false;

  const acquire = (): void => {
    if (disposed || sentinel || acquiring) return;
    if (!env.win.isSecureContext) { onChange("insecure"); return; }
    const wakeLock = env.win.navigator.wakeLock;
    if (!wakeLock) { onChange("unsupported"); return; }

    acquiring = true;
    void (async () => {
      try {
        const acquired = await wakeLock.request("screen");
        if (disposed) {
          acquired.release().catch(() => undefined);
          return;
        }
        sentinel = acquired;
        onChange("active");
        acquired.addEventListener("release", () => {
          if (sentinel !== acquired) return;
          sentinel = null;
          if (!disposed) onChange("idle");
          if (!disposed && env.doc.visibilityState === "visible") acquire();
        });
      } catch {
        if (!disposed) onChange("denied");
      } finally {
        acquiring = false;
      }
    })();
  };

  const onVisibility = (): void => { if (env.doc.visibilityState === "visible") acquire(); };
  env.doc.addEventListener("visibilitychange", onVisibility);
  acquire();

  return () => {
    disposed = true;
    env.doc.removeEventListener("visibilitychange", onVisibility);
    const current = sentinel;
    sentinel = null;
    current?.release().catch(() => undefined);
  };
}

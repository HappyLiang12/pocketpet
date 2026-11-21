export type WakeStatus = "active" | "unsupported" | "denied" | "insecure" | "idle";

export function keepAwake(onChange: (status: WakeStatus) => void): () => void {
  let sentinel: WakeLockSentinel | null = null;
  let disposed = false;

  const acquire = async (): Promise<void> => {
    if (disposed) return;
    if (!window.isSecureContext) { onChange("insecure"); return; }
    if (!("wakeLock" in navigator)) { onChange("unsupported"); return; }
    try {
      sentinel = await navigator.wakeLock.request("screen");
      onChange("active");
      sentinel.addEventListener("release", () => { sentinel = null; if (!disposed) onChange("idle"); });
    } catch {
      onChange("denied");
    }
  };

  const onVisibility = (): void => { if (document.visibilityState === "visible" && !sentinel) void acquire(); };
  document.addEventListener("visibilitychange", onVisibility);
  void acquire();

  return () => {
    disposed = true;
    document.removeEventListener("visibilitychange", onVisibility);
    sentinel?.release().catch(() => undefined);
  };
}

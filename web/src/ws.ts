export type ConnStatus = "connecting" | "open" | "closed";

export function connectState(onSnapshot: (snapshot: unknown) => void, onStatus: (status: ConnStatus) => void): () => void {
  let socket: WebSocket | null = null;
  let disposed = false;
  let attempt = 0;
  let timer: number | undefined;

  const open = (): void => {
    if (disposed) return;
    onStatus("connecting");
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    socket = new WebSocket(`${protocol}://${location.host}/ws`);
    socket.onopen = () => { attempt = 0; onStatus("open"); };
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data));
        if (data?.type === "snapshot") onSnapshot(data);
      } catch {
        return;
      }
    };
    socket.onclose = () => {
      if (disposed) return;
      onStatus("closed");
      const delay = Math.min(30_000, 1000 * 2 ** attempt++);
      timer = window.setTimeout(open, delay);
    };
    socket.onerror = () => socket?.close();
  };

  open();
  return () => {
    disposed = true;
    if (timer) window.clearTimeout(timer);
    socket?.close();
  };
}

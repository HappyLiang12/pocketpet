export type PetState = "idle" | "running-right" | "running-left" | "waving" | "jumping" | "failed" | "waiting" | "running" | "review";

export class PetRenderer {
  private state: PetState = "idle";
  private raf = 0;
  private started = performance.now();

  constructor(private canvas: HTMLCanvasElement) {}

  setState(state: PetState): void {
    this.state = state;
    this.started = performance.now();
  }

  start(): void {
    const loop = (now: number): void => {
      this.draw(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  private draw(now: number): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const bob = Math.sin((now - this.started) / 500) * (this.state === "idle" ? 3 : 1);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = this.state === "failed" ? "#ef4444" : this.state === "waiting" ? "#f59e0b" : "#7dd3fc";
    ctx.fillRect(56, 72 + bob, 80, 80);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(76, 96 + bob, 12, 16);
    ctx.fillRect(104, 96 + bob, 12, 16);
  }
}

export type PetState = "idle" | "running-right" | "running-left" | "waving" | "jumping" | "failed" | "waiting" | "running" | "review";

type StateDef = { row: number; frames: number[] };
const FRAME_W = 192;
const FRAME_H = 208;
const COLUMNS = 8;

function uniform(count: number, duration: number, last: number): number[] {
  return Array.from({ length: count }, (_, index) => (index === count - 1 ? last : duration));
}

const STATES: Record<PetState, StateDef> = {
  idle: { row: 0, frames: [280, 110, 110, 140, 140, 320] },
  "running-right": { row: 1, frames: uniform(8, 120, 220) },
  "running-left": { row: 2, frames: uniform(8, 120, 220) },
  waving: { row: 3, frames: uniform(4, 140, 280) },
  jumping: { row: 4, frames: uniform(5, 140, 280) },
  failed: { row: 5, frames: uniform(8, 140, 240) },
  waiting: { row: 6, frames: uniform(6, 150, 260) },
  running: { row: 7, frames: uniform(6, 120, 220) },
  review: { row: 8, frames: uniform(6, 150, 280) },
};

export class PetRenderer {
  private image: HTMLImageElement | null = null;
  private state: PetState = "idle";
  private frame = 0;
  private last = performance.now();
  private raf = 0;
  private generation = 0;

  constructor(private canvas: HTMLCanvasElement) {}

  async load(url: string): Promise<void> {
    const generation = ++this.generation;
    this.image = null;
    this.frame = 0;
    const image = new Image();
    image.src = url;
    await image.decode();
    if (generation !== this.generation) return;
    this.image = image;
    this.frame = 0;
  }

  setState(state: PetState): void {
    if (state === this.state) return;
    this.state = state;
    this.frame = 0;
    this.last = performance.now();
  }

  start(): void {
    cancelAnimationFrame(this.raf);
    const loop = (now: number): void => {
      this.draw(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.last = performance.now();
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  private draw(now: number): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const def = STATES[this.state];
    if (now - this.last >= (def.frames[this.frame] ?? 150)) {
      this.frame = (this.frame + 1) % def.frames.length;
      this.last = now;
    }
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.image) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.image, (this.frame % COLUMNS) * FRAME_W, def.row * FRAME_H, FRAME_W, FRAME_H, 0, 0, this.canvas.width, this.canvas.height);
      return;
    }
    const bob = Math.sin(now / 500) * (this.state === "idle" ? 3 : 1);
    ctx.fillStyle = this.state === "failed" ? "#ef4444" : this.state === "waiting" ? "#f59e0b" : "#7dd3fc";
    ctx.fillRect(56, 72 + bob, 80, 80);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(76, 96 + bob, 12, 16);
    ctx.fillRect(104, 96 + bob, 12, 16);
  }
}

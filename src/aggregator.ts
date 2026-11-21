import type { AgentId, NormalizedEvent, Phase } from "./events.js";

export const PET_STATES = ["idle", "running-right", "running-left", "waving", "jumping", "failed", "waiting", "running", "review"] as const;
export type PetState = (typeof PET_STATES)[number];

export interface SessionView {
  key: string;
  agent: AgentId;
  sessionId: string;
  project: string;
  phase: Phase;
  tool?: string;
  startedAt: number;
  lastEventAt: number;
}

export interface Snapshot {
  type: "snapshot";
  now: number;
  pet: PetState;
  sessions: SessionView[];
  activePet: string | null;
  sleepAfterMinutes: number;
  quietHours: { start: string; end: string } | null;
}

type Extra = { sleepAfterMinutes: number; quietHours: { start: string; end: string } | null };
type Flash = { state: PetState; until: number };
type Options = { now?: () => number; ttlMs?: number; flashMs?: number; waveMs?: number };

const PHASE_ORDER: Record<Phase, number> = { waiting: 0, working: 1, review: 2, done: 3, failed: 4, started: 5, idle: 6 };

export class Aggregator {
  private readonly sessions = new Map<string, SessionView>();
  private failedFlash: Flash | null = null;
  private activityFlash: Flash | null = null;
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly flashMs: number;
  private readonly waveMs: number;

  constructor(opts: Options = {}) {
    this.now = opts.now ?? Date.now;
    this.ttlMs = opts.ttlMs ?? 15 * 60_000;
    this.flashMs = opts.flashMs ?? 2500;
    this.waveMs = opts.waveMs ?? 1500;
  }

  apply(event: NormalizedEvent): void {
    const key = `${event.agent}:${event.sessionId}`;
    if (event.phase === "idle") {
      this.sessions.delete(key);
      return;
    }
    const now = this.now();
    const prev = this.sessions.get(key);
    this.sessions.set(key, {
      key,
      agent: event.agent,
      sessionId: event.sessionId,
      project: event.project,
      phase: event.phase,
      tool: event.tool,
      startedAt: prev?.startedAt ?? event.ts,
      lastEventAt: now,
    });
    if (event.phase === "started") this.activityFlash = { state: "waving", until: now + this.waveMs };
    if (event.phase === "done") this.activityFlash = { state: "jumping", until: now + this.flashMs };
    if (event.phase === "failed") this.failedFlash = { state: "failed", until: now + this.flashMs };
  }

  sweep(): void {
    const cutoff = this.now() - this.ttlMs;
    for (const [key, session] of this.sessions) if (session.lastEventAt < cutoff) this.sessions.delete(key);
  }

  petState(): PetState {
    this.sweep();
    const sessions = [...this.sessions.values()];
    const now = this.now();
    if (sessions.some((s) => s.phase === "waiting")) return "waiting";
    if (this.failedFlash && now < this.failedFlash.until) return "failed";
    if (this.activityFlash && now < this.activityFlash.until) return this.activityFlash.state;
    if (sessions.some((s) => s.phase === "review")) return "review";
    if (sessions.some((s) => s.phase === "working")) return "running";
    return "idle";
  }

  snapshot(activePet: string | null, extra: Extra): Snapshot {
    this.sweep();
    const sessions = [...this.sessions.values()].sort((a, b) => (PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase]) || (b.lastEventAt - a.lastEventAt));
    return { type: "snapshot", now: this.now(), pet: this.petState(), sessions, activePet, ...extra };
  }
}

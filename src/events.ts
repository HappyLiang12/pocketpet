export const PHASES = ["started", "working", "waiting", "review", "done", "failed", "idle"] as const;
export type Phase = (typeof PHASES)[number];

export const AGENTS = ["claude", "codex", "opencode", "pi", "qoder"] as const;
export type AgentId = (typeof AGENTS)[number];

export interface NormalizedEvent {
  v: 1;
  agent: AgentId;
  sessionId: string;
  project: string;
  phase: Phase;
  tool?: string;
  detail?: string;
  ts: number;
}

const MAX_TEXT = 120;

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_TEXT ? trimmed : null;
}

export function parseEvent(value: unknown): NormalizedEvent | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.v !== 1) return null;
  const agent = AGENTS.includes(v.agent as AgentId) ? (v.agent as AgentId) : null;
  const sessionId = text(v.sessionId);
  const project = text(v.project);
  const phase = PHASES.includes(v.phase as Phase) ? (v.phase as Phase) : null;
  const ts = typeof v.ts === "number" && Number.isFinite(v.ts) ? v.ts : null;
  if (!agent || !sessionId || !project || !phase || ts === null) return null;
  const event: NormalizedEvent = { v: 1, agent, sessionId, project, phase, ts };
  const tool = text(v.tool);
  if (tool) event.tool = tool;
  const detail = text(v.detail);
  if (detail) event.detail = detail;
  return event;
}

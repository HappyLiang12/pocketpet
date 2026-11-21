export type LayoutMode = "stack" | "free";
export type ThemeMode = "system" | "light" | "dark";
export type MotionMode = "system" | "full" | "reduced";
export type SessionDensity = "comfortable" | "compact";
export type ClockFormat = "24h" | "12h";

export interface Appearance {
  v: 1;
  layout: { mode: LayoutMode; gap: number };
  stage: { padding: number };
  clock: { x: number; y: number; scale: number; format: ClockFormat };
  pet: { x: number; y: number; scale: number };
  theme: ThemeMode;
  motion: MotionMode;
  sessions: {
    density: SessionDensity;
    maxVisible: number;
    showProject: boolean;
    showTool: boolean;
    showElapsed: boolean;
  };
}

export type AppearanceOverrides = {
  layout?: { mode?: LayoutMode; gap?: number };
  stage?: { padding?: number };
  clock?: { x?: number; y?: number; scale?: number; format?: ClockFormat };
  pet?: { x?: number; y?: number; scale?: number };
  theme?: ThemeMode;
  motion?: MotionMode;
  sessions?: {
    density?: SessionDensity;
    maxVisible?: number;
    showProject?: boolean;
    showTool?: boolean;
    showElapsed?: boolean;
  };
};

export type LocalLook = {
  v: 1;
  followHost: boolean;
  overrides: AppearanceOverrides;
  petId: string | null;
};

export const DEFAULT_APPEARANCE: Appearance = {
  v: 1,
  layout: { mode: "stack", gap: 16 },
  stage: { padding: 20 },
  clock: { x: 50, y: 36, scale: 100, format: "24h" },
  pet: { x: 50, y: 62, scale: 100 },
  theme: "system",
  motion: "system",
  sessions: {
    density: "comfortable",
    maxVisible: 4,
    showProject: true,
    showTool: true,
    showElapsed: true,
  },
};

export const DEFAULT_LOCAL_LOOK: LocalLook = {
  v: 1,
  followHost: true,
  overrides: {},
  petId: null,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function readBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readOneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function normalizeAppearance(value: unknown): Appearance {
  const raw = isRecord(value) ? value : {};
  const layout = isRecord(raw.layout) ? raw.layout : {};
  const stage = isRecord(raw.stage) ? raw.stage : {};
  const clock = isRecord(raw.clock) ? raw.clock : {};
  const pet = isRecord(raw.pet) ? raw.pet : {};
  const sessions = isRecord(raw.sessions) ? raw.sessions : {};
  return {
    v: 1,
    layout: {
      mode: readOneOf(layout.mode, ["stack", "free"], "stack"),
      gap: clampInt(layout.gap, 16, 8, 48),
    },
    stage: { padding: clampInt(stage.padding, 20, 8, 32) },
    clock: {
      x: clampInt(clock.x, 50, 0, 100),
      y: clampInt(clock.y, 36, 0, 100),
      scale: clampInt(clock.scale, 100, 60, 160),
      format: readOneOf(clock.format, ["24h", "12h"], "24h"),
    },
    pet: {
      x: clampInt(pet.x, 50, 0, 100),
      y: clampInt(pet.y, 62, 0, 100),
      scale: clampInt(pet.scale, 100, 80, 200),
    },
    theme: readOneOf(raw.theme, ["system", "light", "dark"], "system"),
    motion: readOneOf(raw.motion, ["system", "full", "reduced"], "system"),
    sessions: {
      density: readOneOf(sessions.density, ["comfortable", "compact"], "comfortable"),
      maxVisible: clampInt(sessions.maxVisible, 4, 1, 6),
      showProject: readBool(sessions.showProject, true),
      showTool: readBool(sessions.showTool, true),
      showElapsed: readBool(sessions.showElapsed, true),
    },
  };
}

function normalizeOverrides(value: unknown): AppearanceOverrides {
  const raw = isRecord(value) ? value : {};
  const out: AppearanceOverrides = {};
  const layout = isRecord(raw.layout) ? raw.layout : {};
  const layoutOut: NonNullable<AppearanceOverrides["layout"]> = {};
  if (layout.mode === "stack" || layout.mode === "free") layoutOut.mode = layout.mode;
  if (typeof layout.gap === "number" && Number.isFinite(layout.gap)) layoutOut.gap = clampInt(layout.gap, 16, 8, 48);
  if (Object.keys(layoutOut).length > 0) out.layout = layoutOut;

  const stage = isRecord(raw.stage) ? raw.stage : {};
  if (typeof stage.padding === "number" && Number.isFinite(stage.padding)) out.stage = { padding: clampInt(stage.padding, 20, 8, 32) };

  const clock = isRecord(raw.clock) ? raw.clock : {};
  const clockOut: NonNullable<AppearanceOverrides["clock"]> = {};
  if (typeof clock.x === "number" && Number.isFinite(clock.x)) clockOut.x = clampInt(clock.x, 50, 0, 100);
  if (typeof clock.y === "number" && Number.isFinite(clock.y)) clockOut.y = clampInt(clock.y, 36, 0, 100);
  if (typeof clock.scale === "number" && Number.isFinite(clock.scale)) clockOut.scale = clampInt(clock.scale, 100, 60, 160);
  if (clock.format === "24h" || clock.format === "12h") clockOut.format = clock.format;
  if (Object.keys(clockOut).length > 0) out.clock = clockOut;

  const pet = isRecord(raw.pet) ? raw.pet : {};
  const petOut: NonNullable<AppearanceOverrides["pet"]> = {};
  if (typeof pet.x === "number" && Number.isFinite(pet.x)) petOut.x = clampInt(pet.x, 50, 0, 100);
  if (typeof pet.y === "number" && Number.isFinite(pet.y)) petOut.y = clampInt(pet.y, 62, 0, 100);
  if (typeof pet.scale === "number" && Number.isFinite(pet.scale)) petOut.scale = clampInt(pet.scale, 100, 80, 200);
  if (Object.keys(petOut).length > 0) out.pet = petOut;

  if (raw.theme === "system" || raw.theme === "light" || raw.theme === "dark") out.theme = raw.theme;
  if (raw.motion === "system" || raw.motion === "full" || raw.motion === "reduced") out.motion = raw.motion;

  const sessions = isRecord(raw.sessions) ? raw.sessions : {};
  const sessionsOut: NonNullable<AppearanceOverrides["sessions"]> = {};
  if (sessions.density === "comfortable" || sessions.density === "compact") sessionsOut.density = sessions.density;
  if (typeof sessions.maxVisible === "number" && Number.isFinite(sessions.maxVisible)) sessionsOut.maxVisible = clampInt(sessions.maxVisible, 4, 1, 6);
  if (typeof sessions.showProject === "boolean") sessionsOut.showProject = sessions.showProject;
  if (typeof sessions.showTool === "boolean") sessionsOut.showTool = sessions.showTool;
  if (typeof sessions.showElapsed === "boolean") sessionsOut.showElapsed = sessions.showElapsed;
  if (Object.keys(sessionsOut).length > 0) out.sessions = sessionsOut;

  return out;
}

export function normalizeLocalLook(value: unknown): LocalLook {
  const raw = isRecord(value) ? value : {};
  const followHost = raw.followHost !== false;
  const petId = typeof raw.petId === "string" && raw.petId.length > 0 ? raw.petId : null;
  return { v: 1, followHost, overrides: normalizeOverrides(raw.overrides), petId };
}

export function mergeAppearance(host: Appearance, overrides: AppearanceOverrides): Appearance {
  const h = normalizeAppearance(host);
  const o = normalizeOverrides(overrides);
  return {
    v: 1,
    layout: {
      mode: o.layout?.mode ?? h.layout.mode,
      gap: o.layout?.gap ?? h.layout.gap,
    },
    stage: { padding: o.stage?.padding ?? h.stage.padding },
    clock: {
      x: o.clock?.x ?? h.clock.x,
      y: o.clock?.y ?? h.clock.y,
      scale: o.clock?.scale ?? h.clock.scale,
      format: o.clock?.format ?? h.clock.format,
    },
    pet: {
      x: o.pet?.x ?? h.pet.x,
      y: o.pet?.y ?? h.pet.y,
      scale: o.pet?.scale ?? h.pet.scale,
    },
    theme: o.theme ?? h.theme,
    motion: o.motion ?? h.motion,
    sessions: {
      density: o.sessions?.density ?? h.sessions.density,
      maxVisible: o.sessions?.maxVisible ?? h.sessions.maxVisible,
      showProject: o.sessions?.showProject ?? h.sessions.showProject,
      showTool: o.sessions?.showTool ?? h.sessions.showTool,
      showElapsed: o.sessions?.showElapsed ?? h.sessions.showElapsed,
    },
  };
}

export function resolveLook(host: Appearance, local: LocalLook): { appearance: Appearance; followHost: boolean } {
  const h = normalizeAppearance(host);
  const l = normalizeLocalLook(local);
  return { appearance: l.followHost ? h : mergeAppearance(h, l.overrides), followHost: l.followHost };
}

export function diffAppearance(host: Appearance, draft: Appearance): AppearanceOverrides {
  const h = normalizeAppearance(host);
  const d = normalizeAppearance(draft);
  const out: AppearanceOverrides = {};
  const layout: NonNullable<AppearanceOverrides["layout"]> = {};
  if (d.layout.mode !== h.layout.mode) layout.mode = d.layout.mode;
  if (d.layout.gap !== h.layout.gap) layout.gap = d.layout.gap;
  if (Object.keys(layout).length > 0) out.layout = layout;
  if (d.stage.padding !== h.stage.padding) out.stage = { padding: d.stage.padding };
  const clock: NonNullable<AppearanceOverrides["clock"]> = {};
  if (d.clock.x !== h.clock.x) clock.x = d.clock.x;
  if (d.clock.y !== h.clock.y) clock.y = d.clock.y;
  if (d.clock.scale !== h.clock.scale) clock.scale = d.clock.scale;
  if (d.clock.format !== h.clock.format) clock.format = d.clock.format;
  if (Object.keys(clock).length > 0) out.clock = clock;
  const pet: NonNullable<AppearanceOverrides["pet"]> = {};
  if (d.pet.x !== h.pet.x) pet.x = d.pet.x;
  if (d.pet.y !== h.pet.y) pet.y = d.pet.y;
  if (d.pet.scale !== h.pet.scale) pet.scale = d.pet.scale;
  if (Object.keys(pet).length > 0) out.pet = pet;
  if (d.theme !== h.theme) out.theme = d.theme;
  if (d.motion !== h.motion) out.motion = d.motion;
  const sessions: NonNullable<AppearanceOverrides["sessions"]> = {};
  if (d.sessions.density !== h.sessions.density) sessions.density = d.sessions.density;
  if (d.sessions.maxVisible !== h.sessions.maxVisible) sessions.maxVisible = d.sessions.maxVisible;
  if (d.sessions.showProject !== h.sessions.showProject) sessions.showProject = d.sessions.showProject;
  if (d.sessions.showTool !== h.sessions.showTool) sessions.showTool = d.sessions.showTool;
  if (d.sessions.showElapsed !== h.sessions.showElapsed) sessions.showElapsed = d.sessions.showElapsed;
  if (Object.keys(sessions).length > 0) out.sessions = sessions;
  return out;
}

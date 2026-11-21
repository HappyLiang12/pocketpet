# PocketPet UIUX Foundation and Look Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the M1 setup page and phone drawer with the Studio Neutral Desk Dashboard and bottom-sheet display, and add a host-default plus per-phone appearance model with a shared Direct Canvas Studio. This slice deliberately excludes agent setup and update UI.

**Architecture:** A pure appearance schema module is shared by the bridge and the web bundles. The bridge gains loopback setup look APIs, setup-only pet preview assets, host/version snapshot fields, and a setup shell with a Vite-built setup entry. A shared stage renderer and Studio editor serve both the setup preview and the phone. The phone resolves host appearance plus sparse local overrides; the setup page writes host defaults only. Existing event, auth, Petdex, and WebSocket contracts are unchanged.

**Tech Stack:** Node >= 20.6, TypeScript NodeNext, Vite 6, Vitest 2, Playwright 1.49, vanilla TypeScript/Canvas, no new dependencies.

**Spec:** [2026-11-21-pocketpet-uiux-direction-design.md](../specs/2026-11-21-pocketpet-uiux-direction-design.md)

## Global Constraints

- Node >= 20.6; TypeScript strict; no new runtime dependency. The setup app reuses Vite; the Studio reuses the existing canvas renderer.
- Studio Neutral tokens and component rules come from the spec. No gradients, glass, glow, decorative shadows, emoji, or external fonts. Icons are inline SVG.
- UI copy is OS-neutral: "This computer", "Computer", "Host". Show the actual OS as a label. Never use "Mac" as a synonym for the host. The old Mac-only setup 403 copy is replaced.
- Appearance schema is version 1 with the exact defaults and ranges in the spec. Host defaults are full and validated. Phone overrides are sparse, local, and optional. There are no per-posture profiles.
- The setup page writes host appearance and host pet. The phone writes only its local override object. The phone remains display-only and must not configure agents or updates in this slice.
- The setup page and all setup APIs are loopback-only and Host-allowlisted. Mutations additionally require `X-PocketPet-Setup: 1`, JSON content type, and a same-origin `Origin`. No CORS. Setup APIs never return the token, full settings JSON, prompts, or outputs.
- The setup page keeps the QR and tokenized URLs server-rendered. It must not set a phone auth cookie or use the phone `/api/pets` routes. Setup pet previews use loopback-only `/assets/setup/pets/...` routes with the same validation and traversal checks as the phone asset routes.
- The setup shell has no inline script. It injects hashed Vite entry assets from the build manifest. The CSP is `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`.
- No agent UI, update UI, or update mechanism in this plan. No adapter install. The existing Qoder adapter remains local and unshipped; no push.
- Tests use a temporary home and temporary settings. They must not touch the real `~/.claude`, `~/.qoder`, `~/.pocketpet`, or launchd. No service or hook install. No push.
- Every new string ships in English, Traditional Chinese, and Simplified Chinese. No empty values. The existing M1 tests that pin the drawer, Mac-only setup copy, or phone global pet write are updated with positive and negative controls; they are not skipped or weakened.
- Baseline at plan time: local `main` is `93ac7a4`, with 269 unit tests and 11 E2E tests from M1/Qoder. Re-run the baseline before Task 1 and record the actual counts. Do not hardcode a target count.
- Use a feature worktree created through `superpowers:using-git-worktrees` before Task 1. Commit after every task. Do not push. Do not implement agent/update tasks from the spec during this plan.

## File Map

| Path | Responsibility |
|---|---|
| `src/appearance.ts` | Appearance schema, defaults, normalization, sparse overrides, resolution, diff |
| `src/config.ts` | Persist `appearance` with old-config defaults |
| `src/host.ts` | Actual OS label, OS version, bridge version |
| `src/setupPage.ts` | Setup shell, no-JS fallback, denied page, Vite manifest asset lookup |
| `src/i18n.ts` | Setup shell copy and OS-neutral fixes |
| `src/server.ts` | Setup look API, setup pet assets, CSRF gate, snapshot appearance/host, setup page |
| `src/onboarding.ts` | Pairing URLs and prompts; setup HTML moves out |
| `web/vite.config.ts` | Setup entry and manifest |
| `web/src/tokens.css` | Shared Studio Neutral tokens and base components |
| `web/src/look/stage.ts` | Shared stage binding, clock formatting, theme, appearance application |
| `web/src/look/stage.css` | Shared stage layout, stack/free positions, reduced motion |
| `web/src/look/store.ts` | Phone localStorage look override read/write |
| `web/src/look/studio.ts` | Shared Direct Canvas Studio |
| `web/src/look/studio.css` | Studio layout and controls |
| `web/src/setup/main.ts` | Setup Look card and setup Studio wiring |
| `web/src/setup/setup.css` | Setup dashboard layout |
| `web/index.html` | Phone bottom-sheet shell and stage |
| `web/src/main.ts` | Phone state, sheet, appearance resolution, local pet, Studio wiring |
| `web/src/style.css` | Phone tokens, sheet, stage, session styles |
| `web/src/i18n.ts` | Phone, setup app, and Studio strings in three languages |
| `web/src/sprite.ts` | Reduced-motion frame control |
| `web/src/catalog.ts` | Existing pet search/cap; reused by setup and phone |
| `tsconfig.web.json` | Web typecheck |
| `package.json` | Add web typecheck to the existing script |
| `tests/appearance.test.ts` | Schema and resolution tests |
| `tests/stage.test.ts` | Clock formatting, theme and motion resolution |
| `tests/lookStore.test.ts` | Local look storage and denial |
| `tests/host.test.ts` | Host/version tests |
| `tests/config.test.ts` | Appearance persistence tests |
| `tests/setupPage.test.ts` | Setup shell and no-JS copy tests |
| `tests/server.test.ts` | Setup APIs, CSRF, setup assets, snapshot fields |
| `tests/serverI18n.test.ts`, `tests/onboarding.test.ts` | Updated setup copy and imports |
| `tests/webI18n.test.ts` | New key parity |
| `e2e/setup.spec.ts` | Setup dashboard, no-JS, Studio save |
| `e2e/phone.spec.ts` | Updated phone sheet, local overrides, Studio |
| `e2e/prepare.mjs` | Fixture appearance and setup assets assumptions |
| `README.md`, `README.zh-Hans.md` | Updated user-facing setup/drawer/pet wording |
| `docs/acceptance/uiux-foundation-look.md` | Manual gates and evidence slots |
| `playwright.config.ts` | Serialize or isolate E2E tests that mutate shared host state |

## Preflight

- [ ] Run `git status --short --branch`; confirm the worktree is isolated and clean.
- [ ] Run `npm test`; record the exact pass/fail counts in the task report. Expected baseline: the current suite is green; if a test is already red, stop and report it before changing code.
- [ ] Run `npm run typecheck` and `npm run build`; record the actual results.
- [ ] Run `npm run test:e2e`; record the actual counts. The E2E server uses `.tmp-e2e`; it must not touch the real home.
- [ ] Run `find . -maxdepth 2 -name 'manifest.json'` after the first build to confirm the Vite manifest location used by the server. Do not assume it exists before the build change.
- [ ] Do not install hooks, services, packages, or update any real agent config. If dependencies are missing, stop and ask for approval.

---

### Task 1: Appearance model, config persistence, and web typecheck

**Files:**
- Create: `src/appearance.ts`
- Create: `tsconfig.web.json`
- Modify: `src/config.ts`
- Modify: `package.json` (typecheck script only)
- Test: `tests/appearance.test.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- Produces: `Appearance`, `LayoutMode`, `ThemeMode`, `MotionMode`, `SessionDensity`, `ClockFormat`, `DEFAULT_APPEARANCE`.
- Produces: `normalizeAppearance(value: unknown): Appearance`; clamps to the spec ranges and fills defaults.
- Produces: `AppearanceOverrides`, `LocalLook`, `DEFAULT_LOCAL_LOOK`, `normalizeLocalLook(value: unknown): LocalLook`.
- Produces: `mergeAppearance(host: Appearance, overrides: AppearanceOverrides): Appearance`.
- Produces: `resolveLook(host: Appearance, local: LocalLook): { appearance: Appearance; followHost: boolean }`.
- Produces: `diffAppearance(host: Appearance, draft: Appearance): AppearanceOverrides`.
- Modifies: `Config` gains `appearance: Appearance`; `ensureConfig` and `loadConfig` provide the default for old configs.
- Produces: `npm run typecheck` checks both bridge and web TypeScript.

- [ ] **Step 1: Write the failing appearance tests**

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_APPEARANCE,
  DEFAULT_LOCAL_LOOK,
  diffAppearance,
  mergeAppearance,
  normalizeAppearance,
  normalizeLocalLook,
  resolveLook,
} from "../src/appearance.js";

describe("normalizeAppearance", () => {
  it("returns the v1 defaults for null and malformed input", () => {
    expect(normalizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance({ layout: { mode: "wat", gap: "nope" }, clock: { x: -4 } })).toMatchObject({
      v: 1,
      layout: { mode: "stack", gap: 16 },
      clock: { x: 0, y: 36, scale: 100, format: "24h" },
    });
  });

  it("clamps every numeric range and rounds integers", () => {
    const value = normalizeAppearance({
      layout: { mode: "free", gap: 999 },
      stage: { padding: 0 },
      clock: { x: 101, y: -1, scale: 10, format: "12h" },
      pet: { x: 0, y: 100, scale: 999 },
      theme: "dark",
      motion: "reduced",
      sessions: { density: "compact", maxVisible: 99, showProject: false, showTool: false, showElapsed: false },
    });
    expect(value).toMatchObject({
      layout: { mode: "free", gap: 48 },
      stage: { padding: 8 },
      clock: { x: 100, y: 0, scale: 60, format: "12h" },
      pet: { x: 0, y: 100, scale: 200 },
      theme: "dark",
      motion: "reduced",
      sessions: { density: "compact", maxVisible: 6, showProject: false, showTool: false, showElapsed: false },
    });
  });

  it("does not mutate its input", () => {
    const input = structuredClone(DEFAULT_APPEARANCE);
    const output = normalizeAppearance(input);
    output.layout.gap = 48;
    expect(input.layout.gap).toBe(16);
  });
});

describe("local look resolution", () => {
  const host = normalizeAppearance({
    ...DEFAULT_APPEARANCE,
    layout: { mode: "stack", gap: 24 },
    clock: { ...DEFAULT_APPEARANCE.clock, scale: 120 },
  });

  it("follows host values by default", () => {
    const local = normalizeLocalLook({ followHost: true, overrides: { pet: { scale: 200 } } });
    expect(resolveLook(host, local)).toEqual({ appearance: host, followHost: true });
  });

  it("applies only valid sparse overrides", () => {
    const local = normalizeLocalLook({
      followHost: false,
      overrides: { clock: { scale: 80, x: 20 }, theme: "light", sessions: { maxVisible: 2 } },
      petId: "local:boba",
    });
    const resolved = resolveLook(host, local);
    expect(resolved.followHost).toBe(false);
    expect(resolved.appearance.clock).toMatchObject({ scale: 80, x: 20, y: host.clock.y });
    expect(resolved.appearance.layout.gap).toBe(24);
    expect(resolved.appearance.theme).toBe("light");
    expect(resolved.appearance.sessions.maxVisible).toBe(2);
    expect(resolved.appearance.sessions.density).toBe(host.sessions.density);
    expect(local.petId).toBe("local:boba");
  });

  it("ignores malformed override fields", () => {
    const local = normalizeLocalLook({ followHost: false, overrides: { pet: { scale: "huge" }, theme: "neon" } });
    expect(local.overrides).toEqual({});
    expect(resolveLook(host, local).appearance).toEqual(host);
  });

  it("defaults to followHost true for malformed local state", () => {
    expect(normalizeLocalLook({ followHost: "no", overrides: null, petId: 4 })).toEqual(DEFAULT_LOCAL_LOOK);
  });

  it("produces a sparse diff for only changed values", () => {
    const draft = {
      ...host,
      clock: { ...host.clock, scale: 90 },
      sessions: { ...host.sessions, showTool: false },
    };
    expect(diffAppearance(host, draft)).toEqual({
      clock: { scale: 90 },
      sessions: { showTool: false },
    });
  });

  it("returns an empty diff for equal values", () => {
    expect(diffAppearance(host, normalizeAppearance(host))).toEqual({});
  });

  it("merges a diff back to the draft", () => {
    const draft = {
      ...host,
      layout: { ...host.layout, mode: "free" as const, gap: 32 },
      pet: { ...host.pet, x: 12, y: 88, scale: 140 },
    };
    expect(mergeAppearance(host, diffAppearance(host, draft))).toEqual(draft);
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx vitest run tests/appearance.test.ts`
Expected: FAIL because `src/appearance.ts` does not exist.

- [ ] **Step 3: Implement `src/appearance.ts`**

```ts
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
```

- [ ] **Step 4: Run the focused appearance test**

Run: `npx vitest run tests/appearance.test.ts`
Expected: PASS all appearance tests.

- [ ] **Step 5: Add appearance persistence to config**

Modify `src/config.ts` with this shape; keep the existing token, port, dirs, and atomic write behavior:

```ts
import { DEFAULT_APPEARANCE, normalizeAppearance, type Appearance } from "./appearance.js";

export type Config = {
  token: string;
  port: number;
  activePet: string | null;
  sleepAfterMinutes: number;
  quietHours: QuietHours | null;
  appearance: Appearance;
};

// In ensureConfig's new-config object:
appearance: normalizeAppearance(DEFAULT_APPEARANCE),

// In loadConfig's returned object:
appearance: normalizeAppearance(parsed.appearance),
```

- [ ] **Step 6: Extend the config tests**

Add to `tests/config.test.ts`:

```ts
import { DEFAULT_APPEARANCE, normalizeAppearance } from "../src/appearance.js";

it("defaults appearance for old configs", () => {
  home = mkdtempSync(join(tmpdir(), "pocketpet-"));
  writeFileSync(configPath(home), JSON.stringify({
    token: "legacy-token-0123456789",
    port: 7788,
    activePet: null,
    sleepAfterMinutes: 10,
    quietHours: null,
  }));
  expect(loadConfig(home).appearance).toEqual(DEFAULT_APPEARANCE);
});

it("round-trips a normalized appearance", () => {
  home = mkdtempSync(join(tmpdir(), "pocketpet-"));
  const config = ensureConfig(home);
  const appearance = normalizeAppearance({ ...DEFAULT_APPEARANCE, theme: "light", clock: { scale: 140 } });
  saveConfig(home, { ...config, appearance });
  expect(loadConfig(home).appearance).toEqual(appearance);
});
```

Also update the creation assertion to `expect(config.appearance).toEqual(DEFAULT_APPEARANCE)`.

- [ ] **Step 7: Add web typecheck**

Create `tsconfig.web.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["web/src/**/*.ts", "src/appearance.ts"]
}
```

Update `package.json`:

```json
"typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.web.json"
```

Run `npm run typecheck`. Expected: PASS. If it reports pre-existing web type errors, fix them in the touched web files without changing runtime behavior and record each fix in the report.

- [ ] **Step 8: Run the focused and full checks**

Run: `npx vitest run tests/appearance.test.ts tests/config.test.ts`
Expected: PASS.

Run: `npm test`
Expected: PASS; record the new count.

- [ ] **Step 9: Commit**

```bash
git add src/appearance.ts src/config.ts tsconfig.web.json package.json tests/appearance.test.ts tests/config.test.ts
git commit -m "feat: add appearance model and config"
```

---

### Task 2: Host info, setup look API, setup pet previews, and snapshot fields

**Files:**
- Create: `src/host.ts`
- Modify: `src/server.ts`
- Test: `tests/host.test.ts`
- Test: `tests/server.test.ts`

**Interfaces:**
- Produces: `HostInfo = { os: string; osVersion: string; bridgeVersion: string }`.
- Produces: `hostInfo(): HostInfo`; `bridgeVersion(): string`.
- Produces: `BridgeOptions.probeService?: () => Promise<boolean>` for the setup System card.
- Produces: `GET /api/setup/look` → `{ appearance, activePet, pets: PetSummary[] }`; loopback + Host; no token; setup sprite URLs.
- Produces: `PUT /api/setup/look` → `{ appearance, activePet }`; loopback + Host + CSRF; saves `config.appearance` and `config.activePet`, broadcasts the snapshot.
- Produces: `GET /assets/setup/pets/...`; loopback + Host; same validation as phone pet assets; no token.
- Modifies: `Snapshot` responses on `/api/state` and `/ws` include `appearance` and `host`.
- Produces: `isSetupRequestAllowed(req, port)` and `isSetupMutationAllowed(req, port)` helpers.

- [ ] **Step 1: Write the failing host tests**

```ts
import { describe, expect, it } from "vitest";
import { bridgeVersion, hostInfo } from "../src/host.js";

describe("host info", () => {
  it("reports a non-empty bridge version", () => {
    expect(bridgeVersion()).toMatch(/^\d+\.\d+\.\d+|^dev$/);
  });

  it("reports a known OS label and version", () => {
    const value = hostInfo();
    expect(["macOS", "Windows", "Linux"]).toContain(value.os);
    expect(value.osVersion.length).toBeGreaterThan(0);
    expect(value.bridgeVersion).toBe(bridgeVersion());
  });
});
```

- [ ] **Step 2: Run the host test to verify it fails**

Run: `npx vitest run tests/host.test.ts`
Expected: FAIL because `src/host.ts` does not exist.

- [ ] **Step 3: Implement `src/host.ts`**

```ts
import { readFileSync } from "node:fs";
import { platform, release } from "node:os";

export type HostInfo = {
  os: "macOS" | "Windows" | "Linux" | string;
  osVersion: string;
  bridgeVersion: string;
};

let cachedVersion: string | null = null;

export function bridgeVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    const raw = readFileSync(new URL("../package.json", import.meta.url), "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    cachedVersion = typeof parsed.version === "string" && parsed.version.trim() ? parsed.version.trim() : "dev";
  } catch {
    cachedVersion = "dev";
  }
  return cachedVersion;
}

export function hostInfo(): HostInfo {
  const os = platform() === "darwin" ? "macOS" : platform() === "win32" ? "Windows" : platform() === "linux" ? "Linux" : platform();
  return { os, osVersion: release(), bridgeVersion: bridgeVersion() };
}
```

- [ ] **Step 4: Add the server setup helpers and snapshot fields**

In `src/server.ts`:

```ts
import { hostInfo, type HostInfo } from "./host.js";
import type { Appearance } from "./appearance.js";
import { serviceStatus } from "./service.js";

type BridgeSnapshot = Snapshot & { appearance: Appearance; host: HostInfo };

// BridgeOptions:
probeService?: () => Promise<boolean>;

// inside startBridge:
const snapshot = (): BridgeSnapshot => ({
  ...aggregator.snapshot(config.activePet, {
    sleepAfterMinutes: config.sleepAfterMinutes,
    quietHours: config.quietHours,
  }),
  appearance: config.appearance,
  host: hostInfo(),
});

function isSetupRequestAllowed(req: IncomingMessage, port: number): boolean {
  return isLoopback(req.socket.remoteAddress) && isLoopbackHost(req.headers.host, port);
}

function isSetupMutationAllowed(req: IncomingMessage, port: number): boolean {
  if (!isSetupRequestAllowed(req, port)) return false;
  if (req.headers["x-pocketpet-setup"] !== "1") return false;
  if (!String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) return false;
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    const o = new URL(origin);
    const h = new URL(`http://${req.headers.host}`);
    return o.protocol === "http:" && o.hostname === h.hostname && o.port === h.port;
  } catch {
    return false;
  }
}

async function setupSummaries() {
  return (await petSummaries()).map((pet) => ({
    ...pet,
    spriteUrl: pet.spriteUrl.replace(/^\/assets\/pets\//, "/assets/setup/pets/"),
  }));
}
```

Add the setup routes before the auth gate, after the existing `/setup` route. They use the actual listening `port`.

```ts
if (req.method === "GET" && path === "/api/setup/look") {
  if (!isSetupRequestAllowed(req, port)) return text(res, 403, "loopback setup only");
  return json(res, 200, { appearance: config.appearance, activePet: config.activePet, pets: await setupSummaries() });
}

if (req.method === "PUT" && path === "/api/setup/look") {
  if (!isSetupMutationAllowed(req, port)) return text(res, 403, "setup mutation requires same-origin JSON");
  let value: unknown;
  try {
    value = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: { code: "invalid_json", message: "invalid JSON" } });
  }
  const body = (value ?? {}) as { appearance?: unknown; activePet?: unknown };
  const next = normalizeAppearance(body.appearance ?? config.appearance);
  const pets = await petSummaries();
  const petId = body.activePet === undefined ? config.activePet : body.activePet;
  if (petId !== null && (typeof petId !== "string" || !pets.some((pet) => pet.id === petId))) {
    return json(res, 400, { error: { code: "unknown_pet", message: "unknown pet" } });
  }
  config.appearance = next;
  config.activePet = petId;
  saveConfig(home, config);
  broadcast();
  return json(res, 200, { appearance: config.appearance, activePet: config.activePet });
}
```

Add the setup-only pet preview routes before the auth gate:

```ts
if (req.method === "GET" && path.startsWith("/assets/setup/pets/")) {
  if (!isSetupRequestAllowed(req, port)) return text(res, 403, "loopback setup only");
  const subpath = path.slice("/assets/setup/pets".length); // starts with /local/ or /petdex/
  if (subpath.startsWith("/local/")) return serveLocalPetAsset(subpath, res);
  if (subpath.startsWith("/petdex/")) return await servePetdexPetAsset(subpath, res);
  return text(res, 404, "not found");
}
```

Extract the current local and Petdex asset bodies into helpers so both phone and setup routes call the same validation. The helpers take the path beginning with `/local/...` or `/petdex/...`, not the prefix.

The `serveLocalPetAsset` helper preserves the existing `SLUG` checks, the local pet lookup, and the `pet.json`/sprite-only rule. The `servePetdexPetAsset` helper preserves the `petdexUrlAllowed` allowlist, the cached file behavior, and the no-redirect fetch.

- [ ] **Step 5: Add server tests**

In `tests/server.test.ts`, add a setup fixture:

```ts
async function setupJson(path: string, init: RequestInit = {}) {
  return fetch(`${base()}${path}`, {
    ...init,
    headers: {
      origin: base(),
      "x-pocketpet-setup": "1",
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

it("includes appearance and host in state and WebSocket snapshots", async () => {
  const state = await (await fetch(`${base()}/api/state`, authed())).json();
  expect(state.appearance).toEqual(bridge.config.appearance);
  expect(state.host.os).toMatch(/^(macOS|Windows|Linux)$/);
  expect(state.host.bridgeVersion).toBeTruthy();
  const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}/ws?token=${encodeURIComponent(bridge.config.token)}`);
  const first = await new Promise<Record<string, unknown>>((resolve, reject) => {
    ws.once("message", (data) => resolve(JSON.parse(String(data))));
    ws.once("error", reject);
  });
  expect(first.appearance).toEqual(bridge.config.appearance);
  expect(first.host).toMatchObject({ os: state.host.os, bridgeVersion: state.host.bridgeVersion });
  ws.close();
});

it("serves setup look without a token and saves host appearance with CSRF", async () => {
  const look = await (await fetch(`${base()}/api/setup/look`)).json();
  expect(look.appearance).toEqual(bridge.config.appearance);
  expect(look.activePet).toBeNull();
  expect(Array.isArray(look.pets)).toBe(true);

  const denied = await fetch(`${base()}/api/setup/look`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ appearance: { theme: "light" } }),
  });
  expect(denied.status).toBe(403);

  const saved = await setupJson("/api/setup/look", {
    method: "PUT",
    body: JSON.stringify({ appearance: { ...bridge.config.appearance, theme: "light", clock: { scale: 140 } } }),
  });
  expect(saved.status).toBe(200);
  expect((await saved.json()).appearance).toMatchObject({ theme: "light", clock: { scale: 140 } });
  expect(bridge.config.appearance).toMatchObject({ theme: "light", clock: { scale: 140 } });
  const state = await (await fetch(`${base()}/api/state`, authed())).json();
  expect(state.appearance).toMatchObject({ theme: "light", clock: { scale: 140 } });
});

it("rejects unknown host pets from setup", async () => {
  const res = await setupJson("/api/setup/look", {
    method: "PUT",
    body: JSON.stringify({ activePet: "local:nope" }),
  });
  expect(res.status).toBe(400);
});

it("serves setup-only pet sprites without the phone cookie", async () => {
  const petDir = join(home, "pets", "demo");
  mkdirSync(petDir, { recursive: true });
  writeFileSync(join(petDir, "pet.json"), JSON.stringify({ displayName: "Demo" }));
  writeFileSync(join(petDir, "spritesheet.webp"), "RIFF-demo");

  const look = await (await fetch(`${base()}/api/setup/look`)).json();
  expect(look.pets).toContainEqual(expect.objectContaining({
    id: "local:demo",
    spriteUrl: "/assets/setup/pets/local/demo/spritesheet.webp",
  }));
  const sprite = await fetch(`${base()}/assets/setup/pets/local/demo/spritesheet.webp`);
  expect(sprite.status).toBe(200);
  expect(await sprite.text()).toBe("RIFF-demo");
  expect((await fetch(`${base()}/assets/setup/pets/local/..%2F..%2Fpackage.json`)).status).toBe(404);
});

it("refuses setup mutations from a foreign Origin", async () => {
  const res = await fetch(`${base()}/api/setup/look`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-pocketpet-setup": "1",
      origin: "http://evil.example",
    },
    body: JSON.stringify({ appearance: { theme: "light" } }),
  });
  expect(res.status).toBe(403);
});
```

Add a raw Host test for the setup look API using the existing `rawGet` helper:

```ts
const res = await rawGet("/api/setup/look", { host: "evil.example" });
expect(res.status).toBe(403);
```

- [ ] **Step 6: Run the focused and full tests**

Run: `npx vitest run tests/host.test.ts tests/server.test.ts`
Expected: PASS.

Run: `npm test`
Expected: PASS; record the count.

- [ ] **Step 7: Commit**

```bash
git add src/host.ts src/server.ts tests/host.test.ts tests/server.test.ts
git commit -m "feat: add host and setup look APIs"
```

---

### Task 3: Setup shell, Vite setup entry, tokens, and read-only Look card

**Files:**
- Create: `src/setupPage.ts`
- Create: `web/src/tokens.css`
- Create: `web/src/setup/main.ts`
- Create: `web/src/setup/setup.css`
- Modify: `src/onboarding.ts` (remove moved setup HTML; keep pairing/prompt helpers)
- Modify: `src/server.ts` (serve setup page/assets, CSP, setup route)
- Modify: `src/i18n.ts` (setup shell copy; OS-neutral fixes)
- Modify: `web/vite.config.ts` (setup entry + manifest)
- Modify: `tests/onboarding.test.ts`, `tests/serverI18n.test.ts`, `tests/server.test.ts`
- Create: `tests/setupPage.test.ts`
- Create: `e2e/setup.spec.ts` (shell and no-JS; full editing arrives in Task 5)

**Interfaces:**
- Produces: `SetupAssets = { js: string; css: string[] }`; `setupAssets(webDist: string): SetupAssets`.
- Produces: `SetupPageInput` with pairing data, `assets`, `host`, `serviceRunning`, `logPath`, `appearance`, and `lang`.
- Produces: `setupPageHtml(input): string`; server-rendered Pair/Look/System cards, language links, QR, no-JS fallback, hashed asset tags.
- Produces: `setupDeniedHtml(port, lang)` with computer-only copy.
- Produces: `GET /setup` CSP with `script-src 'self'`, setup CSS/JS, no inline script.
- Produces: setup app `#look-app` read-only render from `GET /api/setup/look`; no editing or Studio yet.
- Produces: `web/src/tokens.css` with the spec's Studio Neutral tokens.

- [ ] **Step 1: Write failing setup shell tests**

Create `tests/setupPage.test.ts` with these cases:

```ts
import { describe, expect, it } from "vitest";
import { setupAssets, setupDeniedHtml, setupPageHtml } from "../src/setupPage.js";
import { DEFAULT_APPEARANCE } from "../src/appearance.js";

const base = {
  qrSvg: '<svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>',
  ipUrls: ["http://192.168.1.5:7788/?token=tok"],
  localUrl: "http://happy-local:7788/?token=tok",
  port: 7788,
  hostname: "happy-local.local",
  assets: { js: "/assets/web/assets/setup-abc.js", css: ["/assets/web/assets/setup-abc.css"] },
  host: { os: "Windows", osVersion: "10.0.22631", bridgeVersion: "0.1.0" },
  serviceRunning: null,
  logPath: "~/.pocketpet/logs/bridge.log",
  appearance: DEFAULT_APPEARANCE,
};

it("renders the OS-neutral dashboard with Pair, Look and System", () => {
  const html = setupPageHtml(base);
  expect(html).toContain("PocketPet Setup");
  expect(html).toContain("This computer");
  expect(html).toContain("Windows");
  expect(html).toContain("Pair");
  expect(html).toContain("Look");
  expect(html).toContain("System");
  expect(html).toContain("Open phone view");
  expect(html).toContain("Open Studio");
  expect(html).not.toContain("Mac-only");
  expect(html).not.toContain("Mac only");
  expect(html).not.toMatch(/\bMac\b/);
});

it("injects only same-origin hashed setup assets and no inline script", () => {
  const html = setupPageHtml(base);
  expect(html).toContain('<script type="module" src="/assets/web/assets/setup-abc.js"></script>');
  expect(html).toContain('<link rel="stylesheet" href="/assets/web/assets/setup-abc.css">');
  expect(html).not.toMatch(/<script(?![^>]*src=)[^>]*>/);
  expect(html).not.toContain("http://evil");
});

it("renders the no-JS fallback with QR, URLs, look values and system info", () => {
  const html = setupPageHtml(base);
  expect(html).toContain("<svg");
  expect(html).toContain("?token=tok");
  expect(html).toContain("loopback");
  expect(html).toContain("Clock");
  expect(html).toContain("Pet");
  expect(html).toContain("Bridge version");
});

it("uses computer-only denied copy in all languages", () => {
  for (const lang of ["en", "zh-Hant", "zh-Hans"] as const) {
    const html = setupDeniedHtml(7788, lang);
    expect(html).toContain(`<html lang="${lang}">`);
    expect(html).not.toContain("?token=");
    expect(html).not.toContain("Mac-only");
  }
  expect(setupDeniedHtml(7788, "en")).toContain("computer");
  expect(setupDeniedHtml(7788, "zh-Hant")).toContain("電腦");
  expect(setupDeniedHtml(7788, "zh-Hans")).toContain("电脑");
});

it("reads the setup entry from a Vite manifest and falls back safely", () => {
  const dir = mkdtempSync(join(tmpdir(), "pocketpet-manifest-"));
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({
    "src/setup/main.ts": { isEntry: true, file: "assets/setup-abc.js", css: ["assets/setup-abc.css"] },
  }));
  expect(setupAssets(dir)).toEqual({
    js: "/assets/web/assets/setup-abc.js",
    css: ["/assets/web/assets/setup-abc.css"],
  });
  rmSync(dir, { recursive: true, force: true });
  expect(setupAssets(dir)).toEqual({ js: "", css: [] });
});
```

Add imports for `mkdtempSync`, `writeFileSync`, `rmSync`, `tmpdir`, `join` at the top of the test file.

- [ ] **Step 2: Run the setup shell tests to verify they fail**

Run: `npx vitest run tests/setupPage.test.ts`
Expected: FAIL because `src/setupPage.ts` does not exist.

- [ ] **Step 3: Implement the setup page module**

Move `escapeHtml`, `tokenFromUrl`, `qrHostKind`, and `fontStack` out of `src/onboarding.ts` into `src/setupPage.ts`; keep `localHostname`, `pairingLinks`, and `askYesNo` in `onboarding.ts`. Export `setupPageHtml`, `setupAssets`, and `setupDeniedHtml`.

The Pair card renders an Open phone view anchor to the first tokenized LAN URL, or the USB URL when no LAN URL exists. The Pair and System cards render copy buttons that copy the already-displayed URL/command/diagnostic text; the setup app wires them in Task 5. The System diagnostics text contains port, host OS, bridge version, and log path only; never the token. The no-JS fallback leaves the URLs and commands selectable.

The shell has this structure; use the existing setup copy for the Pair card and the new OS-neutral copy for the header, Look fallback, and System card:

```html
<header class="setup-header">
  <div class="wordmark">PocketPet</div>
  <div class="host-badge" data-host-os>This computer · {host.os}</div>
  <div class="version">v{bridgeVersion}</div>
  <nav class="language-links" aria-label="{languageHeading}">…?lang=en|zh-Hant|zh-Hans…</nav>
</header>
<nav class="setup-tabs" aria-label="Sections">
  <a href="#pair">Pair</a><a href="#look">Look</a><a href="#system">System</a>
</nav>
<main class="setup-main">
  <section id="pair" class="setup-card">…existing QR, steps, LAN, .local, USB, reusable note…</section>
  <section id="look" class="setup-card">
    <h2>Look</h2>
    <div id="look-app">
      <div class="look-fallback">
        <p>{lookEnableJavaScript}</p>
        <dl>
          <dt>Clock</dt><dd>{clock scale}%</dd>
          <dt>Pet</dt><dd>{pet scale}%</dd>
          <dt>Layout</dt><dd>{layout mode} · gap {gap}</dd>
        </dl>
        <button type="button" disabled>Open Studio</button>
      </div>
    </div>
  </section>
  <section id="system" class="setup-card">
    <h2>System</h2>
    <dl>
      <dt>Bridge</dt><dd>Running</dd>
      <dt>Port</dt><dd>{port}</dd>
      <dt>Bridge version</dt><dd>{bridgeVersion}</dd>
      <dt>Host OS</dt><dd>{host.os} {host.osVersion}</dd>
      <dt>Login service</dt><dd>{serviceRunning === null ? "Not available on this platform" : serviceRunning ? "Running" : "Not running"}</dd>
      <dt>Scope</dt><dd>loopback-only</dd>
      <dt>Log</dt><dd><code>{logPath}</code></dd>
    </dl>
    <p>{commandsHeading}</p>
    <pre><code>pocketpet service status</code></pre>
    <pre><code>pocketpet service install</code></pre>
  </section>
</main>
<noscript><p class="noscript">…pairing and Look editing need the setup app; pairing links remain usable…</p></noscript>
```

The exact copy keys must be added to all three languages in `src/i18n.ts`: `hostThisComputer`, `hostVersion`, `navPair`, `navLook`, `navSystem`, `lookHeading`, `lookEnableJavaScript`, `lookClock`, `lookPet`, `lookLayout`, `lookOpenStudio`, `systemHeading`, `bridgeRunning`, `portLabel`, `bridgeVersionLabel`, `hostOsLabel`, `loginServiceLabel`, `serviceRunning`, `serviceNotRunning`, `serviceUnavailable`, `scopeLabel`, `loopbackOnly`, `logPathLabel`, `commandsHeading`, `openPhoneView`, `copyDiagnostics`, `copyCommand`, `copied`, `noJsNote`, `computerOnlyNote`. Replace `troubleshootMacOnly`, `macOnlyNote`, `debugScopeValue`, `deniedHtmlTitle`, `deniedHeading`, `deniedBody`, and `deniedNote` with computer-only wording. Also replace every generic Mac reference in `stepWifi`, `usbBody`, `noIpNote`, `troubleshootUnreachable`, and the local/URL copy with computer/host wording. The actual OS label may say macOS; the UI must not use Mac as a synonym for the host. The old Mac-only strings must not remain in any language.

`setupAssets(webDist)`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type SetupAssets = { js: string; css: string[] };

export function setupAssets(webDist: string): SetupAssets {
  try {
    const manifest = JSON.parse(readFileSync(join(webDist, "manifest.json"), "utf8")) as Record<string, { file?: unknown; css?: unknown; isEntry?: unknown }>;
    const entry = Object.values(manifest).find((item) =>
      item.isEntry === true && typeof item.file === "string" && item.file.includes("setup")
    );
    if (!entry || typeof entry.file !== "string") return { js: "", css: [] };
    const css = Array.isArray(entry.css) ? entry.css.filter((value): value is string => typeof value === "string") : [];
    return { js: `/assets/web/${entry.file}`, css: css.map((file) => `/assets/web/${file}`) };
  } catch {
    return { js: "", css: [] };
  }
}
```

- [ ] **Step 4: Serve the setup shell and assets**

Update the `/setup` route in `src/server.ts`:

```ts
const host = hostInfo();
const probeService = opts.probeService ?? (() => serviceStatus({ home, nodePath: process.execPath, cliPath: "" }));
const serviceRunning = process.platform === "darwin" ? await probeService().catch(() => false) : null;
const assets = setupAssets(opts.webDist);
const html = setupPageHtml({
  qrSvg,
  ipUrls: links.ipUrls,
  localUrl: links.localUrl,
  port,
  usbUrl: links.usbUrl,
  lang,
  hostname,
  assets,
  host,
  serviceRunning,
  logPath: join(home, "logs", "bridge.log"),
  appearance: config.appearance,
});
res.writeHead(200, {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy":
    "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
});
```

The 403 page keeps the existing headers and uses the computer-only `setupDeniedHtml`. The setup app's JS/CSS live under `/assets/web/`; add a loopback + Host static branch before the auth gate so the setup page can load the built assets without a phone token:

```ts
if (req.method === "GET" && path.startsWith("/assets/web/") && isSetupRequestAllowed(req, port)) {
  const file = safeJoin(opts.webDist, path.slice("/assets/web".length));
  if (!file || !existsSync(file)) return text(res, 404, "not found");
  return serveFile(res, file);
}
```

A LAN request does not match the loopback branch and falls through to the existing authenticated `/assets/web/` route, so the phone still needs its token for LAN assets. The static assets contain no token, config, prompt, or agent content; only code and CSS. Do not set the phone auth cookie for the setup page and do not use the phone `/api/pets` routes.

- [ ] **Step 5: Build the setup app shell and tokens**

Update `web/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  base: "/assets/web/",
  build: {
    outDir: resolve(root, "../dist/web"),
    emptyOutDir: true,
    manifest: "manifest.json",
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        setup: resolve(root, "src/setup/main.ts"),
      },
    },
  },
});
```

Create `web/src/tokens.css` with the spec tokens and the shared base rules. Use the exact light and dark values from the spec; define `.card`, `.button`, `.button-primary`, `.status-dot`, `.status-success`, `.status-warning`, `.status-danger`, `.focus-ring`, `.label`, and `.muted`. No gradients, shadows, emoji, or external fonts.

Create `web/src/setup/setup.css` importing `../tokens.css`, with a two-column setup card grid at 880px, a full-width Pair card, the header, anchor nav, QR panel, no-JS note, and the read-only Look fallback. The fallback shows the Open Studio button disabled and the JavaScript note; Task 5 wires the real editor and enables the button. The disabled button is honest about the missing editor, not a silent action.

Create `web/src/setup/main.ts`:

```ts
import "./setup.css";
import { isLang } from "../../../src/i18n.js";
import { t as webT } from "../i18n.js";

const lang = isLang(document.documentElement.lang) ? document.documentElement.lang : "en";
const root = document.querySelector<HTMLElement>("#look-app");
if (root) {
  fetch("/api/setup/look")
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error("look unavailable"))))
    .then((look: { appearance: { clock: { scale: number }; pet: { scale: number }; layout: { mode: string; gap: number } }; activePet: string | null; pets: Array<{ id: string; name: string }> }) => {
      const pet = look.pets.find((candidate) => candidate.id === look.activePet);
      root.replaceChildren();
      const summary = document.createElement("dl");
      summary.className = "look-summary";
      const add = (label: string, value: string) => {
        const dt = document.createElement("dt");
        dt.textContent = label;
        const dd = document.createElement("dd");
        dd.textContent = value;
        summary.append(dt, dd);
      };
      add(webT(lang, "look.clock"), `${look.appearance.clock.scale}%`);
      add(webT(lang, "look.petSize"), `${look.appearance.pet.scale}%`);
      add(webT(lang, "look.layout"), `${look.appearance.layout.mode} · ${look.appearance.layout.gap}`);
      if (pet) add(webT(lang, "look.pet"), pet.name);
      root.append(summary);
      document.documentElement.dataset.setupReady = "true";
    })
    .catch(() => {
      const note = document.createElement("p");
      note.className = "error";
      note.textContent = webT(lang, "common.error");
      root.append(note);
    });
}
```

Add the web i18n keys needed by this task: `look.clock`, `look.pet`, `look.petSize`, `look.layout`, `common.error`. Add equivalent strings in all three languages. The setup app uses the static server-rendered Pair/System; it only hydrates Look for now.

- [ ] **Step 6: Update tests and copy**

Update `tests/onboarding.test.ts` and `tests/serverI18n.test.ts` to import `setupPageHtml`/`setupDeniedHtml` from `src/setupPage.js`. Update the old assertions:

- Replace Mac-only denied phrases with computer-only assertions in all languages.
- Replace "no external scripts or assets" with "no off-origin scripts or assets": the setup shell may contain `<script type="module" src="/assets/web/...">` and `<link rel="stylesheet" href="/assets/web/...">`, but must not contain `http://` external assets, inline scripts, or `<img>`.
- Apply the new setup CSP assertion in `tests/server.test.ts`; the `/setup` 403 still uses the denied page and no token.
- Update the asset-token test: loopback `/assets/web/index.html` is served without a cookie; a foreign Host is 401; a LAN request without a cookie is 401. Add a test that the setup page's manifest script/link URLs are served on loopback. Static assets contain no token or config.
- Add the no-JS Playwright test in `e2e/setup.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test.describe("setup shell", () => {
  test("renders pairing, look fallback and system cards without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/setup");
    await expect(page.getByRole("heading", { name: "PocketPet Setup" })).toBeVisible();
    await expect(page.locator("#pair svg")).toBeVisible();
    await expect(page.locator("#look")).toContainText("JavaScript");
    await expect(page.locator("#system")).toContainText("Bridge");
    await context.close();
  });
});
```

- [ ] **Step 7: Run focused and full checks**

Run: `npx vitest run tests/setupPage.test.ts tests/onboarding.test.ts tests/serverI18n.test.ts tests/server.test.ts`
Expected: PASS.

Run: `npm run typecheck`; `npm run build:web`; then `npm run build` to confirm the setup entry and manifest are produced.
Expected: PASS; the build output includes `manifest.json` with a setup entry. Record the exact manifest entry and CSS file in the task report.

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/setupPage.ts src/onboarding.ts src/server.ts src/i18n.ts web/vite.config.ts web/src/tokens.css web/src/setup/main.ts web/src/setup/setup.css tests/setupPage.test.ts tests/onboarding.test.ts tests/serverI18n.test.ts tests/server.test.ts e2e/setup.spec.ts
git commit -m "feat: add setup dashboard shell and tokens"
```

---

### Task 4: Shared stage renderer and Direct Canvas Studio

**Files:**
- Create: `web/src/look/stage.ts`
- Create: `web/src/look/stage.css`
- Create: `web/src/look/studio.ts`
- Create: `web/src/look/studio.css`
- Modify: `web/src/sprite.ts` (reduced-motion frame control)
- Modify: `web/src/i18n.ts` (setup/phone shared Look and Studio keys)
- Test: `tests/stage.test.ts`

**Interfaces:**
- Produces: `StageRefs = { stage: HTMLElement; clock: HTMLElement; time: HTMLElement; date: HTMLElement; pet: HTMLCanvasElement }`.
- Produces: `bindStage(root: ParentNode): StageRefs | null` using `[data-stage]`, `[data-clock]`, `[data-time]`, `[data-date]`, `[data-pet]`.
- Produces: `applyStage(stage: StageRefs, appearance: Appearance): void`; sets theme/motion on the document root, stage layout mode, gap, padding, scales, positions, and session density.
- Produces: `formatClock(lang: Lang, format: ClockFormat, date: Date): { time: string; date: string }`.
- Produces: `resolveTheme(mode, prefersDark?)` and `resolveMotion(mode, prefersReduced?)`.
- Produces: `watchSystemAppearance(onChange): () => void`.
- Produces: `StudioPet`, `StudioOptions`, `openStudio(options): StudioHandle`.
- Studio selectors:
  - `#studio` dialog
  - `[data-stage]`, `[data-element="clock"]`, `[data-element="pet"]`
  - `[data-field="clock.scale" | "clock.x" | "clock.y" | "clock.format" | "pet.scale" | "pet.x" | "pet.y" | "layout.mode" | "layout.gap" | "stage.padding" | "theme" | "motion" | "sessions.density" | "sessions.maxVisible" | "sessions.showProject" | "sessions.showTool" | "sessions.showElapsed"]`
  - `[data-act="undo" | "redo" | "reset-element" | "reset-all" | "save" | "cancel"]`
  - `[data-frame="folded" | "wide"]`, `[data-snap]`
- Consumes: `Appearance`, `DEFAULT_APPEARANCE`, `normalizeAppearance`, `diffAppearance` from `src/appearance.ts`; `PetRenderer`; `Lang`/`t`.

- [ ] **Step 1: Write the failing stage tests**

Create `tests/stage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatClock, resolveMotion, resolveTheme } from "../web/src/look/stage.js";

describe("formatClock", () => {
  const date = new Date("2026-11-21T16:50:00");

  it("formats 24-hour time by default", () => {
    expect(formatClock("en", "24h", date).time).toBe("16:50");
  });

  it("formats 12-hour time with a day period", () => {
    expect(formatClock("en", "12h", date).time).toMatch(/4:50\s*PM/i);
  });

  it("uses the selected language for the date", () => {
    expect(formatClock("zh-Hans", "24h", date).date).toContain("11月");
    expect(formatClock("zh-Hant", "24h", date).date).toContain("11月");
  });
});

describe("theme and motion resolution", () => {
  it("resolves system values through the injected media preference", () => {
    expect(resolveTheme("system", () => true)).toBe("dark");
    expect(resolveTheme("system", () => false)).toBe("light");
    expect(resolveTheme("light", () => true)).toBe("light");
    expect(resolveTheme("dark", () => false)).toBe("dark");
    expect(resolveMotion("system", () => true)).toBe("reduced");
    expect(resolveMotion("system", () => false)).toBe("full");
    expect(resolveMotion("full", () => true)).toBe("full");
    expect(resolveMotion("reduced", () => false)).toBe("reduced");
  });
});
```

- [ ] **Step 2: Run the stage tests to verify they fail**

Run: `npx vitest run tests/stage.test.ts`
Expected: FAIL because `web/src/look/stage.ts` does not exist.

- [ ] **Step 3: Implement the shared stage**

Create `web/src/look/stage.ts`:

```ts
import type { Appearance, ClockFormat, MotionMode, ThemeMode } from "../../../src/appearance.js";
import { localeFor, type Lang } from "../i18n.js";

export interface StageRefs {
  stage: HTMLElement;
  clock: HTMLElement;
  time: HTMLElement;
  date: HTMLElement;
  pet: HTMLCanvasElement;
}

export function bindStage(root: ParentNode): StageRefs | null {
  const stage = root.querySelector<HTMLElement>("[data-stage]");
  const clock = stage?.querySelector<HTMLElement>("[data-clock]");
  const time = stage?.querySelector<HTMLElement>("[data-time]");
  const date = stage?.querySelector<HTMLElement>("[data-date]");
  const pet = stage?.querySelector<HTMLCanvasElement>("[data-pet]");
  if (!stage || !clock || !time || !date || !pet) return null;
  return { stage, clock, time, date, pet };
}

export function resolveTheme(
  mode: ThemeMode,
  prefersDark: () => boolean = () => window.matchMedia("(prefers-color-scheme: dark)").matches,
): "light" | "dark" {
  return mode === "system" ? (prefersDark() ? "dark" : "light") : mode;
}

export function resolveMotion(
  mode: MotionMode,
  prefersReduced: () => boolean = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
): "full" | "reduced" {
  return mode === "system" ? (prefersReduced() ? "reduced" : "full") : mode;
}

export function applyStage(stage: StageRefs, appearance: Appearance): void {
  const root = stage.stage.ownerDocument.documentElement;
  root.dataset.theme = resolveTheme(appearance.theme);
  root.dataset.motion = resolveMotion(appearance.motion);
  root.dataset.sessionsDensity = appearance.sessions.density;
  stage.stage.dataset.layoutMode = appearance.layout.mode;
  stage.stage.style.setProperty("--look-gap", `${appearance.layout.gap}px`);
  stage.stage.style.setProperty("--look-padding", `${appearance.stage.padding}px`);
  stage.stage.style.setProperty("--clock-scale", String(appearance.clock.scale / 100));
  stage.stage.style.setProperty("--pet-scale", String(appearance.pet.scale / 100));
  stage.clock.style.setProperty("--clock-x", `${appearance.clock.x}%`);
  stage.clock.style.setProperty("--clock-y", `${appearance.clock.y}%`);
  stage.pet.style.setProperty("--pet-x", `${appearance.pet.x}%`);
  stage.pet.style.setProperty("--pet-y", `${appearance.pet.y}%`);
}

export function formatClock(lang: Lang, format: ClockFormat, date: Date): { time: string; date: string } {
  const locale = localeFor(lang);
  return {
    time: new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: format === "12h",
    }).format(date),
    date: new Intl.DateTimeFormat(locale, {
      month: "long",
      day: "numeric",
      weekday: "short",
    }).format(date),
  };
}

export function watchSystemAppearance(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const dark = window.matchMedia("(prefers-color-scheme: dark)");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  dark.addEventListener("change", onChange);
  motion.addEventListener("change", onChange);
  return () => {
    dark.removeEventListener("change", onChange);
    motion.removeEventListener("change", onChange);
  };
}
```

Create `web/src/look/stage.css`:

```css
[data-stage] {
  position: relative;
  overflow: hidden;
  padding: var(--look-padding, 20px);
}
[data-stage][data-layout-mode="stack"] {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--look-gap, 16px);
}
[data-clock] {
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: auto;
}
[data-time] {
  font-size: calc(clamp(48px, 13vw, 132px) * var(--clock-scale, 1));
  font-weight: 300;
  letter-spacing: -0.04em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
[data-date] {
  margin-top: 4px;
  color: var(--muted);
  font-size: 13px;
}
[data-pet] {
  width: calc(min(62vw, 240px) * var(--pet-scale, 1));
  height: auto;
  image-rendering: pixelated;
  touch-action: none;
}
[data-stage][data-layout-mode="free"] [data-clock],
[data-stage][data-layout-mode="free"] [data-pet] {
  position: absolute;
}
[data-stage][data-layout-mode="free"] [data-clock] {
  left: var(--clock-x, 50%);
  top: var(--clock-y, 36%);
  transform: translate(-50%, -50%);
}
[data-stage][data-layout-mode="free"] [data-pet] {
  left: var(--pet-x, 50%);
  top: var(--pet-y, 62%);
  transform: translate(-50%, -50%);
}
html[data-motion="reduced"] * {
  animation-duration: 0.001ms !important;
  transition-duration: 0.001ms !important;
}
```

The phone and setup preview import this file. The phone's wide overrides belong in `web/src/style.css`; the Studio's preview frame styles belong in `studio.css`.

- [ ] **Step 4: Add reduced motion to the pet renderer**

Modify `web/src/sprite.ts`:

```ts
private reduced = false;

setReducedMotion(reduced: boolean): void {
  this.reduced = reduced;
  if (reduced) this.frame = 0;
}

private draw(now: number): void {
  const ctx = this.canvas.getContext("2d");
  if (!ctx) return;
  const def = STATES[this.state];
  if (!this.reduced && now - this.last >= (def.frames[this.frame] ?? 150)) {
    this.frame = (this.frame + 1) % def.frames.length;
    this.last = now;
  }
  // ...existing clear/draw body unchanged...
}
```

When reduced, the current frame remains static; state changes still reset the frame to 0. Do not stop the RAF loop; the stage may change appearance while the editor is open.

- [ ] **Step 5: Add the shared Look/Studio i18n keys**

Add these keys to `web/src/i18n.ts` in all three dictionaries with native translations:

`look.clock`, `look.pet`, `look.petSize`, `look.layout`, `look.followHost`, `look.custom`, `look.openStudio`, `look.reset`, `look.search`, `look.hostDefault`, `look.thisPhone`, `look.storageDenied`, `look.noPets`, `look.preview`, `look.folded`, `look.wide`, `common.save`, `common.cancel`, `common.close`, `common.reset`, `common.retry`, `common.error`, `studio.title`, `studio.scopeHost`, `studio.scopePhone`, `studio.undo`, `studio.redo`, `studio.save`, `studio.cancel`, `studio.resetElement`, `studio.resetAll`, `studio.folded`, `studio.wide`, `studio.snap`, `studio.clock`, `studio.pet`, `studio.layout`, `studio.stack`, `studio.free`, `studio.gap`, `studio.padding`, `studio.scale`, `studio.x`, `studio.y`, `studio.format`, `studio.theme`, `studio.system`, `studio.light`, `studio.dark`, `studio.motion`, `studio.full`, `studio.reduced`, `studio.sessions`, `studio.density`, `studio.comfortable`, `studio.compact`, `studio.maxVisible`, `studio.showProject`, `studio.showTool`, `studio.showElapsed`, `studio.sample`, `studio.saved`, `studio.saveFailed`, `studio.close`.

English reference values:

| Key | English |
|---|---|
| `look.clock` | Clock |
| `look.pet` | Pet |
| `look.petSize` | Pet size |
| `look.layout` | Layout |
| `look.followHost` | Follow host defaults |
| `look.custom` | This phone |
| `look.openStudio` | Open Studio |
| `look.reset` | Reset this phone |
| `look.search` | Search pets… |
| `look.hostDefault` | Host default |
| `look.thisPhone` | This phone |
| `look.storageDenied` | This browser blocks local storage; this phone follows the host. |
| `look.noPets` | No pets found |
| `look.preview` | Preview |
| `look.folded` | Folded |
| `look.wide` | Wide |
| `common.save` | Save |
| `common.cancel` | Cancel |
| `common.close` | Close |
| `common.reset` | Reset |
| `common.retry` | Retry |
| `common.error` | Something went wrong |
| `studio.title` | Studio |
| `studio.scopeHost` | Host defaults |
| `studio.scopePhone` | This phone |
| `studio.undo` | Undo |
| `studio.redo` | Redo |
| `studio.save` | Save |
| `studio.cancel` | Cancel |
| `studio.resetElement` | Reset element |
| `studio.resetAll` | Reset all |
| `studio.folded` | Folded |
| `studio.wide` | Wide |
| `studio.snap` | Snap |
| `studio.clock` | Clock |
| `studio.pet` | Pet |
| `studio.layout` | Layout |
| `studio.stack` | Stack |
| `studio.free` | Free |
| `studio.gap` | Gap |
| `studio.padding` | Padding |
| `studio.scale` | Scale |
| `studio.x` | X |
| `studio.y` | Y |
| `studio.format` | Format |
| `studio.theme` | Theme |
| `studio.system` | System |
| `studio.light` | Light |
| `studio.dark` | Dark |
| `studio.motion` | Motion |
| `studio.full` | Full |
| `studio.reduced` | Reduced |
| `studio.sessions` | Sessions |
| `studio.density` | Density |
| `studio.comfortable` | Comfortable |
| `studio.compact` | Compact |
| `studio.maxVisible` | Max visible |
| `studio.showProject` | Show project |
| `studio.showTool` | Show tool |
| `studio.showElapsed` | Show elapsed |
| `studio.sample` | Sample layout — not live agent data |
| `studio.saved` | Saved |
| `studio.saveFailed` | Save failed |
| `studio.close` | Close Studio |

- [ ] **Step 6: Implement the Studio**

Create `web/src/look/studio.ts`. Use this reference implementation; keep the selector contract from Interfaces:

```ts
import {
  DEFAULT_APPEARANCE,
  normalizeAppearance,
  type Appearance,
} from "../../../src/appearance.js";
import { PetRenderer } from "../sprite.js";
import { t, type Lang, type MessageKey } from "../i18n.js";
import { applyStage, bindStage, formatClock, resolveMotion } from "./stage.js";
import "./studio.css";

export interface StudioPet {
  id: string;
  name: string;
  spriteUrl: string;
}

export interface StudioOptions {
  appearance: Appearance;
  pet: StudioPet | null;
  lang: Lang;
  scope: "host" | "phone";
  onSave(next: Appearance): Promise<void>;
  onClose?(): void;
}

export interface StudioHandle {
  close(): void;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, Math.round(value)));

function label(lang: Lang, key: MessageKey): string {
  return t(lang, key);
}

export function openStudio(options: StudioOptions): StudioHandle {
  const restore = document.activeElement as HTMLElement | null;
  const overlay = document.createElement("div");
  overlay.id = "studio";
  overlay.className = "studio";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", label(options.lang, "studio.title"));
  overlay.innerHTML = `
    <div class="studio-topbar">
      <strong>${label(options.lang, "studio.title")}</strong>
      <span class="studio-scope">${label(options.lang, options.scope === "host" ? "studio.scopeHost" : "studio.scopePhone")}</span>
      <div class="studio-actions">
        <button type="button" data-act="undo" aria-label="${label(options.lang, "studio.undo")}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 7 4 12l5 5M4 12h9a5 5 0 0 1 0 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <button type="button" data-act="redo" aria-label="${label(options.lang, "studio.redo")}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 7l5 5-5 5M20 12h-9a5 5 0 0 0 0 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <button type="button" data-act="cancel">${label(options.lang, "studio.cancel")}</button>
        <button type="button" class="button-primary" data-act="save">${label(options.lang, "studio.save")}</button>
      </div>
    </div>
    <div class="studio-body">
      <div class="studio-preview" data-frame="folded">
        <div class="studio-stage" data-stage>
          <div data-clock data-element="clock" tabindex="0" aria-label="${label(options.lang, "studio.clock")}">
            <div data-time>--:--</div>
            <div data-date></div>
            <span class="studio-handle" data-handle="clock" aria-hidden="true"></span>
          </div>
          <canvas data-pet data-element="pet" width="192" height="208" tabindex="0" aria-label="${label(options.lang, "studio.pet")}"></canvas>
          <div class="studio-sessions" aria-hidden="true">
            <span>Claude Code · ${label(options.lang, "studio.sample")}</span>
            <span>Qoder · ${label(options.lang, "studio.sample")}</span>
          </div>
        </div>
      </div>
      <div class="studio-panel">
        <div class="studio-toolbar">
          <button type="button" data-frame="folded">${label(options.lang, "studio.folded")}</button>
          <button type="button" data-frame="wide">${label(options.lang, "studio.wide")}</button>
          <label><input type="checkbox" data-snap checked> ${label(options.lang, "studio.snap")}</label>
          <button type="button" data-act="reset-element">${label(options.lang, "studio.resetElement")}</button>
          <button type="button" data-act="reset-all">${label(options.lang, "studio.resetAll")}</button>
        </div>
        <fieldset><legend>${label(options.lang, "studio.layout")}</legend>
          <label>${label(options.lang, "studio.layout")}
            <select data-field="layout.mode">
              <option value="stack">${label(options.lang, "studio.stack")}</option>
              <option value="free">${label(options.lang, "studio.free")}</option>
            </select>
          </label>
          <label>${label(options.lang, "studio.gap")} <input type="number" min="8" max="48" data-field="layout.gap"></label>
          <label>${label(options.lang, "studio.padding")} <input type="number" min="8" max="32" data-field="stage.padding"></label>
        </fieldset>
        <fieldset><legend>${label(options.lang, "studio.clock")}</legend>
          <label>${label(options.lang, "studio.scale")} <input type="number" min="60" max="160" data-field="clock.scale"></label>
          <label>${label(options.lang, "studio.x")} <input type="number" min="0" max="100" data-field="clock.x"></label>
          <label>${label(options.lang, "studio.y")} <input type="number" min="0" max="100" data-field="clock.y"></label>
          <label>${label(options.lang, "studio.format")}
            <select data-field="clock.format"><option value="24h">24h</option><option value="12h">12h</option></select>
          </label>
        </fieldset>
        <fieldset><legend>${label(options.lang, "studio.pet")}</legend>
          <label>${label(options.lang, "studio.scale")} <input type="number" min="80" max="200" data-field="pet.scale"></label>
          <label>${label(options.lang, "studio.x")} <input type="number" min="0" max="100" data-field="pet.x"></label>
          <label>${label(options.lang, "studio.y")} <input type="number" min="0" max="100" data-field="pet.y"></label>
        </fieldset>
        <fieldset><legend>${label(options.lang, "studio.theme")}</legend>
          <label>${label(options.lang, "studio.theme")}
            <select data-field="theme">
              <option value="system">${label(options.lang, "studio.system")}</option>
              <option value="light">${label(options.lang, "studio.light")}</option>
              <option value="dark">${label(options.lang, "studio.dark")}</option>
            </select>
          </label>
          <label>${label(options.lang, "studio.motion")}
            <select data-field="motion">
              <option value="system">${label(options.lang, "studio.system")}</option>
              <option value="full">${label(options.lang, "studio.full")}</option>
              <option value="reduced">${label(options.lang, "studio.reduced")}</option>
            </select>
          </label>
        </fieldset>
        <fieldset><legend>${label(options.lang, "studio.sessions")}</legend>
          <label>${label(options.lang, "studio.density")}
            <select data-field="sessions.density">
              <option value="comfortable">${label(options.lang, "studio.comfortable")}</option>
              <option value="compact">${label(options.lang, "studio.compact")}</option>
            </select>
          </label>
          <label>${label(options.lang, "studio.maxVisible")} <input type="number" min="1" max="6" data-field="sessions.maxVisible"></label>
          <label><input type="checkbox" data-field="sessions.showProject"> ${label(options.lang, "studio.showProject")}</label>
          <label><input type="checkbox" data-field="sessions.showTool"> ${label(options.lang, "studio.showTool")}</label>
          <label><input type="checkbox" data-field="sessions.showElapsed"> ${label(options.lang, "studio.showElapsed")}</label>
        </fieldset>
        <p class="studio-status" role="status" aria-live="polite"></p>
      </div>
    </div>
  `;
  document.body.append(overlay);
  document.body.classList.add("studio-open");
  const stage = bindStage(overlay);
  if (!stage) {
    overlay.remove();
    document.body.classList.remove("studio-open");
    throw new Error("Studio stage is missing");
  }
  const renderer = new PetRenderer(stage.pet);
  renderer.start();
  let draft = normalizeAppearance(options.appearance);
  let selected: "clock" | "pet" = "clock";
  let snap = true;
  const history: Appearance[] = [structuredClone(draft)];
  let historyIndex = 0;
  let closed = false;

  const snapshot = (): Appearance => structuredClone(draft);
  const pushHistory = (): void => {
    history.splice(historyIndex + 1);
    history.push(snapshot());
    historyIndex = history.length - 1;
    renderButtons();
  };
  const update = (): void => {
    applyStage(stage, draft);
    const clock = formatClock(options.lang, draft.clock.format, new Date());
    stage.time.textContent = clock.time;
    stage.date.textContent = clock.date;
    renderer.setReducedMotion(resolveMotion(draft.motion) === "reduced");
    renderer.setState("idle");
    renderFields();
    renderSelection();
  };
  const mutate = (fn: (next: Appearance) => void): void => {
    const next = structuredClone(draft);
    fn(next);
    draft = normalizeAppearance(next);
    update();
  };
  const renderButtons = (): void => {
    const undo = overlay.querySelector<HTMLButtonElement>('[data-act="undo"]');
    const redo = overlay.querySelector<HTMLButtonElement>('[data-act="redo"]');
    if (undo) undo.disabled = historyIndex <= 0;
    if (redo) redo.disabled = historyIndex >= history.length - 1;
  };
  const readField = (path: string): unknown => {
    if (path === "theme") return draft.theme;
    if (path === "motion") return draft.motion;
    const [group, field] = path.split(".") as [keyof Appearance, string];
    const value = (draft as unknown as Record<string, unknown>)[group] as Record<string, unknown> | undefined;
    return value?.[field];
  };
  const renderFields = (): void => {
    overlay.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-field]").forEach((input) => {
      const currentValue = readField(input.dataset.field ?? "");
      if (input instanceof HTMLInputElement && input.type === "checkbox") input.checked = Boolean(currentValue);
      else input.value = String(currentValue ?? "");
    });
  };
  const renderSelection = (): void => {
    overlay.querySelectorAll<HTMLElement>("[data-element]").forEach((element) => {
      element.dataset.selected = String(element.dataset.element === selected);
    });
  };
  const select = (element: "clock" | "pet"): void => {
    selected = element;
    renderSelection();
  };
  const setField = (path: string, raw: string | boolean): void => {
    if (path === "theme" || path === "motion") {
      const nextValue = String(raw);
      if (path === "theme" && !["system", "light", "dark"].includes(nextValue)) return;
      if (path === "motion" && !["system", "full", "reduced"].includes(nextValue)) return;
      mutate((next) => { (next as unknown as Record<string, unknown>)[path] = nextValue; });
      pushHistory();
      return;
    }
    const [group, field] = path.split(".") as [keyof Appearance, string];
    const reference = draft[group] as unknown as Record<string, unknown>;
    const previous = reference[field];
    if (typeof previous === "boolean" && typeof raw === "boolean") {
      mutate((next) => { ((next as unknown as Record<string, Record<string, unknown>>)[group])[field] = raw; });
    } else if (typeof previous === "number") {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return;
      mutate((next) => { ((next as unknown as Record<string, Record<string, unknown>>)[group])[field] = parsed; });
    } else if (typeof previous === "string") {
      mutate((next) => { ((next as unknown as Record<string, Record<string, unknown>>)[group])[field] = String(raw); });
    }
    pushHistory();
  };

  overlay.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-field]").forEach((input) => {
    const handler = (): void => {
      if (input instanceof HTMLInputElement && input.type === "checkbox") setField(input.dataset.field ?? "", input.checked);
      else setField(input.dataset.field ?? "", input.value);
    };
    input.addEventListener(input.tagName === "SELECT" || input.type === "checkbox" ? "change" : "input", handler);
  });
  overlay.querySelectorAll<HTMLButtonElement>("button[data-frame]").forEach((button) => {
    const frame = button.dataset.frame === "wide" ? "wide" : "folded";
    button.addEventListener("click", () => {
      const preview = overlay.querySelector<HTMLElement>(".studio-preview");
      if (preview) preview.dataset.frame = frame;
      overlay.querySelectorAll<HTMLButtonElement>("button[data-frame]").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    });
  });
  const snapInput = overlay.querySelector<HTMLInputElement>("[data-snap]");
  snapInput?.addEventListener("change", () => { snap = Boolean(snapInput.checked); });

  stage.stage.addEventListener("pointerdown", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-element]");
    if (!target || (event.target as HTMLElement).closest("[data-handle]")) return;
    const element = target.dataset.element === "pet" ? "pet" : "clock";
    select(element);
    const rect = stage.stage.getBoundingClientRect();
    const start = { px: event.clientX, py: event.clientY, x: draft[element].x, y: draft[element].y };
    if (draft.layout.mode === "stack") mutate((next) => { next.layout.mode = "free"; });
    const move = (moveEvent: PointerEvent): void => {
      const rawX = start.x + ((moveEvent.clientX - start.px) / rect.width) * 100;
      const rawY = start.y + ((moveEvent.clientY - start.py) / rect.height) * 100;
      const snapValue = (value: number): number => {
        if (!snap) return clamp(value, 0, 100);
        return clamp(Math.round((value / 100 * rect.width) / 8) * 8 / rect.width * 100, 0, 100);
      };
      mutate((next) => {
        next[element].x = snapValue(rawX);
        next[element].y = clamp(rawY, 0, 100);
      });
    };
    const up = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      pushHistory();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });

  overlay.querySelectorAll<HTMLElement>("[data-handle]").forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      const element = handle.dataset.handle === "pet" ? "pet" : "clock";
      select(element);
      const rect = stage.stage.getBoundingClientRect();
      const target = stage[element].getBoundingClientRect();
      const centerX = target.left + target.width / 2;
      const centerY = target.top + target.height / 2;
      const startDistance = Math.hypot(event.clientX - centerX, event.clientY - centerY);
      const startScale = draft[element].scale;
      const move = (moveEvent: PointerEvent): void => {
        const distance = Math.hypot(moveEvent.clientX - centerX, moveEvent.clientY - centerY);
        if (startDistance <= 0) return;
        mutate((next) => {
          next[element].scale = clamp(startScale * (distance / startDistance), element === "clock" ? 60 : 80, element === "clock" ? 160 : 200);
        });
      };
      const up = (): void => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        pushHistory();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
  });

  overlay.addEventListener("keydown", (event) => {
    if ((event.target as HTMLElement).matches("input, select, textarea")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      mutate((next) => {
        if (event.key === "ArrowLeft") next[selected].x = clamp(next[selected].x - step, 0, 100);
        if (event.key === "ArrowRight") next[selected].x = clamp(next[selected].x + step, 0, 100);
        if (event.key === "ArrowUp") next[selected].y = clamp(next[selected].y - step, 0, 100);
        if (event.key === "ArrowDown") next[selected].y = clamp(next[selected].y + step, 0, 100);
      });
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      mutate((next) => { next[selected].scale = clamp(next[selected].scale + 5, selected === "clock" ? 60 : 80, selected === "clock" ? 160 : 200); });
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      mutate((next) => { next[selected].scale = clamp(next[selected].scale - 5, selected === "clock" ? 60 : 80, selected === "clock" ? 160 : 200); });
    }
  });

  const undo = (): void => {
    if (historyIndex <= 0) return;
    historyIndex -= 1;
    draft = structuredClone(history[historyIndex]!);
    update();
    renderButtons();
  };
  const redo = (): void => {
    if (historyIndex >= history.length - 1) return;
    historyIndex += 1;
    draft = structuredClone(history[historyIndex]!);
    update();
    renderButtons();
  };
  const reset = (all: boolean): void => {
    mutate((next) => {
      if (all) Object.assign(next, structuredClone(DEFAULT_APPEARANCE));
      else next[selected] = structuredClone(DEFAULT_APPEARANCE[selected]);
    });
    pushHistory();
  };
  const setStatus = (message: string): void => {
    const status = overlay.querySelector<HTMLElement>(".studio-status");
    if (status) status.textContent = message;
  };
  const save = async (): Promise<void> => {
    try {
      await options.onSave(normalizeAppearance(draft));
      setStatus(label(options.lang, "studio.saved"));
      close();
    } catch {
      setStatus(label(options.lang, "studio.saveFailed"));
    }
  };
  const close = (): void => {
    if (closed) return;
    closed = true;
    renderer.stop();
    document.removeEventListener("keydown", onDocumentKey);
    overlay.remove();
    document.body.classList.remove("studio-open");
    options.onClose?.();
    restore?.focus();
  };
  const onDocumentKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && document.activeElement && overlay.contains(document.activeElement)) close();
  };
  document.addEventListener("keydown", onDocumentKey);

  overlay.querySelector<HTMLButtonElement>('[data-act="undo"]')?.addEventListener("click", undo);
  overlay.querySelector<HTMLButtonElement>('[data-act="redo"]')?.addEventListener("click", redo);
  overlay.querySelector<HTMLButtonElement>('[data-act="reset-element"]')?.addEventListener("click", () => reset(false));
  overlay.querySelector<HTMLButtonElement>('[data-act="reset-all"]')?.addEventListener("click", () => reset(true));
  overlay.querySelector<HTMLButtonElement>('[data-act="save"]')?.addEventListener("click", () => { void save(); });
  overlay.querySelector<HTMLButtonElement>('[data-act="cancel"]')?.addEventListener("click", close);
  if (options.pet) {
    renderer.load(options.pet.spriteUrl).catch(() => undefined);
  }
  update();
  renderButtons();
  overlay.querySelector<HTMLElement>("[data-element]")?.focus();
  return { close };
}
```

The Studio uses an inline `innerHTML` template with only labels from the trusted i18n dictionary and no user data. Do not interpolate pet names, project names, or tool text into this template. The sample strip is static and labeled.

The Studio's `applyStage` changes the page-level `data-theme`, `data-motion`, and `data-sessions-density` while editing. Capture those three attributes before opening the editor. On Cancel or Escape, restore them so a cancelled draft does not recolor the setup or phone page. On Save, let the setup/phone `onSave` apply the saved values after the Studio resolves; do not restore them over a successful save. The same rule applies to the preview's selected frame and to any page-level scroll lock.

Create `web/src/look/studio.css` with the full-screen overlay, topbar, two-column body at 900px, bottom panel below, preview frame 9:19.5 and 1:1, selected outline, resize handle, and the property grid. Import `./stage.css` at the top. Use the shared tokens; no shadows or gradients. The Studio panel is a normal sheet on folded screens and a right column on wide screens.

- [ ] **Step 7: Run the stage tests and typecheck**

Run: `npx vitest run tests/stage.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: PASS. The Studio uses DOM types; the web typecheck config includes `web/src`.

Run: `npm run build:web`
Expected: PASS; the Studio CSS is bundled into the phone and setup entries.

- [ ] **Step 8: Commit**

```bash
git add web/src/look/stage.ts web/src/look/stage.css web/src/look/studio.ts web/src/look/studio.css web/src/sprite.ts web/src/i18n.ts tests/stage.test.ts
git commit -m "feat: add shared stage and direct canvas studio"
```

---

### Task 5: Setup Look card, pet picker, host save, and Studio E2E

**Files:**
- Modify: `web/src/setup/main.ts`
- Modify: `web/src/setup/setup.css`
- Modify: `src/i18n.ts` (Look card copy and setup app labels)
- Modify: `tests/setupPage.test.ts`
- Modify: `e2e/setup.spec.ts`
- Test: `tests/setupPage.test.ts`
- Test: `e2e/setup.spec.ts`

**Interfaces:**
- Consumes: `GET /api/setup/look`; `PUT /api/setup/look`; setup pet assets; `openStudio`; `bindStage`; `applyStage`; `formatClock`; `PetRenderer`; `filterPets`.
- Produces: `#look-app` interactive summary, folded/wide preview, pet search/picker, Open Studio, Reset.
- Produces: setup CSRF fetch wrapper:
  - `setupFetch<T>(path, init)` sets `content-type: application/json` and `x-pocketpet-setup: 1` for non-GET requests; throws on non-2xx.
- Produces: host save via `PUT /api/setup/look`; updates the setup state and preview; phone clients receive the broadcast snapshot.
- Produces: setup E2E:
  - Studio opens; a numeric change saves; the summary and `/api/setup/look` reflect it.
  - Host pet selection saves; the summary reflects it.
  - Reset restores defaults.
  - No JavaScript still renders the shell.

- [ ] **Step 1: Write the failing setup Look tests**

Add to `e2e/setup.spec.ts`:

```ts
test("opens Studio, saves host appearance, and reloads it", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("/setup");
  await page.getByRole("button", { name: "Open Studio" }).click();
  const studio = page.locator("#studio");
  await expect(studio).toBeVisible();
  await studio.locator('[data-field="clock.scale"]').fill("140");
  await studio.locator('[data-field="clock.scale"]').dispatchEvent("input");
  await studio.locator('[data-act="save"]').click();
  await expect(studio).toBeHidden();
  await expect(page.locator("#look-app")).toContainText("140");
  const look = await (await page.request.get("/api/setup/look")).json();
  expect(look.appearance.clock.scale).toBe(140);
  await page.reload();
  await expect(page.locator("#look-app")).toContainText("140");
});

test("changes the host pet from setup Look", async ({ page }) => {
  await page.goto("/setup");
  await page.locator("#look-app [data-pet-option] input[value='local:testpet2']").check();
  await expect(page.locator("#look-app")).toContainText("Test Pet 2");
  const look = await (await page.request.get("/api/setup/look")).json();
  expect(look.activePet).toBe("local:testpet2");
});

test("resets the host appearance from setup Look", async ({ page }) => {
  await page.request.put("/api/setup/look", {
    headers: { origin: "http://127.0.0.1:7799", "x-pocketpet-setup": "1", "content-type": "application/json" },
    data: { appearance: { ...DEFAULT_APPEARANCE, clock: { ...DEFAULT_APPEARANCE.clock, scale: 150 } } },
  });
  await page.goto("/setup");
  await page.getByRole("button", { name: "Reset" }).click();
  const after = await (await page.request.get("/api/setup/look")).json();
  expect(after.appearance.clock.scale).toBe(100);
});
```

Import `DEFAULT_APPEARANCE` in `e2e/setup.spec.ts` from `../src/appearance.js`. If Playwright cannot resolve the NodeNext `.js` specifier, import `../src/appearance` without the extension. The test sets a non-default value through the setup API, then Reset must return the clock scale to 100. Do not assert before/after equality after already-defaulted state.

- [ ] **Step 2: Run the focused E2E to verify it fails**

Run: `npm run build && npx playwright test e2e/setup.spec.ts --grep "Studio|host pet|host appearance"`
Expected: FAIL because the setup Look app is read-only and has no pet picker/Studio.

- [ ] **Step 3: Implement the interactive setup Look app**

Replace the read-only `web/src/setup/main.ts` with the following behavior; keep the Task 3 static shell and no-JS fallback.

```ts
import "./setup.css";
import { DEFAULT_APPEARANCE, normalizeAppearance, type Appearance } from "../../../src/appearance.js";
import { isLang } from "../../../src/i18n.js";
import { filterPets, type PetSummary } from "../catalog.js";
import { PetRenderer } from "../sprite.js";
import { applyStage, bindStage, formatClock } from "../look/stage.js";
import { openStudio } from "../look/studio.js";
import { t as webT } from "../i18n.js";

interface SetupLook {
  appearance: Appearance;
  activePet: string | null;
  pets: PetSummary[];
}

const lang = isLang(document.documentElement.lang) ? document.documentElement.lang : "en";
const root = document.querySelector<HTMLElement>("#look-app");
let state: SetupLook | null = null;
let pet: PetSummary | null = null;
let renderer: PetRenderer | null = null;
let storageNotice: string | null = null;

async function setupFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.method && init.method !== "GET") {
    headers.set("content-type", "application/json");
    headers.set("x-pocketpet-setup", "1");
  }
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) throw new Error(`setup request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

async function load(): Promise<void> {
  if (!root) return;
  try {
    state = await setupFetch<SetupLook>("/api/setup/look");
    pet = state.pets.find((candidate) => candidate.id === state.activePet) ?? state.pets[0] ?? null;
    storageNotice = null;
    render();
  } catch {
    root.replaceChildren();
    const message = document.createElement("p");
    message.className = "error";
    message.textContent = webT(lang, "common.error");
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = webT(lang, "common.retry");
    retry.addEventListener("click", () => { void load(); });
    root.append(message, retry);
  }
}

async function save(next: Appearance, petId: string | null): Promise<void> {
  await setupFetch<{ appearance: Appearance; activePet: string | null }>("/api/setup/look", {
    method: "PUT",
    body: JSON.stringify({ appearance: normalizeAppearance(next), activePet: petId }),
  });
}

function render(): void {
  if (!root || !state) return;
  root.replaceChildren();
  const appearance = normalizeAppearance(state.appearance);

  const preview = document.createElement("div");
  preview.className = "look-preview";
  const frame = document.createElement("div");
  frame.className = "look-frame";
  frame.dataset.frame = "folded";
  frame.innerHTML = `
    <div data-stage>
      <div data-clock data-element="clock"><div data-time>--:--</div><div data-date></div></div>
      <canvas data-pet width="192" height="208"></canvas>
    </div>
  `;
  preview.append(frame);

  const frameButtons = document.createElement("div");
  frameButtons.className = "look-frames";
  (["folded", "wide"] as const).forEach((name) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = webT(lang, name === "folded" ? "look.folded" : "look.wide");
    button.dataset.frame = name;
    button.addEventListener("click", () => {
      frame.dataset.frame = name;
      frameButtons.querySelectorAll<HTMLButtonElement>("button").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    });
    frameButtons.append(button);
  });
  preview.append(frameButtons);

  const stage = bindStage(frame);
  if (stage) {
    applyStage(stage, appearance);
    const clock = formatClock(lang, appearance.clock.format, new Date());
    stage.time.textContent = clock.time;
    stage.date.textContent = clock.date;
    renderer?.stop();
    renderer = null;
    if (pet) {
      renderer = new PetRenderer(stage.pet);
      renderer.start();
      renderer.load(pet.spriteUrl).catch(() => undefined);
      renderer.setState("idle");
    }
  }

  const summary = document.createElement("dl");
  summary.className = "look-summary";
  const add = (name: string, value: string) => {
    const dt = document.createElement("dt");
    dt.textContent = name;
    const dd = document.createElement("dd");
    dd.textContent = value;
    summary.append(dt, dd);
  };
  add(webT(lang, "look.clock"), `${appearance.clock.scale}%`);
  add(webT(lang, "look.petSize"), `${appearance.pet.scale}%`);
  add(webT(lang, "look.layout"), `${appearance.layout.mode} · ${appearance.layout.gap}`);
  add(webT(lang, "look.pet"), pet?.name ?? webT(lang, "look.noPets"));

  const actions = document.createElement("div");
  actions.className = "look-actions";
  const studioButton = document.createElement("button");
  studioButton.type = "button";
  studioButton.className = "button-primary";
  studioButton.textContent = webT(lang, "look.openStudio");
  studioButton.addEventListener("click", () => {
    openStudio({
      appearance,
      pet: pet ? { id: pet.id, name: pet.name, spriteUrl: pet.spriteUrl } : null,
      lang,
      scope: "host",
      onSave: async (next) => {
        await save(next, state?.activePet ?? null);
        await load();
      },
    });
  });
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = webT(lang, "common.reset");
  reset.addEventListener("click", async () => {
    try {
      await save(DEFAULT_APPEARANCE, state?.activePet ?? null);
      await load();
    } catch {
      storageNotice = webT(lang, "common.error");
      render();
    }
  });
  actions.append(studioButton, reset);

  const petRow = document.createElement("div");
  petRow.className = "look-pets";
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = webT(lang, "look.search");
  search.setAttribute("aria-label", webT(lang, "look.search"));
  const list = document.createElement("div");
  const renderPets = () => {
    list.replaceChildren(...filterPets(state?.pets ?? [], search.value).map((candidate) => {
      const label = document.createElement("label");
      label.dataset.petOption = "";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "host-pet";
      input.value = candidate.id;
      input.checked = candidate.id === (state?.activePet ?? pet?.id);
      input.addEventListener("change", async () => {
        try {
          await save(state?.appearance ?? DEFAULT_APPEARANCE, candidate.id);
          await load();
        } catch {
          storageNotice = webT(lang, "common.error");
          render();
        }
      });
      const name = document.createElement("span");
      name.textContent = candidate.name;
      label.append(input, name);
      return label;
    }));
  };
  search.addEventListener("input", renderPets);
  renderPets();
  petRow.append(search, list);

  root.append(preview, summary, actions, petRow);
  if (storageNotice) {
    const note = document.createElement("p");
    note.className = "error";
    note.textContent = storageNotice;
    root.append(note);
  }
  document.documentElement.dataset.setupReady = "true";
}

void load();
```

Remove the Task 3 read-only summary code. The setup app uses `filterPets`, `normalizeAppearance`, `DEFAULT_APPEARANCE`, and the Studio; the setup page's no-JS fallback remains in the shell.

- [ ] **Step 4: Add the setup Look styles**

Add to `web/src/setup/setup.css`:

```css
.look-preview { display: grid; gap: 12px; margin-bottom: 16px; }
.look-frame { width: min(100%, 260px); aspect-ratio: 9 / 19.5; margin-inline: auto; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--surface); }
.look-frame[data-frame="wide"] { width: min(100%, 360px); aspect-ratio: 1 / 1; }
.look-frame [data-stage] { height: 100%; }
.look-frame [data-time] { font-size: calc(clamp(28px, 5vw, 64px) * var(--clock-scale, 1)); }
.look-frame [data-pet] { width: calc(min(30vw, 96px) * var(--pet-scale, 1)); }
.look-frames { display: flex; gap: 8px; justify-content: center; }
.look-summary { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0 0 16px; }
.look-summary dt { color: var(--muted); font-size: 12px; }
.look-summary dd { margin: 0; font-size: 13px; text-align: right; }
.look-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.look-pets { display: grid; gap: 8px; }
.look-pets input[type="search"] { width: 100%; min-height: 44px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--ink); }
[data-pet-option] { display: flex; gap: 8px; align-items: center; min-height: 40px; padding: 4px 0; }
```

The setup page's CSS imports the tokens; the look frame uses the stage CSS; the setup app's bundle includes it through the imports.

- [ ] **Step 5: Update the setup copy and preview tests**

Add the setup Look labels to `src/i18n.ts` as needed: `lookHeading`, `lookEnableJavaScript`, `lookClock`, `lookPet`, `lookLayout`, `lookOpenStudio`, `openPhoneView`, `copyDiagnostics`, `copied`, `copyCommand`. The app's labels come from `web/src/i18n.ts`; the no-JS labels come from `src/i18n.ts`. Keep the same meaning in all languages.

Merge `setupCopy` into the existing `isLang` import at the top of `web/src/setup/main.ts`; do not add a second import statement. Wire the shell's copy buttons in the setup app. Copy only the target element's displayed text; never build a token string in JavaScript:

```ts
import { isLang, setupCopy } from "../../../src/i18n.js";

document.querySelectorAll<HTMLButtonElement>("[data-copy-target]").forEach((button) => {
  button.addEventListener("click", async () => {
    const target = document.getElementById(button.dataset.copyTarget ?? "");
    const text = target?.textContent?.trim() ?? "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = setupCopy[lang].copied;
    } catch {
      // The URL/command remains selectable; do not claim a copy that did not happen.
    }
  });
});
```

The server shell adds `id` targets for each displayed URL, the commands, and the diagnostics block, with a copy button next to each. The diagnostics block must not include `token`, `?token=`, the QR SVG, prompt content, or agent output. The no-JS fallback does not fake copy success; its text is selectable.

Update `tests/setupPage.test.ts` to assert:

- The shell still contains the disabled Open Studio and the no-JS note.
- The shell's Look fallback no longer has the app's loaded summary; the app replaces it at runtime.
- The System card still contains loopback scope and the service status.
- No Mac-only wording.

The Task 3 no-JS test remains valid; the setup app is not executed when JavaScript is disabled.

- [ ] **Step 6: Run the focused E2E and full tests**

Run: `npm run build && npx playwright test e2e/setup.spec.ts`
Expected: PASS. The setup Studio test must see the host appearance persisted through reload; the pet test must see the host active pet change; the reset test must first set a non-default value.

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/setup/main.ts web/src/setup/setup.css src/i18n.ts tests/setupPage.test.ts e2e/setup.spec.ts
git commit -m "feat: add setup look editor and host pet picker"
```

---

### Task 6: Phone bottom sheet, host appearance, local overrides, and local pet

**Files:**
- Modify: `web/index.html`
- Modify: `web/src/main.ts`
- Modify: `web/src/style.css`
- Create: `web/src/look/store.ts`
- Modify: `web/src/i18n.ts`
- Modify: `e2e/phone.spec.ts`
- Modify: `e2e/prepare.mjs`
- Test: `tests/webI18n.test.ts`
- Test: `e2e/phone.spec.ts`

**Interfaces:**
- Consumes: `Snapshot` now includes `appearance: Appearance` and `host: HostInfo`; `applyStage`; `formatClock`; `resolveTheme`/`resolveMotion`; `watchSystemAppearance`; `PetRenderer`; `filterPets`.
- Produces: `LOOK_STORAGE_KEY = "pocketpet.look"`; `readLocalLook`, `writeLocalLook`, `clearLocalLook`, `canUseLocalStorage`.
- Produces: bottom sheet tabs `live`, `look`, `about`; collapsed tab bar; handle; panel visibility; Escape/collapse.
- Produces: host appearance application; `Follow host defaults` on by default; local pet override; `pocketpet.look` sparse overrides; storage fallback notice.
- Produces: phone i18n keys `sheet.*`, `live.*`, `about.*`, plus the Task 4 `look.*`/`common.*`; all three languages.
- Produces: old `#gear`/drawer selectors removed; tests use the sheet tabs.

- [ ] **Step 1: Write the failing store and i18n tests**

Create `tests/lookStore.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCAL_LOOK, normalizeLocalLook } from "../src/appearance.js";
import { LOOK_STORAGE_KEY, clearLocalLook, readLocalLook, writeLocalLook } from "../web/src/look/store.js";

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => { values.delete(key); },
    setItem: (key: string, value: string) => { values.set(key, value); },
  } as Storage;
}

it("reads defaults when the key is absent or malformed", () => {
  expect(readLocalLook(fakeStorage())).toEqual(DEFAULT_LOCAL_LOOK);
  expect(readLocalLook(fakeStorage({ [LOOK_STORAGE_KEY]: "{bad" }))).toEqual(DEFAULT_LOCAL_LOOK);
});

it("round-trips a local look and clears it", () => {
  const storage = fakeStorage();
  const value = normalizeLocalLook({ followHost: false, overrides: { clock: { scale: 130 } }, petId: "local:testpet2" });
  expect(writeLocalLook(value, storage)).toBe(true);
  expect(readLocalLook(storage)).toEqual(value);
  expect(clearLocalLook(storage)).toBe(true);
  expect(readLocalLook(storage)).toEqual(DEFAULT_LOCAL_LOOK);
});

it("returns false when storage throws", () => {
  const storage = fakeStorage();
  storage.setItem = () => { throw new DOMException("denied", "SecurityError"); };
  expect(writeLocalLook(DEFAULT_LOCAL_LOOK, storage)).toBe(false);
});
```

The test environment is Node; the fake `Storage` casts are allowed in tests only. `readLocalLook(storage)` and `writeLocalLook(value, storage)` must accept an optional `Storage` argument defaulting to `localStorage`; the app uses the default.

Add to `tests/webI18n.test.ts` assertions for the new phone keys and the removal of Mac-only copy:

```ts
it("has the bottom-sheet and About keys in every language", () => {
  for (const key of ["sheet.live", "sheet.look", "sheet.about", "live.editLook", "about.language", "about.computer"] as const) {
    expect(t("en", key)).toBeTruthy();
    expect(t("zh-Hant", key)).toBeTruthy();
    expect(t("zh-Hans", key)).toBeTruthy();
  }
});

it("does not mention a Mac-only setup page", () => {
  for (const lang of LANGS) {
    expect(t(lang, "trouble.setupTitle")).not.toContain("Mac");
    expect(t(lang, "trouble.setupTitle")).not.toContain("Mac-only");
    expect(t(lang, "trouble.setupTitle")).not.toContain("只限 Mac");
  }
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npx vitest run tests/lookStore.test.ts tests/webI18n.test.ts`
Expected: FAIL because `web/src/look/store.ts` and the new keys do not exist.

- [ ] **Step 3: Implement the local look store**

Create `web/src/look/store.ts`:

```ts
import { normalizeLocalLook, type LocalLook } from "../../../src/appearance.js";

export const LOOK_STORAGE_KEY = "pocketpet.look";

export function readLocalLook(storage: Storage = localStorage): LocalLook {
  try {
    const raw = storage.getItem(LOOK_STORAGE_KEY);
    return normalizeLocalLook(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeLocalLook(null);
  }
}

export function writeLocalLook(value: LocalLook, storage: Storage = localStorage): boolean {
  try {
    storage.setItem(LOOK_STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function clearLocalLook(storage: Storage = localStorage): boolean {
  try {
    storage.removeItem(LOOK_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function canUseLocalStorage(storage: Storage = localStorage): boolean {
  try {
    const key = "__pocketpet_test__";
    storage.setItem(key, "1");
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Replace the phone shell markup**

Replace `web/index.html` with the following structure. Keep the token bootstrap script path and the `viewport-fit=cover` meta:

```html
<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>PocketPet</title>
  </head>
  <body>
    <div id="app">
      <header id="top">
        <div id="brand">PocketPet</div>
        <div id="conn" data-state="connecting">Connecting</div>
      </header>
      <main id="main">
        <section id="stage" data-stage>
          <section id="clock" data-clock data-element="clock" aria-label="Clock">
            <div id="time" data-time>--:--</div>
            <div id="date" data-date></div>
          </section>
          <canvas id="pet" data-pet width="192" height="208" aria-label="PocketPet pet"></canvas>
        </section>
        <aside id="sessions"></aside>
      </main>
      <footer id="chips"></footer>
      <aside id="sheet" data-open="false">
        <button id="sheet-handle" type="button" aria-label="Open panel" aria-expanded="false"></button>
        <div id="sheet-tabs" role="tablist">
          <button type="button" role="tab" data-tab="live" aria-selected="true">Live</button>
          <button type="button" role="tab" data-tab="look" aria-selected="false">Look</button>
          <button type="button" role="tab" data-tab="about" aria-selected="false">About</button>
        </div>
        <div id="sheet-body">
          <section id="panel-live" role="tabpanel" data-panel="live">
            <p id="live-connection"></p>
            <button id="open-look" type="button"></button>
            <div id="install-hint" hidden>
              <p id="install-hint-text"></p>
              <button id="install-hint-dismiss" type="button"></button>
            </div>
          </section>
          <section id="panel-look" role="tabpanel" data-panel="look" hidden>
            <label id="follow-host-row"><input id="follow-host" type="checkbox"> <span id="follow-host-label"></span></label>
            <p id="look-source" class="muted"></p>
            <dl id="look-summary"></dl>
            <div class="look-actions">
              <button id="open-studio" type="button" disabled></button>
              <button id="reset-look" type="button"></button>
            </div>
            <input id="pet-search" type="search" autocomplete="off" />
            <div id="pet-list"></div>
            <p id="look-storage" class="muted" hidden></p>
          </section>
          <section id="panel-about" role="tabpanel" data-panel="about" hidden>
            <div id="lang-row">
              <label id="lang-label" for="lang-select"></label>
              <select id="lang-select">
                <option value="en" lang="en">English</option>
                <option value="zh-Hant" lang="zh-Hant">繁體中文</option>
                <option value="zh-Hans" lang="zh-Hans">简体中文</option>
              </select>
            </div>
            <p id="wake-info"></p>
            <dl id="debug-list">
              <div class="debug-row"><dt id="debug-computer-label"></dt><dd id="debug-host">—</dd></div>
              <div class="debug-row"><dt id="debug-version-label"></dt><dd id="debug-version">—</dd></div>
              <div class="debug-row"><dt id="debug-connection-label"></dt><dd id="debug-conn">—</dd></div>
              <div class="debug-row"><dt id="debug-secure-label"></dt><dd id="debug-secure">—</dd></div>
              <div class="debug-row"><dt id="debug-wake-label"></dt><dd id="debug-wake">—</dd></div>
              <div class="debug-row"><dt id="debug-pet-label"></dt><dd id="debug-pet">—</dd></div>
              <div class="debug-row"><dt id="debug-language-label"></dt><dd id="debug-lang">—</dd></div>
            </dl>
            <details id="trouble" class="panel"><summary></summary></details>
          </section>
        </div>
      </aside>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

The `#open-studio` button stays disabled in this task; Task 7 wires it. Keep the four existing troubleshooting items inside `#trouble`; replace their generic Mac wording with computer wording and translate the summary/items in `applyLanguage`. The About panel must not become an empty details element. The no-JS fallback for the phone is not a goal; the phone requires JavaScript.

- [ ] **Step 5: Replace the phone styles**

Replace `web/src/style.css` with the token imports and the phone layout. Use the spec tokens; import `tokens.css` and `look/stage.css` at the top. Required selectors and behavior:

```css
@import "./tokens.css";
@import "./look/stage.css";

/* Body, header, stage, chips, sessions, sheet, tabs, panels, about rows,
   install hint, debug rows, focus and reduced-motion rules. */
```

Use these exact structural rules:

```css
html, body { height: 100%; margin: 0; }
body { background: var(--bg); color: var(--ink); font-family: var(--font-sans); overflow: hidden; }
#app { height: 100dvh; display: flex; flex-direction: column; padding: env(safe-area-inset-top) 18px calc(64px + env(safe-area-inset-bottom)); }
#top { min-height: 48px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
#brand { color: var(--muted); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
#conn { border: 1px solid var(--line); border-radius: 4px; padding: 4px 8px; color: var(--muted); font-size: 12px; }
#conn[data-state="open"] { color: var(--success); }
#conn[data-state="closed"] { color: var(--danger); }
#main { flex: 1; min-height: 0; display: flex; flex-direction: column; }
#stage { flex: 1; min-height: 0; }
#chips { display: flex; flex-wrap: wrap; gap: 6px; min-height: 32px; padding: 6px 0; }
.chip { border: 1px solid var(--line); border-radius: 4px; padding: 4px 8px; color: var(--muted); font-size: 12px; }
.chip.waiting { color: var(--warning); border-color: var(--warning); }
#sessions { display: none; }
#sheet { position: fixed; inset: auto 0 0; z-index: 10; max-height: 72dvh; display: flex; flex-direction: column; background: var(--surface); border-top: 1px solid var(--line); border-radius: 12px 12px 0 0; padding: 0 16px calc(12px + env(safe-area-inset-bottom)); }
#sheet[data-open="false"] #sheet-body { display: none; }
#sheet-handle { width: 36px; height: 4px; margin: 8px auto; border: 0; border-radius: 4px; background: var(--muted); opacity: .5; }
#sheet-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); }
#sheet-tabs button { min-height: 44px; flex: 1; background: transparent; border: 0; border-bottom: 2px solid transparent; color: var(--muted); font: inherit; }
#sheet-tabs button[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--ink); }
#sheet-body { overflow: auto; max-width: 640px; width: 100%; margin: 0 auto; }
#sheet-body [role="tabpanel"] { padding: 12px 0; }
#pet-list { display: grid; gap: 4px; max-height: 30dvh; overflow: auto; }
.pet-option { display: flex; gap: 8px; align-items: center; min-height: 40px; }
#install-hint, .panel { border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px; margin-top: 10px; background: var(--bg); }
#install-hint[hidden] { display: none; }
.debug-row { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; padding: 4px 0; }
.debug-row dt { color: var(--muted); }
.debug-row dd { margin: 0; text-align: right; word-break: break-all; }
html[data-sessions-density="compact"] .card { padding: 6px 8px; }
html[data-sessions-density="compact"] .chip { padding: 2px 6px; }
@media (min-aspect-ratio: 1/1) and (min-width: 600px) {
  body[data-layout="wide"] #main { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; }
  body[data-layout="wide"] #sessions { display: flex; flex-direction: column; gap: 8px; overflow: auto; padding: 8px 0; }
  body[data-layout="wide"] #stage [data-time] { font-size: calc(clamp(64px, 9vw, 140px) * var(--clock-scale, 1)); }
  body[data-layout="wide"] #stage [data-pet] { width: calc(min(36vw, 300px) * var(--pet-scale, 1)); }
  body[data-layout="wide"] #sheet { left: 50%; transform: translateX(-50%); width: min(640px, 100%); border: 1px solid var(--line); border-bottom: 0; }
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; }
}
```

The token file defines `--font-sans`; if it is named differently, use the spec's system stack. The `#stage [data-time]` free-mode font sizing is in `look/stage.css`; the wide override is above. The sheet is a control surface; it does not duplicate the scene.

- [ ] **Step 6: Rewrite the phone state and sheet logic**

Modify `web/src/main.ts`. Keep the existing helpers that are still valid: `stripTokenFromAddressBar`, `installHintText`, `installHintDismissed`, `rememberInstallHintDismissed`, `phaseLabel`, `AGENT_LABEL`, `minutesLabel`, `isQuiet`, `keepAwake`, `connectState`, `langName`, `isLang`, `normalizeLangTag`, `localeFor`. Replace the drawer/gear code and the global `selectPet` fetch.

Add:

```ts
import { DEFAULT_APPEARANCE, normalizeAppearance, resolveLook, type Appearance } from "../../src/appearance.js";
import { bindStage, applyStage, formatClock, resolveMotion, watchSystemAppearance } from "./look/stage.js";
import { canUseLocalStorage, readLocalLook, writeLocalLook } from "./look/store.js";

interface HostInfo { os: string; osVersion: string; bridgeVersion: string; }
interface Snapshot {
  now: number;
  pet: string;
  sessions: Session[];
  activePet: string | null;
  sleepAfterMinutes: number;
  quietHours: { start: string; end: string } | null;
  appearance: Appearance;
  host: HostInfo;
}
```

State and functions:

```ts
const stage = bindStage(document);
if (!stage) throw new Error("stage is missing");
const sheet = byId<HTMLElement>("sheet");
const sheetHandle = byId<HTMLButtonElement>("sheet-handle");
const tabs = [...document.querySelectorAll<HTMLButtonElement>("#sheet-tabs [data-tab]")];
const panels = [...document.querySelectorAll<HTMLElement>("[data-panel]")];
const followHost = byId<HTMLInputElement>("follow-host");
const openStudioButton = byId<HTMLButtonElement>("open-studio");
const resetLookButton = byId<HTMLButtonElement>("reset-look");
const lookSummary = byId<HTMLElement>("look-summary");
const lookSource = byId<HTMLElement>("look-source");
const lookStorageNotice = byId<HTMLElement>("look-storage");
const openLookButton = byId<HTMLButtonElement>("open-look");
const liveConnection = byId<HTMLElement>("live-connection");
const debugVersion = byId("debug-version");
const debugComputerLabel = byId("debug-computer-label");
const debugVersionLabel = byId("debug-version-label");
const debugConnectionLabel = byId("debug-connection-label");
const debugSecureLabel = byId("debug-secure-label");
const debugWakeLabel = byId("debug-wake-label");
const debugPetLabel = byId("debug-pet-label");
const debugLanguageLabel = byId("debug-language-label");
const debugComputerValue = byId("debug-host");

let hostAppearance: Appearance = DEFAULT_APPEARANCE;
let hostPet: string | null = null;
let hostInfo: HostInfo | null = null;
let localLook = readLocalLook();
let localWriteFailed = !canUseLocalStorage();

function currentAppearance(): Appearance {
  return resolveLook(hostAppearance, localLook).appearance;
}

function currentPetId(): string | null {
  if (localLook.followHost) return hostPet;
  return localLook.petId ?? hostPet;
}

function saveLocal(next: typeof localLook): void {
  localLook = next;
  localWriteFailed = !writeLocalLook(next);
  applyLook();
}

function showTab(name: "live" | "look" | "about", open = true): void {
  sheet.dataset.open = open ? "true" : "false";
  sheetHandle.setAttribute("aria-expanded", String(open));
  sheetHandle.setAttribute("aria-label", t(lang, open ? "sheet.close" : "sheet.open"));
  for (const tab of tabs) tab.setAttribute("aria-selected", String(tab.dataset.tab === name));
  for (const panel of panels) panel.hidden = panel.dataset.panel !== name;
}

function toggleSheet(): void {
  const open = sheet.dataset.open !== "true";
  showTab("live", open);
}
```

Update `renderClock`, `renderSessions`, `renderLook`, `applyPet`, `applySnapshot`, `renderDebug`, `applyLanguage`, `openStudio` (Task 7), and `boot`:

```ts
function renderClock(appearance: Appearance): void {
  const value = formatClock(lang, appearance.clock.format, new Date());
  stage.time.textContent = value.time;
  stage.date.textContent = value.date;
}

function renderSessions(appearance: Appearance): void {
  if (!current) return;
  const sessions = current.sessions.slice(0, appearance.sessions.maxVisible);
  chipsEl.replaceChildren(...sessions.map((session) => {
    const chip = document.createElement("span");
    chip.className = `chip${session.phase === "waiting" ? " waiting" : ""}`;
    chip.textContent = `${AGENT_LABEL[session.agent] ?? session.agent} · ${phaseLabel(session.phase)}`;
    return chip;
  }));
  sessionsEl.replaceChildren(...sessions.map((session) => {
    const card = document.createElement("article");
    card.className = "card";
    const title = document.createElement("h2");
    title.textContent = appearance.sessions.showProject
      ? `${AGENT_LABEL[session.agent] ?? session.agent} — ${session.project}`
      : (AGENT_LABEL[session.agent] ?? session.agent);
    const meta = document.createElement("p");
    const minutes = Math.max(0, Math.round((Date.now() - session.startedAt) / 60_000));
    meta.textContent = appearance.sessions.showElapsed ? `${phaseLabel(session.phase)} · ${minutesLabel(lang, minutes)}` : phaseLabel(session.phase);
    card.append(title, meta);
    if (appearance.sessions.showTool && session.tool) {
      const tool = document.createElement("p");
      tool.className = "tool";
      tool.textContent = `${t(lang, "tool")}${session.tool}`;
      card.append(tool);
    }
    return card;
  }));
}

function renderLook(appearance: Appearance): void {
  followHost.checked = localLook.followHost;
  byId("follow-host-label").textContent = t(lang, "look.followHost");
  lookSource.textContent = localLook.followHost ? t(lang, "look.hostDefault") : t(lang, "look.custom");
  const selectedPet = pets.find((candidate) => candidate.id === currentPetId());
  const summary = [
    [t(lang, "look.clock"), `${appearance.clock.scale}%`],
    [t(lang, "look.petSize"), `${appearance.pet.scale}%`],
    [t(lang, "look.layout"), `${appearance.layout.mode} · ${appearance.layout.gap}`],
    [t(lang, "look.pet"), selectedPet?.name ?? currentPetId() ?? t(lang, "look.noPets")],
  ];
  lookSummary.replaceChildren(...summary.flatMap(([term, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    return [dt, dd];
  }));
  openStudioButton.textContent = t(lang, "look.openStudio");
  resetLookButton.textContent = t(lang, "look.reset");
  openLookButton.textContent = t(lang, "live.editLook");
  lookStorageNotice.hidden = !localWriteFailed;
  lookStorageNotice.textContent = t(lang, "look.storageDenied");
  renderPetList();
}
```

`renderPetList` keeps the existing radio list but checks `pet.id === currentPetId()` and calls `selectPet(pet.id)`. `selectPet` must not fetch `/api/active-pet`:

```ts
function selectPet(id: string): void {
  saveLocal({ v: 1, followHost: false, overrides: localLook.overrides, petId: id });
}

function setFollowHost(value: boolean): void {
  saveLocal(value
    ? { v: 1, followHost: true, overrides: {}, petId: null }
    : { v: 1, followHost: false, overrides: localLook.overrides, petId: localLook.petId });
}
```

`applyLook`:

```ts
function applyLook(): void {
  const appearance = currentAppearance();
  applyStage(stage, appearance);
  renderer.setReducedMotion(resolveMotion(appearance.motion) === "reduced");
  renderClock(appearance);
  renderSessions(appearance);
  applyPet(currentPetId());
  renderLook(appearance);
  renderDebug();
}
```

`applySnapshot`:

```ts
function applySnapshot(snapshot: Snapshot): void {
  current = snapshot;
  hostAppearance = normalizeAppearance(snapshot.appearance);
  hostPet = snapshot.activePet;
  hostInfo = snapshot.host;
  renderer.setState(snapshot.pet as PetState);
  applyLook();
  liveConnection.textContent = `${t(lang, "conn.connected")} · ${snapshot.host.os}`;
}
```

`applyPet` keeps the existing async load/identity guard, but takes the resolved pet; the current `applyPet` already handles missing pets and fallback. Replace every `stage.dataset` access in the old function with `stage.stage.dataset` (the new `stage` is `StageRefs`, not an element). The function sets the resolved pet id synchronously before awaiting the sprite, so the following `renderLook` sees the current selection. If `loadPets` was empty and resolves later, refresh the Look summary so the pet display name replaces the id. Remove the server `activeFromServer` logic. The pet list calls `selectPet`; the host changes only arrive in the snapshot.

`boot` changes:

```ts
const stageLayout = () => {
  const wide = window.matchMedia("(min-aspect-ratio: 1/1) and (min-width: 600px)").matches;
  document.body.dataset.layout = wide ? "wide" : "folded";
};
stageLayout();
window.addEventListener("resize", stageLayout);
watchSystemAppearance(() => applyLook());
followHost.addEventListener("change", () => setFollowHost(followHost.checked));
resetLookButton.addEventListener("click", () => saveLocal({ v: 1, followHost: true, overrides: {}, petId: null }));
tabs.forEach((tab) => tab.addEventListener("click", () => showTab(tab.dataset.tab as "live" | "look" | "about")));
sheetHandle.addEventListener("click", toggleSheet);
openLookButton.addEventListener("click", () => showTab("look"));
document.addEventListener("keydown", (event) => { if (event.key === "Escape") showTab("live", false); });
showTab("live", false);
```

The `applyLanguage` function must update the tab labels, Live labels, About labels, the Look panel, the debug labels, the install hint, and the `html lang`. Use the new keys:

`sheet.live`, `sheet.look`, `sheet.about`, `sheet.open`, `sheet.close`, `live.editLook`, `about.language`, `about.computer`, `about.bridgeVersion`, `about.connection`, `debug.secure`, `debug.wake`, `debug.pet`, `debug.language`, the existing `wake.*`, `install.*`, `trouble.*`, `conn.*`, `phase.*`. Replace the generic Mac references in `trouble.reachTitle`, `trouble.reachBody`, `trouble.setupTitle`, and `trouble.setupBody` with computer/host wording; the actual host OS label may say macOS.

`renderDebug` uses:

```ts
debugComputerValue.textContent = hostInfo ? `${hostInfo.os} ${hostInfo.osVersion}` : "—";
debugVersion.textContent = hostInfo?.bridgeVersion ?? "—";
debugConn.textContent = t(lang, CONN_KEYS[connStatus]);
debugSecure.textContent = t(lang, window.isSecureContext ? "debug.yes" : "debug.no");
debugWake.textContent = wakeLabel(wakeStatus);
debugPet.textContent = petId ?? stage.stage.dataset.petId ?? t(lang, "debug.none");
debugLang.textContent = langName(lang);
```

Remove the old `#debug-host` value of `location.host`; the Computer row now shows the host OS. If you want the connection host, add a separate `debug.connectionHost` key later; do not put the host OS in a `Host` row that means the URL.

- [ ] **Step 7: Update the phone E2E selectors and tests**

In `e2e/phone.spec.ts`, add helpers:

```ts
async function openTab(page: Page, tab: "live" | "look" | "about"): Promise<void> {
  await page.locator(`#sheet-tabs [data-tab="${tab}"]`).click();
}
```

Update the existing tests:

- `#time` → `#stage [data-time]`.
- `#pet` / `#stage canvas` → `#stage [data-pet]` (the Canvas is still `#pet`; the `data-pet` selector is stable).
- `#gear` → `openTab(page, "look")` for pet tests, `openTab(page, "about")` for language/wake tests, and the Live install hint test uses `openTab(page, "live")`.
- `#pet-list`, `#pet-search` remain in Look.
- `#lang-select`, `#wake-info`, `#debug-*` remain in About.
- The pet switch test must now assert the **local** selection and that the host pet did not change. Use the setup look API to set a known host pet at the start:

```ts
await page.request.put("/api/setup/look", {
  headers: { origin: ORIGIN, "x-pocketpet-setup": "1", "content-type": "application/json" },
  data: { activePet: "local:testpet" },
});
```

Then choose `local:testpet2`, assert the stage and the local storage `pocketpet.look`; fetch `/api/setup/look` and assert `activePet` is still `local:testpet`.

- Add a host appearance follow test:

```ts
test("applies host appearance and can reset this phone", async ({ page }) => {
  await page.request.put("/api/setup/look", {
    headers: { origin: ORIGIN, "x-pocketpet-setup": "1", "content-type": "application/json" },
    data: { appearance: { ...DEFAULT_APPEARANCE, clock: { ...DEFAULT_APPEARANCE.clock, scale: 140 } } },
  });
  await page.goto(`/?token=${TOKEN}`);
  const scale = await page.locator("#stage").evaluate((element) => getComputedStyle(element).getPropertyValue("--clock-scale").trim());
  expect(scale).toBe("1.4");
  await openTab(page, "look");
  await expect(page.locator("#follow-host")).toBeChecked();
  await page.locator("#follow-host").uncheck();
  await page.locator("#reset-look").click();
  await expect(page.locator("#follow-host")).toBeChecked();
});
```

Import `DEFAULT_APPEARANCE` from `../src/appearance.js` in the E2E. If Playwright cannot resolve the NodeNext `.js` specifier, import from `../src/appearance` without the extension, or inline `DEFAULT_APPEARANCE` in the test. The test must not use a fabricated appearance that is not representable by the API.

- The `e2e/prepare.mjs` config can include a default `appearance` so the test starts from a known host state. Add the v1 default object or rely on `loadConfig`; do not put a token/config in a different place. The E2E always uses `.tmp-e2e`.

- [ ] **Step 8: Run the focused and full checks**

Run: `npx vitest run tests/lookStore.test.ts tests/webI18n.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run build && npx playwright test e2e/phone.spec.ts`
Expected: PASS with the new sheet selectors and local override tests. The real host appearance is set through the setup API; the phone follows; the local reset restores follow-host.

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add web/index.html web/src/main.ts web/src/style.css web/src/look/store.ts web/src/i18n.ts tests/lookStore.test.ts tests/webI18n.test.ts e2e/phone.spec.ts e2e/prepare.mjs
git commit -m "feat: add phone bottom sheet and local look overrides"
```

---

### Task 7: Phone Studio integration and host/phone scope E2E

**Files:**
- Modify: `web/src/main.ts`
- Modify: `e2e/phone.spec.ts`
- Modify: `e2e/setup.spec.ts` (host/phone scope)
- Test: `e2e/phone.spec.ts`
- Test: `e2e/setup.spec.ts`

**Interfaces:**
- Consumes: `openStudio`, `diffAppearance`, `hostAppearance`, `localLook`, `writeLocalLook`, `applyLook`.
- Produces: enabled `#open-studio`; Studio scope `This phone`; save writes a sparse local override and turns Follow host off; no host write.
- Produces: setup Studio scope `Host defaults`; save writes host defaults and broadcasts; a follow-host phone updates; a custom phone keeps its override.
- Produces: E2E for both scope paths, persistence, and non-interference.

- [ ] **Step 1: Write the failing phone Studio E2E**

Add to `e2e/phone.spec.ts`:

```ts
test("saves a phone-only Studio override without changing host defaults", async ({ page }) => {
  await page.request.put("/api/setup/look", {
    headers: { origin: ORIGIN, "x-pocketpet-setup": "1", "content-type": "application/json" },
    data: { appearance: DEFAULT_APPEARANCE, activePet: "local:testpet" },
  });
  await page.goto(`/?token=${TOKEN}`);
  await openTab(page, "look");
  await page.locator("#open-studio").click();
  const studio = page.locator("#studio");
  await expect(studio).toBeVisible();
  await studio.locator('[data-field="clock.scale"]').fill("130");
  await studio.locator('[data-field="clock.scale"]').dispatchEvent("input");
  await studio.locator('[data-act="save"]').click();
  await expect(studio).toBeHidden();
  const scale = await page.locator("#stage").evaluate((element) => getComputedStyle(element).getPropertyValue("--clock-scale").trim());
  expect(scale).toBe("1.3");
  const stored = await page.evaluate(() => localStorage.getItem("pocketpet.look"));
  expect(stored).toContain("130");
  const host = await (await page.request.get("/api/setup/look")).json();
  expect(host.appearance.clock.scale).toBe(100);
  await page.reload();
  await expect(page.locator("#stage")).toHaveAttribute("data-layout-mode", /stack|free/);
  const scaleAfterReload = await page.locator("#stage").evaluate((element) => getComputedStyle(element).getPropertyValue("--clock-scale").trim());
  expect(scaleAfterReload).toBe("1.3");
});
```

Add a host-follow test:

```ts
test("a follow-host phone applies a host Studio change", async ({ page }) => {
  await page.request.put("/api/setup/look", {
    headers: { origin: ORIGIN, "x-pocketpet-setup": "1", "content-type": "application/json" },
    data: { appearance: DEFAULT_APPEARANCE },
  });
  await page.goto(`/?token=${TOKEN}`);
  await openTab(page, "look");
  await expect(page.locator("#follow-host")).toBeChecked();
  await page.request.put("/api/setup/look", {
    headers: { origin: ORIGIN, "x-pocketpet-setup": "1", "content-type": "application/json" },
    data: { appearance: { ...DEFAULT_APPEARANCE, pet: { ...DEFAULT_APPEARANCE.pet, scale: 150 } } },
  });
  await expect.poll(async () => page.locator("#stage").evaluate((element) => getComputedStyle(element).getPropertyValue("--pet-scale").trim())).toBe("1.5");
});
```

The websocket snapshot broadcast from the setup save must update the phone; the `applyLook` path uses the new host appearance. If the setup save happens before the phone's WS is open, the test waits for the connected state first.

- [ ] **Step 2: Run the focused E2E to verify it fails**

Run: `npm run build && npx playwright test e2e/phone.spec.ts --grep "Studio|follow-host"`
Expected: FAIL because `#open-studio` is disabled and the phone has no Studio wiring.

- [ ] **Step 3: Wire the phone Studio**

In `web/src/main.ts`, import:

```ts
import { diffAppearance } from "../../src/appearance.js";
import { openStudio } from "./look/studio.js";
```

Enable the button in the markup or in `renderLook`:

```ts
openStudioButton.disabled = false;
```

Add the click handler:

```ts
openStudioButton.addEventListener("click", () => {
  openStudio({
    appearance: currentAppearance(),
    pet: pets.find((candidate) => candidate.id === currentPetId())
      ? { id: currentPetId()!, name: pets.find((candidate) => candidate.id === currentPetId())!.name, spriteUrl: pets.find((candidate) => candidate.id === currentPetId())!.spriteUrl }
      : null,
    lang,
    scope: "phone",
    onSave: async (next) => {
      const overrides = diffAppearance(hostAppearance, next);
      const nextLocal = { v: 1 as const, followHost: false, overrides, petId: localLook.petId };
      const stored = writeLocalLook(nextLocal);
      if (!stored) localWriteFailed = true;
      localLook = nextLocal;
      applyLook();
    },
  });
});
```

Do not call the setup API from the phone Studio. The phone Studio is local-only. The `currentPetId()` calls in the object literal are repeated; extract a `const pet = pets.find(...)` and use it.

- [ ] **Step 4: Add setup scope assertions**

In `e2e/setup.spec.ts`, add a scope badge assertion:

```ts
await page.getByRole("button", { name: "Open Studio" }).click();
await expect(page.locator("#studio .studio-scope")).toHaveText(/Host defaults|電腦預設|电脑默认/);
```

In the phone Studio test, assert the scope is `This phone`:

```ts
await expect(studio.locator(".studio-scope")).toHaveText(/This phone|此手機|此手机/);
```

The Studio's scope text comes from the i18n keys; do not hardcode the English only.

- [ ] **Step 5: Verify host/phone non-interference**

Add to `e2e/setup.spec.ts`:

```ts
Add the same `TOKEN` and `ORIGIN` constants used by `e2e/phone.spec.ts` to `e2e/setup.spec.ts`; do not invent a second token.

test("a phone local override does not change host defaults", async ({ browser, page }) => {
  await page.request.put("/api/setup/look", {
    headers: { origin: "http://127.0.0.1:7799", "x-pocketpet-setup": "1", "content-type": "application/json" },
    data: { appearance: DEFAULT_APPEARANCE, activePet: "local:testpet" },
  });
  const phone = await browser.newPage();
  await phone.goto(`/?token=${TOKEN}`);
  await phone.locator("#sheet-tabs [data-tab='look']").click();
  await phone.locator("#open-studio").click();
  await phone.locator("#studio [data-field='clock.scale']").fill("145");
  await phone.locator("#studio [data-field='clock.scale']").dispatchEvent("input");
  await phone.locator("#studio [data-act='save']").click();
  const host = await (await page.request.get("/api/setup/look")).json();
  expect(host.appearance.clock.scale).toBe(100);
  await phone.close();
});
```

The setup test and the phone test share the E2E server. Reset the host appearance at the start of tests that assert defaults, and do not rely on test order.

- [ ] **Step 6: Run the phone and setup E2E**

Run: `npm run build && npx playwright test e2e/setup.spec.ts e2e/phone.spec.ts`
Expected: PASS. The setup Studio and phone Studio save paths are separate; the local override survives reload; the host stays unchanged; a follow-host phone receives the broadcast.

- [ ] **Step 7: Run the full suite**

Run: `npm test && npm run typecheck && npm run build && npm run test:e2e`
Expected: PASS; record the actual unit/E2E counts. Do not claim a target count.

- [ ] **Step 8: Commit**

```bash
git add web/src/main.ts e2e/setup.spec.ts e2e/phone.spec.ts
git commit -m "feat: add phone studio local overrides"
```

---

### Task 8: Documentation, acceptance record, and completeness self-check

**Files:**
- Modify: `README.md`
- Modify: `README.zh-Hans.md`
- Create: `docs/acceptance/uiux-foundation-look.md`
- Modify: `docs/acceptance/m1-manual.md` (short historical note only)
- Test: full suite; no new test code unless a coverage gap is found

**Interfaces:**
- Produces: user-facing docs that describe the setup dashboard, bottom sheet, host default/local override, Direct Canvas Studio, and the actual OS support.
- Produces: manual acceptance gates with evidence slots, explicitly marking unrun items NOT RUN.
- Produces: a recorded completeness audit covering the spec's slice-1 requirements.

- [ ] **Step 1: Update user-facing docs**

Replace the old README claims that `/setup` is Mac-only, that the phone uses a gear drawer, or that a phone pet selection changes the host pet. Describe:

- `/setup` opens on the computer running the bridge; the phone scans the QR.
- The phone uses Live / Look / About tabs; the Studio is in Look.
- The host default look and pet are set on the setup page; each phone can follow the host or keep a local override; Reset this phone clears it.
- The actual OS support remains macOS for the current bridge/service; Windows/Linux support is a separate spec. Use the actual OS label in the UI; do not promise Windows/Linux service support.
- Replace generic "Mac" references with computer/host wording. Keep macOS only as an actual OS label or support statement.
- The setup page remains loopback-only; the QR is reusable; no token is shared through the app.
- The update and agent sections are unchanged in this slice; no agent setup/update UI is added.

Update `README.md` and `README.zh-Hans.md` consistently. Do not change the adapter support claims: Claude Code is ready; Qoder remains local/unshipped; Codex/OpenCode/Pi remain next.

- [ ] **Step 2: Write the manual acceptance record**

Create `docs/acceptance/uiux-foundation-look.md` with these sections and status fields:

```md
# UIUX Foundation and Look Acceptance

Date: 2026-11-21
Scope: Studio Neutral setup dashboard, phone bottom sheet, host/local appearance, shared Direct Canvas Studio.
Spec: docs/superpowers/specs/2026-11-21-pocketpet-uiux-direction-design.md

## Evidence Rules
- Use a temporary home for automated runs. Never attach a real config or token.
- Redact the pairing token and any QR/URL containing it.
- Mark every item that was not executed as NOT RUN. Do not infer success from a green unit suite.

## Gates
| Item | Producer | Evidence | Status |
|---|---|---|---|
| Setup dashboard on the real computer (Pair/Look/System) | Tester | Screenshot with token/QR redacted | NOT RUN |
| Setup Studio saves host appearance; reload keeps it | Tester + E2E | Screenshot and `/api/setup/look` result | E2E planned |
| Setup pet picker sets the host pet | Tester + E2E | Screenshot and API result | E2E planned |
| Phone follows host appearance after setup save | Tester + E2E | Phone screenshot and API result | E2E planned |
| Phone local Studio override persists and does not change host | Tester + E2E | Local storage, reload, host API | E2E planned |
| Folded and wide postures on the real phone, with the bottom sheet | Tester | Two screenshots | NOT RUN |
| Storage denied: boot continues and host values are used | Tester + E2E | Screenshot and storage exception record | E2E planned |
| Keyboard-only Studio (setup and phone) | Tester | Keyboard sequence and screenshot | NOT RUN |
| No horizontal overflow at folded/wide | Tester | Screenshots | NOT RUN |
| macOS real host | Tester | Screenshot and exact OS label | NOT RUN |
| Windows/Linux host | Tester | Not claimed; separate spec | NOT RUN |
| Real agent event flow | Tester | Not part of this slice | NOT RUN |
| Real update/auto-update | Tester | Not part of this slice | NOT RUN |
```

- [ ] **Step 3: Add the historical note to the M1 acceptance**

Add one short note near the top of `docs/acceptance/m1-manual.md`:

> UI-specific setup copy, the gear drawer, and the phone global pet write were superseded by the approved 2026-11-21 UIUX direction. The loopback, token, Petdex, agent-adapter, and service evidence below remains historical. New UI evidence lives in `docs/acceptance/uiux-foundation-look.md`.

Do not rewrite the M1 historical evidence or mark old NOT RUN items as passed.

- [ ] **Step 4: Run the completeness audit**

Check each row and record the result in the task report:

| Requirement | Producer | Evidence |
|---|---|---|
| Studio Neutral tokens and no shadow/gradient/emoji | `rg` + screenshots | Token file and E2E screenshots |
| Setup Pair/Look/System dashboard | E2E + manual | Setup screenshots |
| Setup no-JS fallback and CSP | Integration test + manual | Server test and no-JS screenshot |
| Setup loopback + Host + CSRF | Integration test | 403 and valid request tests |
| Setup-only pet asset route | Integration test | Sprite response and traversal test |
| Host/version fields in state/WS | Unit + integration | State/WS tests |
| Appearance normalization and sparse diff | Unit | `tests/appearance.test.ts` |
| Host defaults + phone follow/local override | E2E | Setup/phone tests |
| Direct Canvas Studio drag/resize/numeric/undo/reset/preview | E2E + manual | Studio tests |
| Phone bottom sheet and About/Live/Look | E2E + manual | Phone screenshots |
| No real config/install/push | Run log + `git status` | Temp-home evidence; no push |
| i18n EN/繁/简 parity | Unit | Web/server i18n tests |
| Keyboard and reduced motion | E2E + manual | Keyboard test; reduced-motion screenshot |
| Documentation updated | Review | README and acceptance diff |

Because the host appearance and host pet are shared server state, add `workers: 1` to `playwright.config.ts` for this suite, or move every mutating setup/phone E2E into one serial file and restore host defaults after each test. Record the choice. Do not leave parallel E2E files racing on host defaults. If `workers: 1` is chosen, update the plan's File Map and commit `playwright.config.ts` with this task.

Run these commands and record the exact output:

```bash
rg -n "Mac-only|Mac only|只限 Mac|仅限 Mac" src web README.md README.zh-Hans.md || true
rg -n "\bMac\b" src/i18n.ts web/src/i18n.ts web/index.html README.md README.zh-Hans.md || true
rg -n "id=\"gear\"|#gear|drawer\." web e2e || true
rg -n "api/active-pet" web/src || true
rg -n "TODO|TBD|FIXME|console\\.log" src web tests e2e || true
git status --short --branch
```

Expected:
- No UI Mac-only copy or generic Mac-as-host wording in `src/i18n.ts`, `web/src/i18n.ts`, `web/index.html`, or the READMEs. Actual OS labels such as macOS are allowed. The historical specs/acceptance files may still contain the old wording and are intentionally not included in this scan.
- No gear/drawer selectors in `web` or `e2e`.
- No phone `/api/active-pet` write in `web/src`; the server endpoint may remain for fixtures and is audited below.
- No new TODO/TBD/FIXME/console.log. If an existing occurrence is found, record it and confirm it is not introduced by this slice.
- No secrets in the diff; no token in logs or screenshots.

Audit the legacy `/api/active-pet` endpoint: the phone UI no longer calls it. The E2E fixture may still set the host pet through it, or through the setup Look API. Record the actual callers. If no caller remains, remove the endpoint and its tests in this task; if a fixture or non-UI caller remains, keep it and document the caller in the acceptance record. Do not leave an undocumented dead endpoint.

- [ ] **Step 5: Run the final verification**

Run:

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
```

Expected: all commands exit 0. Record the exact unit and E2E counts. Check that the build produced `dist/web/manifest.json` and that `/setup` loads the setup entry and CSS from the manifest. Do not claim the real phone, real Windows/Linux, real agent, or real update gates; they remain NOT RUN.

- [ ] **Step 6: Final review and commit**

Run `git diff --stat` and inspect the diff for secrets, debug logs, and unintended changes. Confirm the changes are limited to this plan's file map plus generated build output excluded by git. Do not push.

```bash
git add README.md README.zh-Hans.md docs/acceptance/uiux-foundation-look.md docs/acceptance/m1-manual.md web/src/main.ts e2e/phone.spec.ts e2e/setup.spec.ts playwright.config.ts
git commit -m "docs: record UIUX foundation and look acceptance"
```

If the legacy endpoint audit required a source change, include the touched source/test files in the commit and re-run the full verification.

---

## Self-Review

### Spec Coverage

| Spec area | Covered by |
|---|---|
| Studio Neutral tokens and OS-neutral copy | Task 3 tokens/shell; Task 6 phone styles |
| Setup Desk Dashboard Pair/Look/System | Tasks 3 and 5 |
| Setup no-JS fallback and CSP | Task 3 |
| Setup-only pet previews | Task 2 |
| Host/version snapshot | Task 2 |
| Appearance schema and defaults | Task 1 |
| Sparse local overrides and follow host | Tasks 1, 6 |
| Direct Canvas Studio interactions | Tasks 4, 5, 7 |
| Folded/wide stage and sessions | Tasks 4, 6 |
| Host default vs phone local scope | Tasks 5, 7 |
| i18n and accessibility | Tasks 4, 6, 8 |
| Security and temp-home tests | Tasks 2, 3, 8 |
| Agent Setup and Update UI | Explicitly out of this slice |

### Placeholder Scan

Before committing the plan, run the writing-plans placeholder scan and fix every finding. The plan must not contain placeholders. The only deliberate future work is the agent/update slices and real-device gates, which are named as out of scope or NOT RUN.

### Type Consistency

The plan uses these names consistently:

- `Appearance`, `AppearanceOverrides`, `LocalLook`, `DEFAULT_APPEARANCE`, `DEFAULT_LOCAL_LOOK`.
- `normalizeAppearance`, `normalizeLocalLook`, `mergeAppearance`, `resolveLook`, `diffAppearance`.
- `HostInfo`, `hostInfo`, `bridgeVersion`.
- `SetupAssets`, `setupAssets`, `SetupPageInput`, `setupPageHtml`, `setupDeniedHtml`, `setupFetch` (setup app-local).
- `StageRefs`, `bindStage`, `applyStage`, `formatClock`, `resolveTheme`, `resolveMotion`, `watchSystemAppearance`.
- `StudioPet`, `StudioOptions`, `StudioHandle`, `openStudio`.
- `LOOK_STORAGE_KEY`, `readLocalLook`, `writeLocalLook`, `clearLocalLook`.
- Data attributes: `data-stage`, `data-clock`, `data-time`, `data-date`, `data-pet`, `data-element`, `data-field`, `data-act`, `data-frame`, `data-snap`, `data-tab`, `data-panel`, `data-pet-option`.
- i18n keys are referenced consistently in Task 4's key table and in the task code.

If a later task renames a type or attribute, update all earlier code blocks and tests in the same commit.

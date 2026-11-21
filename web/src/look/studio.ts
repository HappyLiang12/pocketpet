import {
  DEFAULT_APPEARANCE,
  normalizeAppearance,
  type Appearance,
} from "../../../src/appearance.js";
import { PetRenderer } from "../sprite.js";
import { minutesLabel, t, type Lang, type MessageKey } from "../i18n.js";
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

type Selected = "clock" | "pet";

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, Math.round(value)));

const DRAG_THRESHOLD = 4;
const SNAP_GRID = 8;
const SNAP_ANCHOR = 6;
const SAVE_STATUS_MS = 900;

// Static sample rows for the session strip. These are not read from live state;
// they only preview how density/maxVisible/show fields will look.
const SAMPLES: readonly { name: string; project: string; tool: string; minutes: number }[] = [
  { name: "Claude Code", project: "pocketpet", tool: "Bash", minutes: 2 },
  { name: "Qoder", project: "fold-pet", tool: "Edit", minutes: 1 },
  { name: "Codex", project: "pocketpet", tool: "Read", minutes: 4 },
  { name: "Cursor", project: "notes", tool: "Grep", minutes: 3 },
  { name: "Gemini CLI", project: "web", tool: "Write", minutes: 5 },
  { name: "OpenCode", project: "docs", tool: "Test", minutes: 6 },
];

const appearanceKey = (value: Appearance): string => JSON.stringify(normalizeAppearance(value));

const label = (lang: Lang, key: MessageKey): string => t(lang, key);

export function openStudio(options: StudioOptions): StudioHandle {
  const restore = document.activeElement as HTMLElement | null;
  const pageRoot = document.documentElement;
  const before = {
    theme: pageRoot.dataset.theme,
    motion: pageRoot.dataset.motion,
    density: pageRoot.dataset.sessionsDensity,
  };
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
        <div class="studio-stage" data-stage role="group" aria-label="${label(options.lang, "look.preview")}">
          <div data-clock data-element="clock" tabindex="0" role="button" aria-pressed="true" aria-label="${label(options.lang, "studio.clock")}">
            <div data-time>--:--</div>
            <div data-date></div>
            <span class="studio-handle" data-handle="clock" aria-hidden="true"></span>
          </div>
          <div class="studio-pet" data-element="pet" tabindex="0" role="button" aria-pressed="false" aria-label="${label(options.lang, "studio.pet")}">
            <canvas data-pet width="192" height="208"></canvas>
            <span class="studio-handle" data-handle="pet" aria-hidden="true"></span>
          </div>
          <div class="studio-sessions" aria-hidden="true"></div>
        </div>
      </div>
      <div class="studio-panel">
        <div class="studio-warning" data-warning hidden>
          <span class="studio-warning-text" role="status">${label(options.lang, "studio.overlap")}</span>
          <button type="button" data-act="move-up">${label(options.lang, "studio.moveUp")}</button>
          <button type="button" data-act="reset-position">${label(options.lang, "studio.resetPosition")}</button>
        </div>
        <div class="studio-toolbar">
          <button type="button" data-frame="folded" aria-pressed="true">${label(options.lang, "studio.folded")}</button>
          <button type="button" data-frame="wide" aria-pressed="false">${label(options.lang, "studio.wide")}</button>
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
    <p class="studio-announcer" role="status" aria-live="polite"></p>
    <div class="studio-confirm" data-confirm hidden role="alertdialog" aria-modal="true" aria-labelledby="studio-confirm-text">
      <p id="studio-confirm-text" class="studio-confirm-text">${label(options.lang, "studio.discardTitle")}</p>
      <div class="studio-confirm-actions">
        <button type="button" data-act="keep-editing">${label(options.lang, "studio.keepEditing")}</button>
        <button type="button" class="button-primary" data-act="discard">${label(options.lang, "studio.discard")}</button>
      </div>
    </div>
  `;
  document.body.append(overlay);
  const stage = bindStage(overlay);
  if (!stage) {
    overlay.remove();
    throw new Error("Studio stage is missing");
  }
  const petFrame = overlay.querySelector<HTMLElement>('[data-element="pet"]');
  if (!petFrame) {
    overlay.remove();
    throw new Error("Studio pet is missing");
  }
  document.body.classList.add("studio-open");
  const siblingState = Array.from(document.body.children)
    .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay)
    .map((element) => ({ element, inert: element.inert }));
  siblingState.forEach(({ element }) => {
    element.inert = true;
  });

  const topbar = overlay.querySelector<HTMLElement>(".studio-topbar");
  const bodyEl = overlay.querySelector<HTMLElement>(".studio-body");
  const confirmPanel = overlay.querySelector<HTMLElement>("[data-confirm]");
  const warning = overlay.querySelector<HTMLElement>("[data-warning]");
  const announcer = overlay.querySelector<HTMLElement>(".studio-announcer");
  const renderer = new PetRenderer(stage.pet);
  renderer.start();
  let draft = normalizeAppearance(options.appearance);
  const initialAppearance = structuredClone(draft);
  let selected: Selected = "clock";
  let snap = true;
  const history: Appearance[] = [structuredClone(draft)];
  let historyIndex = 0;
  let closed = false;
  let saved = false;
  let saving = false;
  let fieldSession: { base: Appearance } | null = null;
  let confirmOpen = false;
  let saveTimer: number | null = null;
  let dragCleanup: (() => void) | null = null;

  const snapshot = (): Appearance => structuredClone(draft);
  const isDirty = (): boolean => appearanceKey(draft) !== appearanceKey(initialAppearance);
  const elementName = (value: string | undefined): Selected => (value === "pet" ? "pet" : "clock");
  const elementNode = (element: Selected): HTMLElement => (element === "clock" ? stage.clock : petFrame);
  const announce = (message: string): void => {
    if (announcer) announcer.textContent = message;
  };
  const announceSelection = (): void => {
    const name = label(options.lang, selected === "clock" ? "studio.clock" : "studio.pet");
    announce(label(options.lang, "studio.selected").replace("{name}", name));
  };
  const announcePosition = (): void => {
    const value = draft[selected];
    announce(`${label(options.lang, "studio.x")} ${value.x} · ${label(options.lang, "studio.y")} ${value.y} · ${label(options.lang, "studio.scale")} ${value.scale}`);
  };

  const renderButtons = (): void => {
    const undoButton = overlay.querySelector<HTMLButtonElement>('[data-act="undo"]');
    const redoButton = overlay.querySelector<HTMLButtonElement>('[data-act="redo"]');
    if (undoButton) undoButton.disabled = historyIndex <= 0;
    if (redoButton) redoButton.disabled = historyIndex >= history.length - 1;
  };
  const pushHistory = (): void => {
    if (closed) return;
    if (appearanceKey(history[historyIndex]!) === appearanceKey(draft)) return;
    history.splice(historyIndex + 1);
    history.push(snapshot());
    historyIndex = history.length - 1;
    renderButtons();
  };
  const readField = (path: string): unknown => {
    if (path === "theme") return draft.theme;
    if (path === "motion") return draft.motion;
    const [group, field] = path.split(".") as [keyof Appearance, string];
    const value = (draft as unknown as Record<string, unknown>)[group] as Record<string, unknown> | undefined;
    return value?.[field];
  };
  const renderFields = (force = false): void => {
    overlay.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-field]").forEach((input) => {
      if (!force && input instanceof HTMLInputElement && input.type === "number" && input === document.activeElement) {
        return;
      }
      const currentValue = readField(input.dataset.field ?? "");
      if (input instanceof HTMLInputElement && input.type === "checkbox") input.checked = Boolean(currentValue);
      else input.value = String(currentValue ?? "");
    });
  };
  const renderSelection = (): void => {
    overlay.querySelectorAll<HTMLElement>("[data-element]").forEach((element) => {
      const active = element.dataset.element === selected;
      element.dataset.selected = String(active);
      element.setAttribute("aria-pressed", String(active));
    });
  };
  const select = (element: Selected): void => {
    const changed = selected !== element;
    selected = element;
    renderSelection();
    if (changed) announceSelection();
  };
  const renderSessions = (): void => {
    const strip = overlay.querySelector<HTMLElement>(".studio-sessions");
    if (!strip) return;
    strip.dataset.density = draft.sessions.density;
    const rows = SAMPLES.slice(0, draft.sessions.maxVisible).map((sample) => {
      const parts = [sample.name];
      if (draft.sessions.showProject) parts.push(sample.project);
      if (draft.sessions.showTool) parts.push(sample.tool);
      if (draft.sessions.showElapsed) parts.push(minutesLabel(options.lang, sample.minutes));
      const row = document.createElement("span");
      row.className = "studio-sample-row";
      row.textContent = parts.join(" · ");
      return row;
    });
    const caption = document.createElement("span");
    caption.className = "studio-sample-label";
    caption.textContent = label(options.lang, "studio.sample");
    strip.replaceChildren(...rows, caption);
  };
  const stripOverlap = (): boolean => {
    if (closed || draft.layout.mode !== "free") return false;
    const strip = overlay.querySelector<HTMLElement>(".studio-sessions");
    if (!strip) return false;
    const stageRect = stage.stage.getBoundingClientRect();
    const stripRect = strip.getBoundingClientRect();
    const nodeRect = elementNode(selected).getBoundingClientRect();
    if (nodeRect.width === 0 || nodeRect.height === 0 || stripRect.height === 0) return false;
    const margin = 4;
    return (
      nodeRect.bottom > stripRect.top - margin &&
      nodeRect.top < stripRect.bottom + margin &&
      nodeRect.right > stripRect.left - margin &&
      nodeRect.left < stripRect.right + margin &&
      stripRect.bottom > stageRect.top
    );
  };
  const updateOverlapWarning = (): void => {
    if (!warning) return;
    const hidden = !stripOverlap();
    const wasFocused = warning.contains(document.activeElement);
    warning.hidden = hidden;
    if (hidden && wasFocused) elementNode(selected).focus();
  };
  const update = (forceFields = false): void => {
    applyStage(stage, draft);
    petFrame.style.setProperty("--studio-pet-x", `${draft.pet.x}%`);
    petFrame.style.setProperty("--studio-pet-y", `${draft.pet.y}%`);
    const clock = formatClock(options.lang, draft.clock.format, new Date());
    stage.time.textContent = clock.time;
    stage.date.textContent = clock.date;
    renderer.setReducedMotion(resolveMotion(draft.motion) === "reduced");
    renderer.setState("idle");
    renderSessions();
    renderFields(forceFields);
    renderSelection();
    updateOverlapWarning();
  };
  const mutate = (fn: (next: Appearance) => void): void => {
    if (closed) return;
    const next = structuredClone(draft);
    fn(next);
    draft = normalizeAppearance(next);
    update();
  };
  const startFieldSession = (): void => {
    if (!fieldSession) fieldSession = { base: snapshot() };
  };
  const commitFieldSession = (): void => {
    if (!fieldSession) return;
    fieldSession = null;
    pushHistory();
  };
  const revertFieldSession = (): boolean => {
    if (!fieldSession) return false;
    draft = structuredClone(fieldSession.base);
    fieldSession = null;
    update(true);
    return true;
  };
  const applyField = (path: string, raw: string | boolean): boolean => {
    if (closed) return false;
    if (path === "theme" || path === "motion") {
      const value = String(raw);
      const allowed = path === "theme" ? ["system", "light", "dark"] : ["system", "full", "reduced"];
      if (!allowed.includes(value)) return false;
      mutate((next) => {
        (next as unknown as Record<string, unknown>)[path] = value;
      });
      return true;
    }
    const [group, field] = path.split(".") as [keyof Appearance, string];
    const reference = draft[group] as unknown as Record<string, unknown>;
    const previous = reference[field];
    if (typeof previous === "boolean" && typeof raw === "boolean") {
      mutate((next) => {
        (next[group] as unknown as Record<string, unknown>)[field] = raw;
      });
      return true;
    }
    if (typeof previous === "number") {
      if (typeof raw === "string" && raw.trim() === "") return false;
      const parsed = typeof raw === "boolean" ? Number.NaN : Number(raw);
      if (!Number.isFinite(parsed)) return false;
      mutate((next) => {
        (next[group] as unknown as Record<string, unknown>)[field] = parsed;
      });
      return true;
    }
    if (typeof previous === "string") {
      mutate((next) => {
        (next[group] as unknown as Record<string, unknown>)[field] = String(raw);
      });
      return true;
    }
    return false;
  };
  const onFieldInput = (input: HTMLInputElement | HTMLSelectElement): void => {
    if (closed) return;
    const path = input.dataset.field ?? "";
    if (input instanceof HTMLInputElement && input.type === "number") {
      startFieldSession();
      applyField(path, input.value);
      return;
    }
    const raw = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
    if (!applyField(path, raw)) return;
    pushHistory();
  };
  const onFieldCommit = (input: HTMLInputElement): void => {
    if (closed) return;
    const path = input.dataset.field ?? "";
    commitFieldSession();
    input.value = String(readField(path) ?? "");
    if (path.startsWith("clock.") || path.startsWith("pet.")) announcePosition();
  };

  overlay.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-field]").forEach((input) => {
    if (input instanceof HTMLInputElement && input.type === "number") {
      input.addEventListener("input", () => onFieldInput(input));
      input.addEventListener("change", () => onFieldCommit(input));
      input.addEventListener("blur", () => onFieldCommit(input));
    } else {
      input.addEventListener("change", () => onFieldInput(input));
    }
  });

  const setFrame = (frame: "folded" | "wide"): void => {
    const preview = overlay.querySelector<HTMLElement>(".studio-preview");
    if (preview) preview.dataset.frame = frame;
    overlay.querySelectorAll<HTMLButtonElement>("button[data-frame]").forEach((candidate) => {
      candidate.setAttribute("aria-pressed", String(candidate.dataset.frame === frame));
    });
    updateOverlapWarning();
  };
  overlay.querySelectorAll<HTMLButtonElement>("button[data-frame]").forEach((button) => {
    button.addEventListener("click", () => setFrame(button.dataset.frame === "wide" ? "wide" : "folded"));
  });
  const snapInput = overlay.querySelector<HTMLInputElement>("[data-snap]");
  snapInput?.addEventListener("change", () => {
    snap = Boolean(snapInput.checked);
  });

  const snapTo = (value: number, extent: number): number => {
    const bounded = clamp(value, 0, 100);
    if (!snap || extent <= 0) return bounded;
    const pixels = (bounded / 100) * extent;
    const anchors = [0, extent / 2, extent];
    for (const anchor of anchors) {
      if (Math.abs(pixels - anchor) <= SNAP_ANCHOR) return clamp((anchor / extent) * 100, 0, 100);
    }
    return clamp((Math.round(pixels / SNAP_GRID) * SNAP_GRID / extent) * 100, 0, 100);
  };
  const detachDrag = (): void => {
    if (!dragCleanup) return;
    const cleanup = dragCleanup;
    dragCleanup = null;
    cleanup();
  };

  stage.stage.addEventListener("pointerdown", (event) => {
    if (closed || confirmOpen) return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("[data-handle]")) return;
    const target = event.target.closest<HTMLElement>("[data-element]");
    if (!target) return;
    const element = elementName(target.dataset.element);
    target.focus();
    select(element);
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.preventDefault();
    detachDrag();
    const rect = stage.stage.getBoundingClientRect();
    const start = { px: event.clientX, py: event.clientY, x: draft[element].x, y: draft[element].y };
    let dragging = false;
    let attached = true;
    const move = (moveEvent: PointerEvent): void => {
      if (!attached || closed) return;
      const dx = moveEvent.clientX - start.px;
      const dy = moveEvent.clientY - start.py;
      if (!dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!dragging) {
        dragging = true;
        if (draft.layout.mode === "stack") {
          mutate((next) => {
            next.layout.mode = "free";
          });
          announce(label(options.lang, "studio.freeLayout"));
        }
      }
      const nextX = snapTo(start.x + (dx / rect.width) * 100, rect.width);
      const nextY = snapTo(start.y + (dy / rect.height) * 100, rect.height);
      mutate((next) => {
        next[element].x = nextX;
        next[element].y = nextY;
      });
    };
    const finish = (): void => {
      if (!attached) return;
      attached = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      dragCleanup = null;
      if (dragging) {
        pushHistory();
        announcePosition();
        updateOverlapWarning();
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    dragCleanup = () => {
      if (!attached) return;
      attached = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  });

  overlay.querySelectorAll<HTMLElement>("[data-handle]").forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      if (closed || confirmOpen) return;
      event.stopPropagation();
      event.preventDefault();
      detachDrag();
      const element = elementName(handle.dataset.handle);
      select(element);
      const target = stage[element].getBoundingClientRect();
      const centerX = target.left + target.width / 2;
      const centerY = target.top + target.height / 2;
      const startDistance = Math.hypot(event.clientX - centerX, event.clientY - centerY);
      const startScale = draft[element].scale;
      const min = element === "clock" ? 60 : 80;
      const max = element === "clock" ? 160 : 200;
      let changed = false;
      let attached = true;
      const move = (moveEvent: PointerEvent): void => {
        if (!attached || closed || startDistance <= 0) return;
        changed = true;
        const distance = Math.hypot(moveEvent.clientX - centerX, moveEvent.clientY - centerY);
        const nextScale = clamp(startScale * (distance / startDistance), min, max);
        mutate((next) => {
          next[element].scale = nextScale;
        });
      };
      const finish = (): void => {
        if (!attached) return;
        attached = false;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        dragCleanup = null;
        if (changed) {
          pushHistory();
          announcePosition();
          updateOverlapWarning();
        }
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
      dragCleanup = () => {
        if (!attached) return;
        attached = false;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
      };
    });
  });

  overlay.addEventListener("focusin", (event) => {
    if (!(event.target instanceof HTMLElement)) return;
    const target = event.target.closest<HTMLElement>("[data-element]");
    if (target) select(elementName(target.dataset.element));
  });

  const focusableElements = (): HTMLElement[] =>
    Array.from(
      overlay.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.closest("[inert]") && element.getClientRects().length > 0);

  const undo = (): void => {
    if (closed) return;
    commitFieldSession();
    if (historyIndex <= 0) return;
    historyIndex -= 1;
    draft = structuredClone(history[historyIndex]!);
    update(true);
    renderButtons();
    announcePosition();
  };
  const redo = (): void => {
    if (closed) return;
    commitFieldSession();
    if (historyIndex >= history.length - 1) return;
    historyIndex += 1;
    draft = structuredClone(history[historyIndex]!);
    update(true);
    renderButtons();
    announcePosition();
  };
  const reset = (all: boolean): void => {
    if (closed) return;
    commitFieldSession();
    mutate((next) => {
      if (all) {
        Object.assign(next, structuredClone(DEFAULT_APPEARANCE));
        return;
      }
      const defaults = DEFAULT_APPEARANCE[selected];
      next[selected].x = defaults.x;
      next[selected].y = defaults.y;
      next[selected].scale = defaults.scale;
    });
    pushHistory();
    announcePosition();
  };
  const resetPosition = (): void => {
    if (closed) return;
    commitFieldSession();
    const defaults = DEFAULT_APPEARANCE[selected];
    mutate((next) => {
      next[selected].x = defaults.x;
      next[selected].y = defaults.y;
    });
    pushHistory();
    announcePosition();
  };
  const moveUp = (): void => {
    if (closed || draft.layout.mode !== "free") return;
    const strip = overlay.querySelector<HTMLElement>(".studio-sessions");
    if (!strip) return;
    commitFieldSession();
    const stageRect = stage.stage.getBoundingClientRect();
    const stripRect = strip.getBoundingClientRect();
    const nodeRect = elementNode(selected).getBoundingClientRect();
    if (stageRect.height <= 0) return;
    const maxCenter = stripRect.top - stageRect.top - nodeRect.height / 2 - 4;
    mutate((next) => {
      next[selected].y = clamp((maxCenter / stageRect.height) * 100, 0, 100);
    });
    pushHistory();
    announcePosition();
    updateOverlapWarning();
  };

  overlay.querySelector<HTMLButtonElement>('[data-act="undo"]')?.addEventListener("click", undo);
  overlay.querySelector<HTMLButtonElement>('[data-act="redo"]')?.addEventListener("click", redo);
  overlay.querySelector<HTMLButtonElement>('[data-act="reset-element"]')?.addEventListener("click", () => reset(false));
  overlay.querySelector<HTMLButtonElement>('[data-act="reset-all"]')?.addEventListener("click", () => reset(true));
  overlay.querySelector<HTMLButtonElement>('[data-act="move-up"]')?.addEventListener("click", moveUp);
  overlay.querySelector<HTMLButtonElement>('[data-act="reset-position"]')?.addEventListener("click", resetPosition);

  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      const focusable = focusableElements();
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (!event.shiftKey && (!active || active === last || !overlay.contains(active))) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (!active || active === first || !overlay.contains(active))) {
        event.preventDefault();
        last.focus();
      }
      return;
    }
    if (closed || confirmOpen) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const inField = Boolean(target?.matches("input, select, textarea"));
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (inField) commitFieldSession();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (inField || event.key === "Escape") return;
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      if (draft.layout.mode === "stack") {
        mutate((next) => {
          next.layout.mode = "free";
        });
        announce(label(options.lang, "studio.freeLayout"));
      }
      mutate((next) => {
        if (event.key === "ArrowLeft") next[selected].x = clamp(next[selected].x - step, 0, 100);
        if (event.key === "ArrowRight") next[selected].x = clamp(next[selected].x + step, 0, 100);
        if (event.key === "ArrowUp") next[selected].y = clamp(next[selected].y - step, 0, 100);
        if (event.key === "ArrowDown") next[selected].y = clamp(next[selected].y + step, 0, 100);
      });
      pushHistory();
      announcePosition();
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      mutate((next) => {
        next[selected].scale = clamp(next[selected].scale + 5, selected === "clock" ? 60 : 80, selected === "clock" ? 160 : 200);
      });
      pushHistory();
      announcePosition();
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      mutate((next) => {
        next[selected].scale = clamp(next[selected].scale - 5, selected === "clock" ? 60 : 80, selected === "clock" ? 160 : 200);
      });
      pushHistory();
      announcePosition();
    }
  });

  const setStatus = (message: string): void => {
    const status = overlay.querySelector<HTMLElement>(".studio-status");
    if (status) status.textContent = message;
  };
  const restorePageAppearance = (): void => {
    const set = (name: "theme" | "motion" | "sessionsDensity", value: string | undefined): void => {
      if (value === undefined) delete pageRoot.dataset[name];
      else pageRoot.dataset[name] = value;
    };
    set("theme", before.theme);
    set("motion", before.motion);
    set("sessionsDensity", before.density);
  };
  const showConfirm = (): void => {
    if (confirmOpen || !confirmPanel || !topbar || !bodyEl) return;
    confirmOpen = true;
    confirmPanel.hidden = false;
    topbar.inert = true;
    bodyEl.inert = true;
    overlay.querySelector<HTMLButtonElement>('[data-act="keep-editing"]')?.focus();
  };
  const hideConfirm = (): void => {
    if (!confirmOpen) return;
    confirmOpen = false;
    if (confirmPanel) confirmPanel.hidden = true;
    if (topbar) topbar.inert = false;
    if (bodyEl) bodyEl.inert = false;
    elementNode(selected).focus();
  };
  overlay.querySelector<HTMLButtonElement>('[data-act="keep-editing"]')?.addEventListener("click", hideConfirm);
  overlay.querySelector<HTMLButtonElement>('[data-act="discard"]')?.addEventListener("click", () => {
    confirmOpen = false;
    close();
  });

  const close = (): void => {
    if (closed) return;
    closed = true;
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
    detachDrag();
    window.removeEventListener("resize", onResize);
    document.removeEventListener("keydown", onDocumentKey);
    renderer.stop();
    overlay.remove();
    document.body.classList.remove("studio-open");
    for (const { element, inert } of siblingState) element.inert = inert;
    if (!saved) restorePageAppearance();
    options.onClose?.();
    restore?.focus();
  };
  const save = async (): Promise<void> => {
    if (closed || saving) return;
    saving = true;
    commitFieldSession();
    const saveButton = overlay.querySelector<HTMLButtonElement>('[data-act="save"]');
    if (saveButton) saveButton.disabled = true;
    try {
      await options.onSave(normalizeAppearance(draft));
      if (closed) return;
      saved = true;
      setStatus(label(options.lang, "studio.saved"));
      saveTimer = window.setTimeout(() => {
        saveTimer = null;
        close();
      }, SAVE_STATUS_MS);
    } catch {
      saving = false;
      if (saveButton) saveButton.disabled = false;
      if (!closed) setStatus(label(options.lang, "studio.saveFailed"));
    }
  };
  overlay.querySelector<HTMLButtonElement>('[data-act="save"]')?.addEventListener("click", () => {
    void save();
  });
  overlay.querySelector<HTMLButtonElement>('[data-act="cancel"]')?.addEventListener("click", close);

  const attemptClose = (): void => {
    if (closed) return;
    if (saved) {
      close();
      return;
    }
    if (isDirty()) showConfirm();
    else close();
  };
  const onDocumentKey = (event: KeyboardEvent): void => {
    if (closed || event.key !== "Escape" || event.defaultPrevented) return;
    if (confirmOpen) {
      event.preventDefault();
      hideConfirm();
      return;
    }
    const active = document.activeElement;
    if (active instanceof HTMLElement && overlay.contains(active) && active.matches("input, select, textarea")) {
      event.preventDefault();
      if (!revertFieldSession()) active.blur();
      elementNode(selected).focus();
      return;
    }
    event.preventDefault();
    attemptClose();
  };
  const onResize = (): void => {
    if (!closed) updateOverlapWarning();
  };
  document.addEventListener("keydown", onDocumentKey);
  window.addEventListener("resize", onResize);

  if (options.pet) {
    renderer.load(options.pet.spriteUrl).catch(() => undefined);
  }
  update(true);
  renderButtons();
  elementNode("clock").focus();
  return { close };
}

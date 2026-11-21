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
  let saved = false;

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
      else if (selected === "clock") next.clock = structuredClone(DEFAULT_APPEARANCE.clock);
      else next.pet = structuredClone(DEFAULT_APPEARANCE.pet);
    });
    pushHistory();
  };
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
  const save = async (): Promise<void> => {
    try {
      await options.onSave(normalizeAppearance(draft));
      saved = true;
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
    if (!saved) restorePageAppearance();
    options.onClose?.();
    restore?.focus();
  };
  const onDocumentKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") close();
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

import "./setup.css";
import { isLang, setupCopy } from "../../../src/i18n.js";
import { DEFAULT_APPEARANCE, normalizeAppearance, type Appearance } from "../../../src/appearance.js";
import { filterPets, type PetSummary } from "../catalog.js";
import { t as webT } from "../i18n.js";
import { applyStage, bindStage, formatClock } from "../look/stage.js";
import { openStudio } from "../look/studio.js";
import { PetRenderer } from "../sprite.js";

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
let saveNotice: string | null = null;

/** Copies the already-rendered URL/command text; never builds or logs a token. */
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-copy-target]")) {
  button.addEventListener("click", async () => {
    const target = document.getElementById(button.dataset.copyTarget ?? "");
    const text = target?.textContent?.trim() ?? "";
    if (!text || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = setupCopy[lang].copied;
    } catch {
      // The URL/command remains selectable; do not claim a copy that did not happen.
    }
  });
}

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
    pet = state.pets.find((candidate) => candidate.id === state?.activePet) ?? state.pets[0] ?? null;
    saveNotice = null;
    render();
  } catch {
    renderer?.stop();
    renderer = null;
    delete document.documentElement.dataset.setupReady;
    root.replaceChildren();
    const message = document.createElement("p");
    message.className = "error";
    message.setAttribute("role", "alert");
    message.textContent = webT(lang, "look.loadError");
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "button";
    retry.textContent = webT(lang, "common.retry");
    retry.addEventListener("click", () => {
      void load();
    });
    root.append(message, retry);
  }
}

/**
 * Saves a full appearance, and the pet only when the caller changes it. An
 * omitted `activePet` keeps the host pet and lets the bridge skip the catalog.
 */
async function save(next: Appearance, petId?: string | null): Promise<void> {
  const payload: { appearance: Appearance; activePet?: string | null } = {
    appearance: normalizeAppearance(next),
  };
  if (petId !== undefined) payload.activePet = petId;
  await setupFetch<{ appearance: Appearance; activePet: string | null }>("/api/setup/look", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

function render(): void {
  if (!root || !state) return;
  const current = state;
  const activePet = pet;
  const appearance = normalizeAppearance(current.appearance);
  renderer?.stop();
  renderer = null;
  root.replaceChildren();

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
    button.className = "button";
    button.textContent = webT(lang, name === "folded" ? "look.folded" : "look.wide");
    button.dataset.frame = name;
    button.setAttribute("aria-pressed", String(name === "folded"));
    button.addEventListener("click", () => {
      frame.dataset.frame = name;
      frameButtons.querySelectorAll<HTMLButtonElement>("button").forEach((candidate) => {
        candidate.setAttribute("aria-pressed", String(candidate === button));
      });
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
    if (activePet) {
      renderer = new PetRenderer(stage.pet);
      renderer.start();
      renderer.load(activePet.spriteUrl).catch(() => undefined);
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
  const layoutLabel = webT(lang, appearance.layout.mode === "free" ? "look.layoutFree" : "look.layoutStack");
  add(webT(lang, "look.layout"), `${layoutLabel} · ${appearance.layout.gap}`);
  add(webT(lang, "look.pet"), activePet?.name ?? webT(lang, "look.noPets"));

  const actions = document.createElement("div");
  actions.className = "look-actions";
  const studioButton = document.createElement("button");
  studioButton.type = "button";
  studioButton.className = "button button-primary";
  studioButton.textContent = webT(lang, "look.openStudio");
  studioButton.addEventListener("click", () => {
    openStudio({
      appearance,
      pet: activePet ? { id: activePet.id, name: activePet.name, spriteUrl: activePet.spriteUrl } : null,
      lang,
      scope: "host",
      onSave: async (next) => {
        // Appearance-only: the host pet stays unchanged.
        await save(next);
        await load();
      },
      onClose: () => {
        // Saving re-renders the card, so the Studio's saved trigger is detached.
        root.querySelector<HTMLButtonElement>(".look-actions .button-primary")?.focus();
      },
    });
  });
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "button";
  reset.textContent = webT(lang, "common.reset");
  reset.addEventListener("click", async () => {
    try {
      await save(DEFAULT_APPEARANCE);
      await load();
    } catch {
      saveNotice = webT(lang, "look.saveError");
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
  list.setAttribute("role", "radiogroup");
  list.setAttribute("aria-label", webT(lang, "look.pet"));
  const renderPets = () => {
    list.replaceChildren(
      ...filterPets(current.pets ?? [], search.value).map((candidate) => {
        const option = document.createElement("label");
        option.dataset.petOption = "";
        const input = document.createElement("input");
        input.type = "radio";
        input.name = "host-pet";
        input.value = candidate.id;
        input.checked = candidate.id === current.activePet;
        input.addEventListener("change", async () => {
          try {
            // A pet change sends the current full appearance with the new id.
            await save(current.appearance, candidate.id);
            await load();
          } catch {
            saveNotice = webT(lang, "look.saveError");
            render();
          }
        });
        const name = document.createElement("span");
        name.textContent = candidate.name;
        option.append(input, name);
        return option;
      }),
    );
  };
  search.addEventListener("input", renderPets);
  renderPets();
  petRow.append(search, list);

  root.append(preview, summary, actions, petRow);
  if (saveNotice) {
    const note = document.createElement("p");
    note.className = "error";
    note.setAttribute("role", "alert");
    note.textContent = saveNotice;
    root.append(note);
  }
  document.documentElement.dataset.setupReady = "true";
}

void load();

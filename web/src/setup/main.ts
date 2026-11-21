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

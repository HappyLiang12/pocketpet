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

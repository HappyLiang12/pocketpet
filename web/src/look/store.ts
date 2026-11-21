import { normalizeLocalLook, type LocalLook } from "../../../src/appearance.js";

export const LOOK_STORAGE_KEY = "pocketpet.look";

// `window.localStorage` can throw on property access (private mode, enterprise
// policy). A default parameter like `storage: Storage = localStorage` would
// evaluate that getter before any try block, aborting module load, so every
// entry point resolves storage inside its try.
function resolveStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function readLocalLook(storage?: Storage): LocalLook {
  try {
    const target = resolveStorage(storage);
    if (!target) return normalizeLocalLook(null);
    const raw = target.getItem(LOOK_STORAGE_KEY);
    return normalizeLocalLook(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeLocalLook(null);
  }
}

export function writeLocalLook(value: LocalLook, storage?: Storage): boolean {
  try {
    const target = resolveStorage(storage);
    if (!target) return false;
    target.setItem(LOOK_STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function clearLocalLook(storage?: Storage): boolean {
  try {
    const target = resolveStorage(storage);
    if (!target) return false;
    target.removeItem(LOOK_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function canUseLocalStorage(storage?: Storage): boolean {
  try {
    const target = resolveStorage(storage);
    if (!target) return false;
    const key = "__pocketpet_test__";
    target.setItem(key, "1");
    target.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

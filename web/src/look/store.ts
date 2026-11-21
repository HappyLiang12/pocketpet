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

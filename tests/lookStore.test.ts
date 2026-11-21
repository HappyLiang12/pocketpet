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

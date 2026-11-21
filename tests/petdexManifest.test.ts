import { mkdtempSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPetdexPets } from "../src/petdexManifest.js";

let root = "";
afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); });

const payload = { pets: [{ slug: "boba", displayName: "Boba", spritesheetUrl: "https://assets.petdex.dev/curated/boba/sprite-v2.webp", petJsonUrl: "https://assets.petdex.dev/curated/boba/petjson-v2.json" }] };

describe("loadPetdexPets", () => {
  it("fetches once then uses cache", async () => {
    root = mkdtempSync(join(tmpdir(), "foldpet-"));
    const cacheFile = join(root, "manifest.json");
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
    expect(await loadPetdexPets({ cacheFile, fetchImpl })).toMatchObject([{ id: "petdex:boba", name: "Boba" }]);
    expect(await loadPetdexPets({ cacheFile, fetchImpl })).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(existsSync(cacheFile)).toBe(true);
  });

  it("falls back to stale cache when fetch fails", async () => {
    root = mkdtempSync(join(tmpdir(), "foldpet-"));
    const cacheFile = join(root, "manifest.json");
    const ok = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
    await loadPetdexPets({ cacheFile, fetchImpl: ok, maxAgeMs: 0 });
    const fail = vi.fn(async () => { throw new Error("offline"); });
    const pets = await loadPetdexPets({ cacheFile, fetchImpl: fail, maxAgeMs: 0 });
    expect(pets).toHaveLength(1);
  });

  it("returns an empty list when offline with no cache", async () => {
    root = mkdtempSync(join(tmpdir(), "foldpet-"));
    const fetchImpl = vi.fn(async () => { throw new Error("offline"); });
    expect(await loadPetdexPets({ cacheFile: join(root, "manifest.json"), fetchImpl })).toEqual([]);
  });

  it("skips malformed manifest entries and survives a corrupt cache", async () => {
    root = mkdtempSync(join(tmpdir(), "foldpet-"));
    const cacheFile = join(root, "manifest.json");
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      pets: [
        payload.pets[0],
        { slug: "no-sprite", displayName: "No Sprite" },
        { slug: "bad slug", spritesheetUrl: "https://assets.petdex.dev/x.webp", petJsonUrl: "https://assets.petdex.dev/x.json" },
        "not an object",
      ],
    }), { status: 200 }));
    expect((await loadPetdexPets({ cacheFile, fetchImpl })).map((p) => p.id)).toEqual(["petdex:boba"]);
    writeFileSync(cacheFile, "{not json");
    const offline = vi.fn(async () => { throw new Error("offline"); });
    expect(await loadPetdexPets({ cacheFile, fetchImpl: offline, maxAgeMs: 0 })).toEqual([]);
  });

  it("drops entries whose asset URLs are not https petdex.dev", async () => {
    root = mkdtempSync(join(tmpdir(), "foldpet-"));
    const cacheFile = join(root, "manifest.json");
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      pets: [
        payload.pets[0],
        { slug: "relative", displayName: "Relative", spritesheetUrl: "/pets/relative/sheet.webp", petJsonUrl: "https://petdex.dev/pets/relative/pet.json" },
        { slug: "plain-http", displayName: "Plain", spritesheetUrl: "http://petdex.dev/pets/plain/sheet.webp", petJsonUrl: "https://petdex.dev/pets/plain/pet.json" },
        { slug: "wrong-host", displayName: "Wrong", spritesheetUrl: "https://evil.example/sheet.webp", petJsonUrl: "https://petdex.dev/pets/wrong/pet.json" },
        { slug: "bad-meta", displayName: "Bad Meta", spritesheetUrl: "https://petdex.dev/pets/bad/sheet.webp", petJsonUrl: "https://evil.example/pet.json" },
      ],
    }), { status: 200 }));
    expect((await loadPetdexPets({ cacheFile, fetchImpl })).map((p) => p.id)).toEqual(["petdex:boba"]);
  });

  it("drops invalid URLs from a cached manifest without refetching", async () => {
    root = mkdtempSync(join(tmpdir(), "foldpet-"));
    const cacheFile = join(root, "manifest.json");
    writeFileSync(cacheFile, JSON.stringify({
      fetchedAt: Date.now(),
      pets: [
        payload.pets[0],
        { slug: "relative", displayName: "Relative", spritesheetUrl: "/pets/relative/sheet.webp", petJsonUrl: "https://petdex.dev/pets/relative/pet.json" },
      ],
    }));
    const fetchImpl = vi.fn(async () => { throw new Error("offline"); });
    expect((await loadPetdexPets({ cacheFile, fetchImpl })).map((p) => p.id)).toEqual(["petdex:boba"]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns fetched pets when the cache cannot be written", async () => {
    root = mkdtempSync(join(tmpdir(), "foldpet-"));
    const cacheFile = join(root, "manifest.json");
    mkdirSync(cacheFile);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
    expect(await loadPetdexPets({ cacheFile, fetchImpl })).toMatchObject([{ id: "petdex:boba" }]);
  });
});

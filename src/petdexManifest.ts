import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface PetdexPet {
  id: string;
  source: "petdex";
  slug: string;
  name: string;
  spritesheetUrl: string;
  petJsonUrl: string;
}

type Options = {
  cacheFile: string;
  url?: string;
  fetchImpl?: typeof fetch;
  maxAgeMs?: number;
  now?: () => number;
};

type Cache = { fetchedAt: number; pets: PetdexPet[] };

function trustedAssetUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return url.protocol === "https:" && (url.hostname === "petdex.dev" || url.hostname.endsWith(".petdex.dev"));
}

function toPet(value: Record<string, unknown>): PetdexPet | null {
  const slug = typeof value.slug === "string" ? value.slug : null;
  const name = typeof value.displayName === "string" ? value.displayName : slug;
  const spritesheetUrl = typeof value.spritesheetUrl === "string" ? value.spritesheetUrl : null;
  const petJsonUrl = typeof value.petJsonUrl === "string" ? value.petJsonUrl : null;
  if (!slug || !name || !spritesheetUrl || !petJsonUrl) return null;
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(slug)) return null;
  // One bad asset URL must not poison the catalog: proxy targets are restricted
  // to https petdex.dev hosts, so drop the whole entry when either URL fails.
  if (!trustedAssetUrl(spritesheetUrl) || !trustedAssetUrl(petJsonUrl)) return null;
  return { id: `petdex:${slug}`, source: "petdex", slug, name, spritesheetUrl, petJsonUrl };
}

function toPets(value: unknown): PetdexPet[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
    .map(toPet)
    .filter((p): p is PetdexPet => p !== null);
}

function readCache(file: string): Cache | null {
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { fetchedAt?: unknown; pets?: unknown };
    if (typeof parsed.fetchedAt !== "number" || !Number.isFinite(parsed.fetchedAt)) return null;
    if (!Array.isArray(parsed.pets)) return null;
    return { fetchedAt: parsed.fetchedAt, pets: toPets(parsed.pets) };
  } catch {
    return null;
  }
}

export async function loadPetdexPets(opts: Options): Promise<PetdexPet[]> {
  const url = opts.url ?? "https://petdex.dev/api/manifest";
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const maxAge = opts.maxAgeMs ?? 24 * 60 * 60_000;
  const cached = readCache(opts.cacheFile);
  if (cached && now() - cached.fetchedAt < maxAge) return cached.pets;
  let pets: PetdexPet[];
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`manifest ${response.status}`);
    const data = (await response.json()) as { pets?: unknown };
    pets = toPets(data?.pets);
  } catch {
    return cached?.pets ?? [];
  }
  try {
    mkdirSync(dirname(opts.cacheFile), { recursive: true });
    writeFileSync(opts.cacheFile, JSON.stringify({ fetchedAt: now(), pets }));
  } catch {
    // A cache write failure must not discard a successful fetch.
  }
  return pets;
}

import { existsSync, readFileSync, readdirSync } from "node:fs";
import type { Dirent } from "node:fs";
import { join } from "node:path";

export interface LocalPet {
  id: string;
  source: "local";
  slug: string;
  name: string;
  dir: string;
  spriteFile: string;
}

export type AtlasLayout = { version: 1 | 2; rows: 9 | 11; width: number; height: number };
const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

export function detectAtlas(width: number, height: number): AtlasLayout | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null;
  for (const rows of [9, 11] as const) {
    if (width % 8 !== 0 || height % rows !== 0) continue;
    if (width * rows * 208 !== height * 8 * 192) continue;
    return { version: rows === 9 ? 1 : 2, rows, width, height };
  }
  return null;
}

export function readImageSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length >= 24 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length >= 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (chunk === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

export function scanLocalPets(dirs: string[]): LocalPet[] {
  const pets: LocalPet[] = [];
  const seen = new Set<string>();
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !SLUG_RE.test(entry.name)) continue;
      const petDir = join(dir, entry.name);
      const petJson = join(petDir, "pet.json");
      if (!existsSync(petJson)) continue;
      try {
        const meta = JSON.parse(readFileSync(petJson, "utf8")) as { displayName?: unknown; name?: unknown };
        const name = typeof meta.displayName === "string" ? meta.displayName : typeof meta.name === "string" ? meta.name : entry.name;
        const spriteFile = ["spritesheet.webp", "spritesheet.png"].find((file) => existsSync(join(petDir, file)));
        if (!spriteFile) continue;
        const id = `local:${entry.name}`;
        // First directory wins so the same Petdex slug installed in several
        // roots (or copied between them) is listed once.
        if (seen.has(id)) continue;
        seen.add(id);
        pets.push({ id, source: "local", slug: entry.name, name, dir: petDir, spriteFile });
      } catch {
        continue;
      }
    }
  }
  return pets;
}

export function validateLocalPet(pet: LocalPet): { ok: true } | { ok: false; error: string } {
  let buf: Buffer;
  try {
    buf = readFileSync(join(pet.dir, pet.spriteFile));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `cannot read spritesheet (${message})` };
  }
  const size = readImageSize(buf);
  if (!size) return { ok: false, error: "unsupported spritesheet (need PNG or WebP)" };
  if (!detectAtlas(size.width, size.height)) return { ok: false, error: `spritesheet ${size.width}x${size.height} is not an 8x9 or 8x11 Petdex atlas` };
  return { ok: true };
}

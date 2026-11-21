import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectAtlas, readImageSize, scanLocalPets, validateLocalPet } from "../src/pets.js";

let root = "";
afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); });

function pngHeader(width: number, height: number): Buffer {
  const buf = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

describe("atlas geometry", () => {
  it("accepts 8x9 and 8x11 canonical sheets", () => {
    expect(detectAtlas(1536, 1872)).toMatchObject({ version: 1, rows: 9 });
    expect(detectAtlas(1536, 2288)).toMatchObject({ version: 2, rows: 11 });
    expect(detectAtlas(384, 468)).toMatchObject({ version: 1, rows: 9 });
  });
  it("rejects bad ratios", () => {
    expect(detectAtlas(1536, 2000)).toBeNull();
    expect(detectAtlas(256, 312)).toBeNull();
  });
  it("rejects non-positive and fractional sizes", () => {
    expect(detectAtlas(0, 0)).toBeNull();
    expect(detectAtlas(-1536, -1872)).toBeNull();
    expect(detectAtlas(1536.5, 1872)).toBeNull();
  });
  it("reads PNG and WebP dimensions", () => {
    expect(readImageSize(pngHeader(384, 468))).toEqual({ width: 384, height: 468 });
    const webp = Buffer.alloc(30);
    webp.write("RIFF", 0, "ascii");
    webp.write("WEBP", 8, "ascii");
    webp.write("VP8X", 12, "ascii");
    webp.writeUIntLE(383, 24, 3);
    webp.writeUIntLE(467, 27, 3);
    expect(readImageSize(webp)).toEqual({ width: 384, height: 468 });
    const lossy = Buffer.alloc(30);
    lossy.write("RIFF", 0, "ascii");
    lossy.write("WEBP", 8, "ascii");
    lossy.write("VP8 ", 12, "ascii");
    lossy.set([0x9d, 0x01, 0x2a], 23);
    lossy.writeUInt16LE(384, 26);
    lossy.writeUInt16LE(468, 28);
    expect(readImageSize(lossy)).toEqual({ width: 384, height: 468 });
    expect(readImageSize(Buffer.from("not an image"))).toBeNull();
  });
});

describe("local pets", () => {
  it("scans valid folders and skips broken ones", () => {
    root = mkdtempSync(join(tmpdir(), "foldpet-"));
    mkdirSync(join(root, "good"), { recursive: true });
    writeFileSync(join(root, "good", "pet.json"), JSON.stringify({ displayName: "Good" }));
    writeFileSync(join(root, "good", "spritesheet.png"), pngHeader(384, 468));
    mkdirSync(join(root, "broken"), { recursive: true });
    writeFileSync(join(root, "broken", "pet.json"), "{}");
    const pets = scanLocalPets([root]);
    expect(pets.map((p) => p.id)).toEqual(["local:good"]);
    expect(validateLocalPet(pets[0]!)).toEqual({ ok: true });
  });

  it("rejects an invalid sprite", () => {
    root = mkdtempSync(join(tmpdir(), "foldpet-"));
    mkdirSync(join(root, "bad"), { recursive: true });
    writeFileSync(join(root, "bad", "pet.json"), JSON.stringify({ displayName: "Bad" }));
    writeFileSync(join(root, "bad", "spritesheet.png"), pngHeader(100, 100));
    const [pet] = scanLocalPets([root]);
    expect(pet && validateLocalPet(pet)).toMatchObject({ ok: false });
  });
});

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const home = process.env.POCKETPET_HOME ?? ".tmp-e2e";
mkdirSync(home, { recursive: true });
writeFileSync(join(home, "config.json"), JSON.stringify({ token: "e2e-token-0123456789", port: 7799, activePet: "local:testpet", sleepAfterMinutes: 10, quietHours: null }, null, 2));
// A fresh cache entry keeps /api/pets fully offline during E2E. The gallery is
// larger than the drawer window so the cap/filter test is meaningful.
mkdirSync(join(home, "cache", "petdex"), { recursive: true });
const gallery = Array.from({ length: 60 }, (_, index) => ({
  slug: `gallery-${String(index + 1).padStart(2, "0")}`,
  displayName: `Gallery Pet ${index + 1}`,
  spritesheetUrl: `https://assets.petdex.dev/e2e/gallery-${index + 1}/sprite.webp`,
  petJsonUrl: `https://assets.petdex.dev/e2e/gallery-${index + 1}/petjson.json`,
}));
writeFileSync(join(home, "cache", "petdex", "manifest.json"), JSON.stringify({ fetchedAt: Date.now(), pets: gallery }));

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
function png(width, height, colorAt = () => [0, 0, 0, 0]) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rowBytes = 1 + width * 4;
  const raw = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowBytes;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = colorAt(x, y);
      const offset = rowStart + 1 + x * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  }
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
mkdirSync(join(home, "pets", "testpet"), { recursive: true });
writeFileSync(join(home, "pets", "testpet", "pet.json"), JSON.stringify({ id: "testpet", displayName: "Test Pet", description: "", spritesheetPath: "spritesheet.png" }));
writeFileSync(join(home, "pets", "testpet", "spritesheet.png"), png(384, 468));
mkdirSync(join(home, "pets", "testpet2"), { recursive: true });
writeFileSync(join(home, "pets", "testpet2", "pet.json"), JSON.stringify({ id: "testpet2", displayName: "Test Pet 2", description: "", spritesheetPath: "spritesheet.png" }));
writeFileSync(join(home, "pets", "testpet2", "spritesheet.png"), png(384, 468));
// Scaled 8x9 atlas whose every 48x52 cell is a flat opaque color derived from
// its row/column: R = 40 + 20*row, G = 40 + 20*col, B = 10. A renderer that
// assumes 192x208 cells would sample the wrong row and show the wrong color.
mkdirSync(join(home, "pets", "markerpet"), { recursive: true });
writeFileSync(join(home, "pets", "markerpet", "pet.json"), JSON.stringify({ id: "markerpet", displayName: "Marker Pet", description: "", spritesheetPath: "spritesheet.png" }));
writeFileSync(join(home, "pets", "markerpet", "spritesheet.png"), png(384, 468, (x, y) => {
  const row = Math.floor(y / 52);
  const col = Math.floor(x / 48);
  return [40 + 20 * row, 40 + 20 * col, 10, 255];
}));
mkdirSync(join(home, "pets", "brokenpet"), { recursive: true });
writeFileSync(join(home, "pets", "brokenpet", "pet.json"), JSON.stringify({ id: "brokenpet", displayName: "Broken Pet", description: "", spritesheetPath: "spritesheet.png" }));
writeFileSync(join(home, "pets", "brokenpet", "spritesheet.png"), Buffer.from("not a png"));

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const home = process.env.FOLDPET_HOME ?? ".tmp-e2e";
mkdirSync(home, { recursive: true });
writeFileSync(join(home, "config.json"), JSON.stringify({ token: "e2e-token-0123456789", port: 7799, activePet: "local:testpet", sleepAfterMinutes: 10, quietHours: null }, null, 2));

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
function png(width, height) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const row = Buffer.alloc(1 + width * 4);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
mkdirSync(join(home, "pets", "testpet"), { recursive: true });
writeFileSync(join(home, "pets", "testpet", "pet.json"), JSON.stringify({ id: "testpet", displayName: "Test Pet", description: "", spritesheetPath: "spritesheet.png" }));
writeFileSync(join(home, "pets", "testpet", "spritesheet.png"), png(384, 468));
mkdirSync(join(home, "pets", "testpet2"), { recursive: true });
writeFileSync(join(home, "pets", "testpet2", "pet.json"), JSON.stringify({ id: "testpet2", displayName: "Test Pet 2", description: "", spritesheetPath: "spritesheet.png" }));
writeFileSync(join(home, "pets", "testpet2", "spritesheet.png"), png(384, 468));

import { describe, expect, it } from "vitest";
import { atlasGeometry, sourceRect } from "../web/src/atlas.js";

describe("atlasGeometry", () => {
  it("accepts canonical 8x9 sheets at full and scaled sizes", () => {
    expect(atlasGeometry(1536, 1872)).toEqual({ columns: 8, rows: 9, frameWidth: 192, frameHeight: 208 });
    expect(atlasGeometry(384, 468)).toEqual({ columns: 8, rows: 9, frameWidth: 48, frameHeight: 52 });
    expect(atlasGeometry(96, 117)).toEqual({ columns: 8, rows: 9, frameWidth: 12, frameHeight: 13 });
  });

  it("accepts canonical 8x11 sheets", () => {
    expect(atlasGeometry(1536, 2288)).toEqual({ columns: 8, rows: 11, frameWidth: 192, frameHeight: 208 });
  });

  it("rejects sheets whose frame height is not an integer", () => {
    expect(atlasGeometry(256, 312)).toBeNull();
  });

  it("rejects sheets with a row count other than 9 or 11", () => {
    expect(atlasGeometry(1536, 2000)).toBeNull();
    expect(atlasGeometry(100, 100)).toBeNull();
  });

  it("rejects non-integer and non-positive sizes", () => {
    expect(atlasGeometry(1536.5, 1872)).toBeNull();
    expect(atlasGeometry(1536, 1872.5)).toBeNull();
    expect(atlasGeometry(0, 0)).toBeNull();
    expect(atlasGeometry(-1536, -1872)).toBeNull();
    expect(atlasGeometry(Number.NaN, Number.NaN)).toBeNull();
  });
});

describe("sourceRect", () => {
  it("maps a frame to its cell in a scaled sheet", () => {
    const geometry = atlasGeometry(384, 468);
    expect(geometry).not.toBeNull();
    expect(sourceRect(geometry!, 7, 2)).toEqual({ sx: 96, sy: 364, sw: 48, sh: 52 });
  });

  it("maps a frame to its cell in the full-size sheet", () => {
    const geometry = atlasGeometry(1536, 1872);
    expect(geometry).not.toBeNull();
    expect(sourceRect(geometry!, 0, 6)).toEqual({ sx: 1152, sy: 0, sw: 192, sh: 208 });
  });

  it("wraps frames across the eight columns", () => {
    const geometry = atlasGeometry(1536, 2288);
    expect(geometry).not.toBeNull();
    expect(sourceRect(geometry!, 10, 11)).toEqual({ sx: 576, sy: 2080, sw: 192, sh: 208 });
  });
});

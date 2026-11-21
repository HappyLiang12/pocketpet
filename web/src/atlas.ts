export type AtlasGeometry = { columns: 8; rows: 9 | 11; frameWidth: number; frameHeight: number };

const COLUMNS = 8;
const FRAME_RATIO_W = 192;
const FRAME_RATIO_H = 208;

/**
 * Derives the cell geometry of a Petdex atlas from its pixel dimensions.
 * Petdex sheets are always eight columns wide; the height must be exactly
 * nine or eleven rows of 192x208-proportioned cells. Scaled sheets (for
 * example 384x468 with 48x52 cells) are accepted and keep the same row
 * layout, so drawing must use the returned frame size instead of a constant.
 */
export function atlasGeometry(width: number, height: number): AtlasGeometry | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null;
  if (width % COLUMNS !== 0) return null;
  const frameWidth = width / COLUMNS;
  const frameHeightNumerator = frameWidth * FRAME_RATIO_H;
  if (frameHeightNumerator % FRAME_RATIO_W !== 0) return null;
  const frameHeight = frameHeightNumerator / FRAME_RATIO_W;
  if (!Number.isInteger(frameHeight) || frameHeight <= 0) return null;
  const rows = height / frameHeight;
  if (!Number.isInteger(rows) || (rows !== 9 && rows !== 11)) return null;
  if (width * rows * FRAME_RATIO_H !== height * COLUMNS * FRAME_RATIO_W) return null;
  return { columns: COLUMNS, rows, frameWidth, frameHeight };
}

export function sourceRect(geometry: AtlasGeometry, row: number, frame: number): { sx: number; sy: number; sw: number; sh: number } {
  const column = frame % geometry.columns;
  return {
    sx: column * geometry.frameWidth,
    sy: row * geometry.frameHeight,
    sw: geometry.frameWidth,
    sh: geometry.frameHeight,
  };
}

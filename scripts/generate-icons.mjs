/**
 * Generate the PWA icons.
 *
 * Writes PNGs directly rather than pulling in an image library: the mark
 * is pure geometry, so a few lines of pixel maths and zlib are enough.
 *
 *   node scripts/generate-icons.mjs
 *
 * Re-run only when the mark changes; the output is committed.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const BLUE = [47, 129, 247, 255];
const WHITE = [255, 255, 255, 255];
const DARK = [13, 17, 23, 255];

// --- Minimal PNG encoder ----------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  // compression, filter, interlace all 0

  // One filter byte (0 = None) per scanline.
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const from = y * width * 4;
    raw[y * (1 + width * 4)] = 0;
    rgba.copy(raw, y * (1 + width * 4) + 1, from, from + width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- The mark ---------------------------------------------------------------

/**
 * A locator: a ring with a solid centre dot.
 *
 * `scale` shrinks the mark for the maskable variant, whose content must
 * sit inside the central safe zone — an OS is free to crop the corners to
 * whatever shape it likes.
 */
function drawIcon(size, { background, scale = 1 }) {
  const rgba = Buffer.alloc(size * size * 4);
  const centre = (size - 1) / 2;

  const ringOuter = size * 0.34 * scale;
  const ringInner = size * 0.25 * scale;
  const dot = size * 0.11 * scale;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x - centre, y - centre);

      let colour = background;
      if (distance <= dot) colour = WHITE;
      else if (distance >= ringInner && distance <= ringOuter) colour = WHITE;

      // Soften the ring and dot edges, so the mark does not look jagged
      // at small sizes.
      const edge = Math.min(
        Math.abs(distance - dot),
        Math.abs(distance - ringInner),
        Math.abs(distance - ringOuter),
      );
      const alpha = edge < 1 ? edge : 1;
      const blended =
        colour === background
          ? background
          : background.map((b, i) => Math.round(b + (colour[i] - b) * alpha));

      const offset = (y * size + x) * 4;
      rgba[offset] = blended[0];
      rgba[offset + 1] = blended[1];
      rgba[offset + 2] = blended[2];
      rgba[offset + 3] = 255;
    }
  }

  return encodePng(size, size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });

const icons = [
  ['icon-192.png', drawIcon(192, { background: BLUE })],
  ['icon-512.png', drawIcon(512, { background: BLUE })],
  // Maskable: full-bleed background, mark inside the safe zone.
  ['icon-maskable-512.png', drawIcon(512, { background: BLUE, scale: 0.62 })],
  // iOS does not apply maskable rules and shows the icon as supplied.
  ['apple-touch-icon.png', drawIcon(180, { background: DARK })],
];

for (const [name, data] of icons) {
  writeFileSync(join(OUT_DIR, name), data);
  console.log(`${name}  ${(data.length / 1024).toFixed(1)} kB`);
}

// Draws the tray icon (a little mochi silhouette) as PNG with no dependencies.
// Usage: node scripts/make-icons.js

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixelAt) {
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x += 1) Buffer.from(pixelAt(x, y)).copy(row, 1 + x * 4);
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

// Shape in a 0..1 unit square, sampled 4x4 per pixel for smooth edges.
function coverage(u, v) {
  const body = inEllipse(u, v, 0.5, 0.62, 0.42, 0.32);
  const ears = inEllipse(u, v, 0.3, 0.3, 0.09, 0.12) || inEllipse(u, v, 0.7, 0.3, 0.09, 0.12);
  const eyes = inEllipse(u, v, 0.38, 0.6, 0.04, 0.06) || inEllipse(u, v, 0.62, 0.6, 0.04, 0.06);
  return (body || ears) && !eyes;
}

function drawIcon(size, rgb) {
  const SAMPLES = 4;
  return encodePng(size, (x, y) => {
    let hits = 0;
    for (let sy = 0; sy < SAMPLES; sy += 1) {
      for (let sx = 0; sx < SAMPLES; sx += 1) {
        if (coverage((x + (sx + 0.5) / SAMPLES) / size, (y + (sy + 0.5) / SAMPLES) / size)) hits += 1;
      }
    }
    return [...rgb, Math.round((hits / SAMPLES ** 2) * 255)];
  });
}

const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });
// macOS "Template" images must be black + alpha; the system tints them.
fs.writeFileSync(path.join(outDir, 'trayTemplate.png'), drawIcon(16, [0, 0, 0]));
fs.writeFileSync(path.join(outDir, 'trayTemplate@2x.png'), drawIcon(32, [0, 0, 0]));
fs.writeFileSync(path.join(outDir, 'tray.png'), drawIcon(32, [255, 138, 91]));
process.stdout.write(`icons written to ${outDir}\n`);

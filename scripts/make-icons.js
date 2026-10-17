// Draws the tray icon (a little mochi silhouette) as PNG with no dependencies.
// Usage: node scripts/make-icons.js

const fs = require('node:fs');
const path = require('node:path');
const { encodePng } = require('./png');

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
  return encodePng(size, size, (x, y) => {
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

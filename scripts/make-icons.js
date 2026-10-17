// App icon and tray icon, drawn from the same pixel mochi as the default character.
// Usage: node scripts/make-icons.js
//
// build/icon.png    1024×1024 app icon (electron-builder turns it into .icns / .ico)
// assets/tray*.png  menu-bar / tray icons

const fs = require('node:fs');
const path = require('node:path');
const { encodePng } = require('./png');
const { drawFrame, paletteFor, FRAMES, ROOM_HUES } = require('./make-sprites');

const GRID = 64; // the app icon is designed on a 64×64 pixel grid, then scaled ×16
const APP_ICON_SIZE = 1024;
const INK = [43, 36, 32, 255];
const WHITE = [255, 250, 240, 255];
const ORANGE = [255, 138, 91, 255];
const ORANGE_DARK = [224, 104, 60, 255];
const ORANGE_LIGHT = [255, 170, 130, 255];
const CLEAR = [0, 0, 0, 0];

/** Rounded square, inset like a macOS icon, with a light top edge and a darker bottom. */
function background(x, y) {
  const lo = 4;
  const hi = GRID - 5;
  const r = 12;
  if (x < lo || x > hi || y < lo || y > hi) return null;
  const cx = Math.min(Math.max(x, lo + r), hi - r);
  const cy = Math.min(Math.max(y, lo + r), hi - r);
  if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) return null;
  if (y >= hi - 2) return ORANGE_DARK;
  if (y <= lo + 1) return ORANGE_LIGHT;
  return ORANGE;
}

/** Little speech bubble with "…" in the top right: this is a chat app. */
function bubble(x, y) {
  const [x0, x1, y0, y1] = [36, 55, 10, 22];
  const tail = (x === 40 && y === 23) || ((x === 39 || x === 40) && y === 24) || (x === 38 && y === 25);
  if (tail) return INK;
  if (x < x0 || x > x1 || y < y0 || y > y1) return null;
  const corner = (x === x0 || x === x1) && (y === y0 || y === y1);
  if (corner) return null;
  const edge = x === x0 || x === x1 || y === y0 || y === y1;
  if (edge) return INK;
  const dot = (y === 16 || y === 17) && [40, 41, 45, 46, 50, 51].includes(x);
  return dot ? INK : WHITE;
}

function drawAppIcon() {
  const mochi = drawFrame(FRAMES[2][0], paletteFor(ROOM_HUES[0])); // mint, talking
  const offset = { x: 11, y: 26 }; // 32×32 sprite, feet near the bottom of the tile
  const logical = (x, y) => {
    const fromBubble = bubble(x, y);
    if (fromBubble) return fromBubble;
    const sprite = mochi.get(`${x - offset.x},${y - offset.y}`);
    if (sprite) return sprite;
    return background(x, y) || CLEAR;
  };
  const scale = APP_ICON_SIZE / GRID;
  return encodePng(APP_ICON_SIZE, APP_ICON_SIZE, (x, y) => logical(Math.floor(x / scale), Math.floor(y / scale)));
}

/** Tray icon: the mochi's silhouette (macOS tints "Template" images itself). */
function drawTray(size, rgb) {
  const frame = drawFrame(FRAMES[0][0], paletteFor(ROOM_HUES[0]));
  const scale = 32 / size;
  return encodePng(size, size, (x, y) => {
    const filled = frame.has(`${Math.floor(x * scale)},${Math.floor(y * scale)}`);
    return filled ? [...rgb, 255] : CLEAR;
  });
}

const buildDir = path.join(__dirname, '..', 'build');
const assetsDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(buildDir, { recursive: true });
fs.mkdirSync(assetsDir, { recursive: true });
fs.writeFileSync(path.join(buildDir, 'icon.png'), drawAppIcon());
fs.writeFileSync(path.join(assetsDir, 'trayTemplate.png'), drawTray(16, [0, 0, 0]));
fs.writeFileSync(path.join(assetsDir, 'trayTemplate@2x.png'), drawTray(32, [0, 0, 0]));
fs.writeFileSync(path.join(assetsDir, 'tray.png'), drawTray(32, ORANGE.slice(0, 3)));
process.stdout.write(`app icon → ${buildDir}/icon.png\ntray icons → ${assetsDir}\n`);

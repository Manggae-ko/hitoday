'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { encodePng } = require('./png');
const { drawFrame } = require('./sprites/draw');
const { ROOM_PALETTE, createCanvas, setPx } = require('./sprites/pixel');

const root = path.join(__dirname, '..');
const bytes = (canvas) => encodePng(canvas.width, canvas.height, (x, y) => Array.from(canvas.data.slice((y * canvas.width + x) * 4, (y * canvas.width + x) * 4 + 4)));

function scale(source, width, height, factor, background = null, monochrome = false) {
  const target = createCanvas(width, height);
  if (background) for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const radius = Math.min(x, y, width - 1 - x, height - 1 - y);
    if (radius >= width / 12 || (x >= width / 12 && x < width * 11 / 12) || (y >= width / 12 && y < height * 11 / 12)) setPx(target, x, y, background);
  }
  const dx = Math.floor((width - source.width * factor) / 2);
  const dy = Math.floor((height - source.height * factor) / 2);
  for (let sy = 0; sy < source.height; sy += 1) for (let sx = 0; sx < source.width; sx += 1) {
    const offset = (sy * source.width + sx) * 4;
    if (!source.data[offset + 3]) continue;
    const color = monochrome ? [0, 0, 0, 255] : Array.from(source.data.slice(offset, offset + 4));
    for (let yy = 0; yy < factor; yy += 1) for (let xx = 0; xx < factor; xx += 1) setPx(target, dx + sx * factor + xx, dy + sy * factor + yy, color);
  }
  return target;
}

const ghost = drawFrame('ghost', 'talk', 1, 0);
const icon = createCanvas(16, 16);
const points = [];
for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) if (ghost.data[(y * 16 + x) * 4 + 3]) points.push([x, y]);
const left = Math.min(...points.map(([x]) => x)); const top = Math.min(...points.map(([, y]) => y));
const right = Math.max(...points.map(([x]) => x)); const bottom = Math.max(...points.map(([, y]) => y));
const dx = Math.floor((16 - (right - left + 1)) / 2); const dy = Math.floor((16 - (bottom - top + 1)) / 2);
for (const [x, y] of points) {
  const offset = (y * 16 + x) * 4;
  setPx(icon, dx + x - left, dy + y - top, Array.from(ghost.data.slice(offset, offset + 4)));
}
fs.writeFileSync(path.join(root, 'build/icon.png'), bytes(scale(icon, 1024, 1024, 64, ROOM_PALETTE[0])));

const trayArt = createCanvas(11, 11);
for (let y = 0; y < 11; y += 1) for (let x = 0; x < 11; x += 1) {
  const offset = ((y + 4) * 16 + x + 3) * 4;
  if (ghost.data[offset + 3]) setPx(trayArt, x, y, Array.from(ghost.data.slice(offset, offset + 4)));
}
fs.writeFileSync(path.join(root, 'assets/tray.png'), bytes(scale(trayArt, 16, 16, 1)));
fs.writeFileSync(path.join(root, 'assets/tray@2x.png'), bytes(scale(trayArt, 32, 32, 2)));
fs.writeFileSync(path.join(root, 'assets/trayTemplate.png'), bytes(scale(trayArt, 22, 22, 2, null, true)));
fs.writeFileSync(path.join(root, 'assets/trayTemplate@2x.png'), bytes(scale(trayArt, 44, 44, 4, null, true)));

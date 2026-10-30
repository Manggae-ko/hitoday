'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { encodePng } = require('./png');
const { drawFrame } = require('./sprites/draw');
const { ROOM_PALETTE, createCanvas, setPx } = require('./sprites/pixel');

const root = path.join(__dirname, '..');
const bytes = (canvas) => encodePng(canvas.width, canvas.height, (x, y) => Array.from(canvas.data.slice((y * canvas.width + x) * 4, (y * canvas.width + x) * 4 + 4)));

function scale(source, width, height, background = null, monochrome = false) {
  const target = createCanvas(width, height);
  if (background) for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const radius = Math.min(x, y, width - 1 - x, height - 1 - y);
    if (radius >= width / 12 || (x >= width / 12 && x < width * 11 / 12) || (y >= width / 12 && y < height * 11 / 12)) setPx(target, x, y, background);
  }
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const sx = Math.min(source.width - 1, Math.floor(x * source.width / width));
    const sy = Math.min(source.height - 1, Math.floor(y * source.height / height));
    const offset = (sy * source.width + sx) * 4;
    if (source.data[offset + 3]) setPx(target, x, y, monochrome ? [0, 0, 0, 255] : Array.from(source.data.slice(offset, offset + 4)));
  }
  return target;
}

const ghost = drawFrame('ghost', 'talk', 1, 0);
const head = createCanvas(16, 8);
for (let y = 0; y < 8; y += 1) for (let x = 0; x < 16; x += 1) {
  const offset = (y * 16 + x) * 4;
  if (ghost.data[offset + 3]) setPx(head, x, y, Array.from(ghost.data.slice(offset, offset + 4)));
}
fs.writeFileSync(path.join(root, 'build/icon.png'), bytes(scale(head, 1024, 1024, ROOM_PALETTE[0])));
fs.writeFileSync(path.join(root, 'assets/tray.png'), bytes(scale(ghost, 16, 16)));
fs.writeFileSync(path.join(root, 'assets/tray@2x.png'), bytes(scale(ghost, 32, 32)));
fs.writeFileSync(path.join(root, 'assets/trayTemplate.png'), bytes(scale(ghost, 22, 22, null, true)));
fs.writeFileSync(path.join(root, 'assets/trayTemplate@2x.png'), bytes(scale(ghost, 44, 44, null, true)));

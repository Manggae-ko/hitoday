'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { encodePng } = require('./png');
const { drawFrame, drawSheet } = require('./sprites/draw');
const { ROOM_PALETTE, createCanvas, hexToRgb, setPx } = require('./sprites/pixel');

const root = path.join(__dirname, '..');
const names = ['ghost', 'rabbit', 'penguin'];
const pngFor = (canvas) => encodePng(canvas.width, canvas.height, (x, y) => Array.from(canvas.data.slice((y * canvas.width + x) * 4, (y * canvas.width + x) * 4 + 4)));

function blit(target, source, dx, dy, scale = 1) {
  for (let y = 0; y < source.height; y += 1) for (let x = 0; x < source.width; x += 1) {
    const offset = (y * source.width + x) * 4;
    const rgba = Array.from(source.data.slice(offset, offset + 4));
    if (!rgba[3]) continue;
    for (let yy = 0; yy < scale; yy += 1) for (let xx = 0; xx < scale; xx += 1) setPx(target, dx + x * scale + xx, dy + y * scale + yy, rgba);
  }
}

function rgbToLab(hex) {
  const rgb = hexToRgb(hex).map((v) => v / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [x, y, z] = [
    (rgb[0] * 0.4124 + rgb[1] * 0.3576 + rgb[2] * 0.1805) / 0.95047,
    rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722,
    (rgb[0] * 0.0193 + rgb[1] * 0.1192 + rgb[2] * 0.9505) / 1.08883,
  ].map((v) => v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const delta = (a, b) => Math.sqrt(rgbToLab(a).reduce((sum, v, i) => sum + (v - rgbToLab(b)[i]) ** 2, 0));

fs.mkdirSync(path.join(root, 'src/renderer/sprites'), { recursive: true });
fs.mkdirSync(path.join(root, 'web/sprites'), { recursive: true });
for (const name of names) for (let color = 0; color < ROOM_PALETTE.length; color += 1) {
  const bytes = pngFor(drawSheet(name, color));
  fs.writeFileSync(path.join(root, 'src/renderer/sprites', `${name}-${color}.png`), bytes);
  if (name === 'ghost') fs.writeFileSync(path.join(root, 'web/sprites', `${name}-${color}.png`), bytes);
}

const preview = createCanvas(1728, 144);
for (let y = 96; y < 144; y += 1) for (let x = 0; x < preview.width; x += 1) setPx(preview, x, y, '#1f1b18');
for (let species = 0; species < names.length; species += 1) for (let color = 0; color < 12; color += 1) {
  const frame = drawFrame(names[species], 'idle', 0, color);
  const index = species * 12 + color;
  blit(preview, frame, index * 16, 0, 1);
  blit(preview, frame, index * 32, 16, 2);
  blit(preview, frame, index * 48, 48, 3);
  blit(preview, frame, index * 48, 96, 3);
}
fs.writeFileSync(path.join(root, 'docs/characters-preview.png'), pngFor(preview));
const template = createCanvas(64, 64);
blit(template, drawFrame('ghost', 'idle', 0, 0), 0, 0, 1);
blit(template, drawFrame('rabbit', 'idle', 0, 0), 24, 0, 1);
blit(template, drawFrame('penguin', 'idle', 0, 0), 48, 0, 1);
fs.writeFileSync(path.join(root, 'docs/character-template.png'), pngFor(template));

const keyPairs = [[0, 1], [0, 2], [1, 2]].map(([a, b]) => `${a}-${b}=${delta(ROOM_PALETTE[a], ROOM_PALETTE[b]).toFixed(1)}`);
let minimum = Infinity;
for (let a = 0; a < 12; a += 1) for (let b = a + 1; b < 12; b += 1) minimum = Math.min(minimum, delta(ROOM_PALETTE[a], ROOM_PALETTE[b]));
console.log(`DeltaE76 ${keyPairs.join(' ')} min=${minimum.toFixed(1)}`);

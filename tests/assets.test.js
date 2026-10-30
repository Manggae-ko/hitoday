const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { CHARACTER_IDS } = require('../shared/characters');
const { ROOM_COLORS } = require('../shared/colors');
const { checkAvatar } = require('../shared/avatar');
const { ROOM_PALETTE, furTint, hexToRgb, mix } = require('../scripts/sprites/pixel');

const ROOT = path.join(__dirname, '..');
const SPRITES = path.join(ROOT, 'src', 'renderer', 'sprites');

function decodePng(bytes) {
  const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20);
  const chunks = []; let offset = 8;
  while (offset < bytes.length) { const length = bytes.readUInt32BE(offset); const type = bytes.toString('ascii', offset + 4, offset + 8); if (type === 'IDAT') chunks.push(bytes.subarray(offset + 8, offset + 8 + length)); offset += 12 + length; }
  const raw = zlib.inflateSync(Buffer.concat(chunks)); const pixels = Buffer.alloc(width * height * 4); const stride = width * 4;
  const paeth = (a, b, c) => { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < height; y += 1) for (let x = 0; x < stride; x += 1) { const filter = raw[y * (stride + 1)]; const value = raw[y * (stride + 1) + 1 + x]; const left = x >= 4 ? pixels[y * stride + x - 4] : 0; const up = y ? pixels[(y - 1) * stride + x] : 0; const corner = y && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0; pixels[y * stride + x] = (value + [0, left, up, Math.floor((left + up) / 2), paeth(left, up, corner)][filter]) & 255; }
  return { width, height, pixels };
}

const rgbaAt = (image, x, y) => Array.from(image.pixels.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4));
const lab = (rgb) => { const c = rgb.map((v) => v / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); const xyz = [(c[0] * .4124 + c[1] * .3576 + c[2] * .1805) / .95047, c[0] * .2126 + c[1] * .7152 + c[2] * .0722, (c[0] * .0193 + c[1] * .1192 + c[2] * .9505) / 1.08883].map((v) => v > .008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116); return [116 * xyz[1] - 16, 500 * (xyz[0] - xyz[1]), 200 * (xyz[1] - xyz[2])]; };
const delta = (a, b) => Math.sqrt(lab(a).reduce((sum, v, i) => sum + (v - lab(b)[i]) ** 2, 0));
const hex = (value) => [1, 3, 5].map((i) => Number.parseInt(value.slice(i, i + 2), 16));

test('every sheet is a 64×64 RGBA sheet', () => {
  CHARACTER_IDS.forEach((id) => { for (let color = 0; color < ROOM_COLORS; color += 1) { const file = path.join(SPRITES, `${id}-${color}.png`); assert.ok(fs.existsSync(file), `missing ${id}-${color}.png`); const bytes = fs.readFileSync(file); const image = decodePng(bytes); assert.deepEqual([image.width, image.height], [64, 64]); assert.equal(bytes[24], 8); assert.equal(bytes[25], 6); assert.equal(checkAvatar(bytes).kind, 'sheet'); } });
});

test('sheet cells: unused transparent, used drawn, height budget', () => {
  const counts = [2, 4, 2, 2];
  CHARACTER_IDS.forEach((id) => { for (let color = 0; color < ROOM_COLORS; color += 1) { const image = decodePng(fs.readFileSync(path.join(SPRITES, `${id}-${color}.png`))); for (let row = 0; row < 4; row += 1) for (let column = 0; column < 4; column += 1) { const points = []; for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) if (rgbaAt(image, column * 16 + x, row * 16 + y)[3]) points.push([x, y]); if (column >= counts[row]) assert.equal(points.length, 0, `${id}-${color} unused ${row},${column}`); else { assert.ok(points.length, `${id}-${color} empty ${row},${column}`); const xs = points.map((p) => p[0]); const ys = points.map((p) => p[1]); assert.ok(Math.min(...ys) >= 1); assert.equal(Math.max(...ys), 15); assert.ok(Math.max(...xs) - Math.min(...xs) + 1 <= 11); if (row === 0) assert.ok(Math.max(...ys) - Math.min(...ys) + 1 <= (id === 'rabbit' ? 15 : 13)); } } } });
});

test('palette: room colors are far apart', () => {
  for (let a = 0; a < ROOM_PALETTE.length; a += 1) for (let b = a + 1; b < ROOM_PALETTE.length; b += 1) assert.ok(delta(hex(ROOM_PALETTE[a]), hex(ROOM_PALETTE[b])) >= (a < 3 && b < 3 ? 30 : 12), `${a}-${b}`);
});

test('palette: body tints differ for every species', () => {
  CHARACTER_IDS.forEach((id) => { const averages = [0, 1, 2].map((color) => { const image = decodePng(fs.readFileSync(path.join(SPRITES, `${id}-${color}.png`))); const colors = []; for (let y = 1; y < 15; y += 1) for (let x = 4; x < 13; x += 1) { const p = rgbaAt(image, x, y); if (p[3] && p.slice(0, 3).join() !== '58,47,42' && p.slice(0, 3).join() !== '36,29,26') colors.push(p); } const family = [hexToRgb(ROOM_PALETTE[color]), hexToRgb(furTint('#fffaf2', color)), hexToRgb(mix('#242a32', ROOM_PALETTE[color], .48))].map((p) => p.join()); assert.ok(colors.filter((p) => family.includes(p.slice(0, 3).join())).length / colors.length >= .2, `${id}-${color} room-color area`); return [0, 1, 2].map((channel) => colors.reduce((sum, p) => sum + p[channel], 0) / colors.length); }); assert.ok(delta(averages[0], averages[1]) >= 10, `${id} 0-1`); assert.ok(delta(averages[0], averages[2]) >= 10, `${id} 0-2`); assert.ok(delta(averages[1], averages[2]) >= 10, `${id} 1-2`); });
});

test('the renderer knows the same characters as the shared list', () => { const source = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'character.js'), 'utf8'); const listed = source.match(/CHARACTER_IDS = \[([^\]]+)\]/)[1].match(/'([a-z]+)'/g).map((s) => s.slice(1, -1)); assert.deepEqual(listed, CHARACTER_IDS); });
test('web sprites exist for ghost', () => { for (let color = 0; color < ROOM_COLORS; color += 1) assert.ok(fs.readFileSync(path.join(ROOT, 'web/sprites', `ghost-${color}.png`)).equals(fs.readFileSync(path.join(SPRITES, `ghost-${color}.png`)))); });

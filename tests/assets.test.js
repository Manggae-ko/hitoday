const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { CHARACTER_IDS } = require('../shared/characters');
const { ROOM_COLORS } = require('../shared/colors');
const { checkAvatar } = require('../shared/avatar');
const { ROOM_PALETTE } = require('../scripts/sprites/pixel');
const { designs, OUTLINE, EYE, BASE } = require('../scripts/sprites/species');

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
const colorKey = (rgba) => rgba.slice(0, 3).join();
const framePixels = (image, row, column) => {
  const pixels = [];
  for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) {
    const rgba = rgbaAt(image, column * 16 + x, row * 16 + y);
    if (rgba[3]) pixels.push({ x, y, rgba });
  }
  return pixels;
};
const signature = (points) => points.map(({ x, y, rgba }) => `${x},${y},${rgba.join(',')}`).join('|');
const averageRgb = (points) => [0, 1, 2].map((channel) => points.reduce((sum, { rgba }) => sum + rgba[channel], 0) / points.length);

test('every sheet is a 64×64 RGBA sheet', () => {
  CHARACTER_IDS.forEach((id) => { for (let color = 0; color < ROOM_COLORS; color += 1) { const file = path.join(SPRITES, `${id}-${color}.png`); assert.ok(fs.existsSync(file), `missing ${id}-${color}.png`); const bytes = fs.readFileSync(file); const image = decodePng(bytes); assert.deepEqual([image.width, image.height], [64, 64]); assert.equal(bytes[24], 8); assert.equal(bytes[25], 6); assert.equal(checkAvatar(bytes).kind, 'sheet'); } });
});

test('sheet cells enforce geometry, animation, eyes, and outline contracts', () => {
  const counts = [2, 4, 2, 2];
  const outline = hex(OUTLINE).join(); const eye = hex('#241d1a').join();
  CHARACTER_IDS.forEach((id) => {
    assert.ok(designs[id].bodyW <= 8, `${id} bodyW metadata`);
    for (let color = 0; color < ROOM_COLORS; color += 1) {
      const image = decodePng(fs.readFileSync(path.join(SPRITES, `${id}-${color}.png`)));
      for (let row = 0; row < 4; row += 1) for (let column = 0; column < 4; column += 1) {
        const points = framePixels(image, row, column);
        if (column >= counts[row]) { assert.equal(points.length, 0, `${id}-${color} unused ${row},${column}`); continue; }
        assert.ok(points.length, `${id}-${color} empty ${row},${column}`);
        const xs = points.map(({ x }) => x); const ys = points.map(({ y }) => y);
        assert.ok(Math.min(...ys) >= 1); assert.equal(Math.max(...ys), 15, `${id}-${color} feet y`);
        assert.ok(Math.max(...ys) - Math.min(...ys) + 1 <= designs[id].maxHeight, `${id}-${color} height ${row},${column}`);
        assert.ok(Math.max(...xs) - Math.min(...xs) + 1 <= 11);
        points.forEach(({ x, y, rgba }) => {
          const boundary = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
            const xx = x + dx; const yy = y + dy;
            return xx < 0 || yy < 0 || xx > 15 || yy > 15 || rgbaAt(image, column * 16 + xx, row * 16 + yy)[3] === 0;
          });
          if (boundary) assert.equal(colorKey(rgba), outline, `${id}-${color} outline ${row},${column} @${x},${y}`);
        });
      }
      const idleEyes = framePixels(image, 0, 0).filter(({ rgba }) => colorKey(rgba) === eye);
      const bodyFill = framePixels(image, 0, 0).filter(({ y, rgba }) => y >= 11 && y <= 13 && colorKey(rgba) !== outline);
      const bodyXs = bodyFill.map(({ x }) => x);
      // This measures rendered fill, without coordinate-clipping x first: widening it to 9px must fail.
      assert.ok(bodyXs.length, `${id} body fill sample`);
      assert.ok(Math.max(...bodyXs) - Math.min(...bodyXs) + 1 <= designs[id].bodyW, `${id} actual bodyW`);
      const sleepEyes = framePixels(image, 3, 0).filter(({ rgba }) => colorKey(rgba) === eye);
      assert.deepEqual(idleEyes.map(({ x, y }) => [x, y]), [[7, idleEyes[0].y], [9, idleEyes[0].y], [7, idleEyes[0].y + 1], [9, idleEyes[0].y + 1]], `${id} idle eyes`);
      assert.deepEqual(sleepEyes.map(({ x, y }) => [x, y]), [[6, sleepEyes[0].y], [7, sleepEyes[0].y], [9, sleepEyes[0].y], [10, sleepEyes[0].y]], `${id} sleep eyes`);
      assert.notEqual(signature(framePixels(image, 0, 0)), signature(framePixels(image, 0, 1)), `${id} idle frames`);
      assert.equal(new Set([0, 1, 2, 3].map((column) => signature(framePixels(image, 1, column)))).size, 4, `${id} walk frames`);
      const idleTop = Math.min(...framePixels(image, 0, 0).map(({ y }) => y));
      const sleepTop = Math.min(...framePixels(image, 3, 0).map(({ y }) => y));
      assert.equal(sleepTop, idleTop + 1, `${id} sleep crouch`);
    }
  });
});

test('talk frame opens a mouth pixel on every species', () => {
  CHARACTER_IDS.forEach((id) => {
    const image = decodePng(fs.readFileSync(path.join(SPRITES, `${id}-0.png`)));
    const closed = framePixels(image, 2, 0).filter(({ rgba }) => colorKey(rgba) === hex(EYE).join()).length;
    const opened = framePixels(image, 2, 1).filter(({ rgba }) => colorKey(rgba) === hex(EYE).join()).length;
    assert.equal(opened, closed + 1, `${id} talk mouth`);
  });
});

test('palette: room colors are far apart', () => {
  for (let a = 0; a < ROOM_PALETTE.length; a += 1) for (let b = a + 1; b < ROOM_PALETTE.length; b += 1) assert.ok(delta(hex(ROOM_PALETTE[a]), hex(ROOM_PALETTE[b])) >= (a < 3 && b < 3 ? 30 : 12), `${a}-${b}`);
});

test('species keep fixed base colors; only the scarf carries the room color', () => {
  const base = { ghost: BASE.W, rabbit: BASE.W, penguin: BASE.K };
  CHARACTER_IDS.forEach((id) => {
    const reference = framePixels(decodePng(fs.readFileSync(path.join(SPRITES, `${id}-0.png`))), 0, 0);
    for (let color = 0; color < ROOM_COLORS; color += 1) {
      const image = decodePng(fs.readFileSync(path.join(SPRITES, `${id}-${color}.png`)));
      const points = framePixels(image, 0, 0);
      const room = hex(ROOM_PALETTE[color]).join();
      const scarf = points.filter(({ rgba }) => colorKey(rgba) === room);
      assert.ok(scarf.length >= 4 && scarf.length <= 8, `${id}-${color} scarf pixels ${scarf.length}`);
      const body = points.filter(({ rgba }) => ![hex(OUTLINE).join(), hex(EYE).join(), room].includes(colorKey(rgba)));
      const baseShare = body.filter(({ rgba }) => colorKey(rgba) === hex(base[id]).join()).length / body.length;
      assert.ok(baseShare >= (id === 'penguin' ? 0.4 : 0.5), `${id}-${color} base color share ${baseShare}`); // 펭귄은 흰 얼굴·배가 커서 검정 비율이 낮음
      // 방 색 외에는 12색 모두 같은 그림
      const strip = (list) => list.filter(({ rgba }) => colorKey(rgba) !== room && !ROOM_PALETTE.some((h) => hex(h).join() === colorKey(rgba)));
      assert.equal(signature(strip(points)), signature(strip(reference)), `${id}-${color} differs beyond scarf`);
    }
  });
});

test('species accents are present: ghost blush, rabbit pink ear and nose, penguin orange beak and feet', () => {
  const has = (id, hexColor, min) => { const image = decodePng(fs.readFileSync(path.join(SPRITES, `${id}-0.png`))); return framePixels(image, 0, 0).filter(({ rgba }) => colorKey(rgba) === hex(hexColor).join()).length >= min; };
  assert.ok(has('ghost', BASE.B, 2)); assert.ok(has('rabbit', BASE.P, 4)); assert.ok(has('penguin', BASE.O, 4)); assert.ok(has('penguin', BASE.W, 10));
});

test('app and tray icons have the required IHDR sizes', () => {
  const outputs = [['build/icon.png', 1024], ['assets/tray.png', 16], ['assets/tray@2x.png', 32], ['assets/trayTemplate.png', 22], ['assets/trayTemplate@2x.png', 44]];
  outputs.forEach(([file, size]) => {
    const image = decodePng(fs.readFileSync(path.join(ROOT, file)));
    assert.deepEqual([image.width, image.height], [size, size], file);
  });
});

test('the renderer knows the same characters as the shared list', () => { const source = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'character.js'), 'utf8'); const listed = source.match(/CHARACTER_IDS = \[([^\]]+)\]/)[1].match(/'([a-z]+)'/g).map((s) => s.slice(1, -1)); assert.deepEqual(listed, CHARACTER_IDS); });
test('web sprites exist for ghost', () => { for (let color = 0; color < ROOM_COLORS; color += 1) assert.ok(fs.readFileSync(path.join(ROOT, 'web/sprites', `ghost-${color}.png`)).equals(fs.readFileSync(path.join(SPRITES, `ghost-${color}.png`)))); });

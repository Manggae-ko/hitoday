'use strict';

const { createCanvas, setPx } = require('./pixel');
const { drawAnimal } = require('./species');

function drawFrame(name, pose, frame, colorIndex) {
  const canvas = createCanvas(16, 16);
  drawAnimal(canvas, name, pose, frame, colorIndex);
  return canvas;
}

function drawSheet(name, colorIndex) {
  const sheet = createCanvas(64, 64);
  const rows = [['idle', 2], ['walk', 4], ['talk', 2], ['sleep', 2]];
  rows.forEach(([pose, count], row) => {
    for (let column = 0; column < count; column += 1) {
      const frame = drawFrame(name, pose, column, colorIndex);
      for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) {
        const offset = (y * 16 + x) * 4;
        if (frame.data[offset + 3]) setPx(sheet, column * 16 + x, row * 16 + y, Array.from(frame.data.slice(offset, offset + 4)));
      }
    }
  });
  return sheet;
}

module.exports = { drawFrame, drawSheet };

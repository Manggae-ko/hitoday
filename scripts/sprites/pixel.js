'use strict';

const ROOM_PALETTE = [
  '#e84a5f', '#2878d0', '#26965c', '#d39b20', '#8056b3', '#168d8d',
  '#e16d2f', '#536b36', '#c04b91', '#527aa3', '#a36b45', '#707070',
];

const createCanvas = (width, height) => ({ width, height, data: new Uint8Array(width * height * 4) });

function hexToRgb(hex) {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

const toHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

function setPx(canvas, x, y, color) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  const rgba = Array.isArray(color) ? color : [...hexToRgb(color), 255];
  canvas.data.set(rgba, (y * canvas.width + x) * 4);
}

function rect(canvas, x, y, width, height, color) {
  for (let yy = y; yy < y + height; yy += 1) for (let xx = x; xx < x + width; xx += 1) setPx(canvas, xx, yy, color);
}



module.exports = { ROOM_PALETTE, createCanvas, setPx, rect, hexToRgb };

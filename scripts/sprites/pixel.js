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

function furTint(_baseHex, roomIndex) {
  const [r, g, b] = hexToRgb(ROOM_PALETTE[roomIndex]).map((v) => v / 255);
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const range = max - min;
  let hue = 0;
  if (range && max === r) hue = ((g - b) / range + (g < b ? 6 : 0)) / 6;
  else if (range && max === g) hue = ((b - r) / range + 2) / 6;
  else if (range) hue = ((r - g) / range + 4) / 6;
  const saturation = range ? 0.3 : 0; const lightness = 0.82;
  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const channel = (t) => { const value = (t + 1) % 1; if (value < 1 / 6) return p + (q - p) * 6 * value; if (value < 1 / 2) return q; if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6; return p; };
  return toHex([channel(hue + 1 / 3), channel(hue), channel(hue - 1 / 3)].map((v) => v * 255));
}

function roomTone(roomIndex, saturation, lightness) {
  const [r, g, b] = hexToRgb(ROOM_PALETTE[roomIndex]).map((v) => v / 255);
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const range = max - min;
  let hue = 0;
  if (range && max === r) hue = ((g - b) / range + (g < b ? 6 : 0)) / 6;
  else if (range && max === g) hue = ((b - r) / range + 2) / 6;
  else if (range) hue = ((r - g) / range + 4) / 6;
  const sat = range ? saturation : 0;
  const q = lightness < 0.5 ? lightness * (1 + sat) : lightness + sat - lightness * sat;
  const p = 2 * lightness - q;
  const channel = (t) => { const value = (t + 1) % 1; if (value < 1 / 6) return p + (q - p) * 6 * value; if (value < 1 / 2) return q; if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6; return p; };
  return toHex([channel(hue + 1 / 3), channel(hue), channel(hue - 1 / 3)].map((v) => v * 255));
}

module.exports = { ROOM_PALETTE, createCanvas, setPx, rect, hexToRgb, furTint, roomTone };

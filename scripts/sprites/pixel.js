// Small pixel-art toolkit: colors and shape tests on a 32×32 grid.

function hsl(h, s, l) {
  const sat = s / 100;
  const light = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255), 255];
}

const hex = (value) => {
  const n = parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};

/** Shape tests take a pixel (x, y) and say whether its center is inside. */
const ellipse = (cx, cy, rx, ry) => (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;

/** Upward-pointing triangle: apex at (ax, ay), base at baseY with the given half width. */
const triangle = (ax, ay, baseY, halfWidth) => (x, y) => {
  const py = y + 0.5;
  if (py < ay || py > baseY) return false;
  return Math.abs(x + 0.5 - ax) <= ((py - ay) / (baseY - ay)) * halfWidth;
};

const any = (...tests) => (x, y) => tests.some((t) => t(x, y));
const pixelsAt = (points) => (x, y) => points.some(([px, py]) => px === x && py === y);

module.exports = { hsl, hex, ellipse, triangle, any, pixelsAt };

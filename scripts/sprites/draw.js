// Draws one 32×32 frame of a character. Every character shares the same chibi
// body plan (round body, little arms and feet, face one pixel right of center
// because they face right); species add ears, tails, bellies and faces on top.

const { hsl, ellipse } = require('./pixel');

const CELL = 32;
const INK = [43, 36, 32, 255];
const CHEEK = [255, 150, 150, 255];
// Same order as the room color seats (shared/colors.js has 12 seats).
const ROOM_HUES = [150, 330, 220, 35, 275, 95, 0, 190, 305, 60, 245, 15];

const FRAMES = [
  // idle: breathe
  [{}, { squash: 0.7 }],
  // walk: bob + alternating feet
  [
    { feet: [[11, 29.5], [21, 28.8]] },
    { dy: -1, feet: [[12, 29.5], [20, 29.5]] },
    { feet: [[11, 28.8], [21, 29.5]] },
    { dy: -1, feet: [[12, 29.5], [20, 29.5]] },
  ],
  // talk: mouth open + waving arm
  [{ mouth: 'open', arm: 'up' }, { mouth: 'smile', arm: 'wave' }],
  // sleep: eyes shut, squashed, slow breathe
  [{ eyes: 'closed', mouth: 'flat', squash: 1.2 }, { eyes: 'closed', mouth: 'flat', squash: 1.8 }],
];

const seatColors = (hue) => ({ main: hsl(hue, 75, 62), dark: hsl(hue, 60, 46) });

/** Body fill with a light top-left and a shaded bottom-right. */
const shadedBody = (g, pal) => (x, y) => {
  const nx = (x + 0.5 - g.cx) / g.rx;
  const ny = (y + 0.5 - g.cy) / g.ry;
  if (nx + ny > 0.95) return pal.shade;
  if (nx + ny < -1.0) return pal.light;
  return pal.body;
};

const MOUTHS = {
  smile: (fy) => [[15, fy + 2], [16, fy + 3], [17, fy + 3], [18, fy + 2]],
  open: (fy) => [[16, fy + 2], [17, fy + 2], [16, fy + 3], [17, fy + 3]],
  flat: (fy) => [[16, fy + 3], [17, fy + 3]],
};

/** The usual face: two eyes, rosy cheeks, a small mouth. Species can tweak or replace it. */
function defaultFace(put, g, s, opts = {}) {
  const { eyeX = [13, 20], cheeks = true, mouth = true } = opts;
  const { fy } = g;
  if (s.eyes === 'open') eyeX.forEach((x) => { put(x, fy, INK); put(x, fy + 1, INK); });
  else eyeX.forEach((x) => { put(x - 1, fy + 1, INK); put(x, fy + 1, INK); });
  if (cheeks) [[10, fy + 3], [11, fy + 3], [22, fy + 3], [23, fy + 3]].forEach(([x, y]) => put(x, y, CHEEK));
  if (mouth) MOUTHS[s.mouth](fy).forEach(([x, y]) => put(x, y, INK));
}

/**
 * @param kind     a species definition (see species.js)
 * @param spec     one frame from FRAMES
 * @param seatHue  the room color: animals wear it as a scarf, mochi is made of it
 * @returns Map of "x,y" -> [r, g, b, a]
 */
function drawCharacter(kind, spec, seatHue) {
  const s = { dy: 0, squash: 0, feet: [[11, 29.5], [21, 29.5]], eyes: 'open', mouth: 'smile', arm: 'down', ...spec };
  const body = { rx: 11.6, ry: 9.5, cy: 20, ...(kind.body || {}) };
  const dy = s.dy + (kind.hover || 0);
  const ry = body.ry - s.squash;
  const cy = body.cy + dy + s.squash; // keep the bottom on the ground while squashing
  const g = { cx: 16, cy, rx: body.rx, ry, dy, top: cy - ry, fy: Math.round(cy - 1) };
  const pal = kind.palette(seatHue);
  const seat = seatColors(seatHue);

  // Layers paint back to front. "inside" layers only recolor pixels that are already filled,
  // so bellies and scarves never change the silhouette.
  const layers = [];
  const add = (test, color, inside = false) => layers.push({ test, color, inside });

  if (kind.behind) kind.behind(add, g, pal, s);
  if (!kind.noFeet) s.feet.forEach(([x, y]) => add(ellipse(x, y, 3, 1.8), pal.feet || pal.shade));
  const armR = { down: [27.6, 22.5 + dy], up: [28.4, 14.5 + dy], wave: [29, 17.5 + dy] }[s.arm];
  add(ellipse(4.4, 22.5 + dy, 2.2, 2.8), pal.arm || pal.shade);
  add(ellipse(armR[0], armR[1], 2.2, 2.8), pal.arm || pal.shade);
  if (kind.ears) kind.ears(add, g, pal, s);
  add(kind.bodyShape ? kind.bodyShape(g) : ellipse(g.cx, g.cy, g.rx, g.ry), shadedBody(g, pal));
  if (kind.front) kind.front(add, g, pal, s);
  if (kind.scarf !== false) {
    const sy = Math.round(g.cy + g.ry * 0.5);
    add((x, y) => y === sy, seat.main, true);
    add((x, y) => y === sy + 1, seat.dark, true);
  }

  const pixels = new Map();
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      layers.forEach(({ test, color, inside }) => {
        const key = `${x},${y}`;
        if (!test(x, y) || (inside && !pixels.has(key))) return;
        pixels.set(key, typeof color === 'function' ? color(x, y) : color);
      });
    }
  }

  // Silhouette outline: empty pixels touching the character.
  const outline = [];
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      if (pixels.has(`${x},${y}`)) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => pixels.has(`${x + ox},${y + oy}`))) outline.push(`${x},${y}`);
    }
  }
  outline.forEach((key) => pixels.set(key, INK));

  const put = (x, y, color) => pixels.set(`${x},${y}`, color);
  if (kind.face) kind.face(put, g, s, pal, defaultFace);
  else defaultFace(put, g, s);
  return pixels;
}

module.exports = { CELL, INK, CHEEK, ROOM_HUES, FRAMES, MOUTHS, drawCharacter, defaultFace };

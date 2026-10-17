// The built-in characters. Each one only describes what makes it different
// from the shared chibi body in draw.js: palette, ears, tail, belly, face.

const { hsl, hex, ellipse, triangle, any, pixelsAt } = require('./pixel');
const { INK, CHEEK, MOUTHS } = require('./draw');

const fixed = (body, shade, light, extra = {}) => () => ({ body: hex(body), shade: hex(shade), light: hex(light), ...extra });
const PINK = hex('#ffb3b8');
const WHITE = hex('#fbf8f2');
const ORANGE = hex('#ff9a3c');

/** Two round ears just above the head. */
const roundEars = (r, color) => (add, g, pal) => {
  add(ellipse(10, g.top + 1.5, r, r * 1.15), color || pal.shade);
  add(ellipse(22, g.top + 1.5, r, r * 1.15), color || pal.shade);
};

/** Two pointed ears with pink insides (and optionally dark tips). */
const pointedEars = (height, halfWidth, tip) => (add, g, pal) => {
  [10, 22].forEach((ax) => {
    const apexY = g.top - height;
    add(triangle(ax, apexY, g.top + 3, halfWidth), (x, y) => (tip && y + 0.5 < apexY + 2.2 ? tip : pal.body));
    add(triangle(ax, apexY + 2.4, g.top + 2, halfWidth - 1.6), PINK, true);
  });
};

const SPECIES = {
  mochi: {
    palette: (hue) => ({ body: hsl(hue, 70, 89), shade: hsl(hue, 42, 74), light: hsl(hue, 85, 96) }),
    ears: roundEars(2.6),
    scarf: false, // mochi is made of its room color
  },

  cat: {
    palette: fixed('#f4b46e', '#d68a4c', '#fcd9ac'),
    ears: pointedEars(4.5, 3.2),
    behind: (add, g, pal) => add(any(ellipse(3.6, g.cy - 2, 1.7, 6), ellipse(4.6, g.cy - 8, 1.7, 1.7)), pal.shade),
    face: (put, g, s, pal, base) => {
      base(put, g, s);
      [[14, Math.round(g.top) + 1], [16, Math.round(g.top)], [18, Math.round(g.top) + 1]].forEach(([x, y]) => put(x, y, pal.shade));
    },
  },

  dog: {
    palette: fixed('#ecd2a8', '#c9a070', '#f8e8cc', { ear: hex('#9b6a3f') }),
    behind: (add, g, pal) => add(ellipse(3.4, g.cy - 3, 1.7, 3), pal.shade),
    front: (add, g, pal) => {
      add(ellipse(7.2, g.top + 5.5, 2.6, 5), pal.ear);
      add(ellipse(24.8, g.top + 5.5, 2.6, 5), pal.ear);
      add(ellipse(17.5, g.fy + 3, 4, 2.6), pal.light, true);
    },
    face: (put, g, s, pal, base) => {
      base(put, g, s, { eyeX: [13, 21], mouth: false });
      const { fy } = g;
      [[17, fy + 2], [18, fy + 2]].forEach(([x, y]) => put(x, y, INK));
      const mouth = s.mouth === 'open' ? [[17, fy + 3], [18, fy + 3], [17, fy + 4], [18, fy + 4]] : [[16, fy + 4], [19, fy + 4], [17, fy + 3], [18, fy + 3]];
      mouth.forEach(([x, y]) => put(x, y, s.mouth === 'flat' ? INK : INK));
    },
  },

  rabbit: {
    palette: fixed('#f6f2ec', '#d6cec4', '#ffffff'),
    body: { cy: 21, ry: 9 },
    ears: (add, g, pal) => {
      add(ellipse(12, g.top - 4.5, 2.1, 6), pal.body);
      add(ellipse(20.5, g.top - 4.5, 2.1, 6), pal.body);
      add(ellipse(12, g.top - 4, 0.9, 4.2), PINK, true);
      add(ellipse(20.5, g.top - 4, 0.9, 4.2), PINK, true);
    },
    face: (put, g, s, pal, base) => {
      base(put, g, s, { mouth: false });
      const { fy } = g;
      put(17, fy + 2, PINK);
      const mouth = s.mouth === 'open' ? [[16, fy + 3], [17, fy + 3], [16, fy + 4], [17, fy + 4]] : [[16, fy + 3], [18, fy + 3]];
      mouth.forEach(([x, y]) => put(x, y, INK));
    },
  },

  bear: {
    palette: fixed('#a8764e', '#835838', '#c9966a', { muzzle: hex('#e3c49a') }),
    ears: roundEars(3, hex('#835838')),
    front: (add, g, pal) => add(ellipse(17.5, g.fy + 3, 4, 2.6), pal.muzzle, true),
    face: (put, g, s, pal, base) => {
      base(put, g, s, { eyeX: [13, 21], mouth: false, cheeks: false });
      const { fy } = g;
      [[17, fy + 2], [18, fy + 2]].forEach(([x, y]) => put(x, y, INK));
      const mouth = s.mouth === 'open' ? [[17, fy + 3], [18, fy + 3], [17, fy + 4], [18, fy + 4]] : [[16, fy + 4], [17, fy + 3], [18, fy + 3], [19, fy + 4]];
      mouth.forEach(([x, y]) => put(x, y, INK));
    },
  },

  penguin: {
    palette: fixed('#3a4058', '#272b3e', '#56607e', { feet: ORANGE, arm: hex('#272b3e') }),
    front: (add, g) => add(ellipse(17, g.cy + 0.8, 8.2, 8.6), WHITE, true),
    face: (put, g, s, pal, base) => {
      base(put, g, s, { eyeX: [14, 20], mouth: false });
      const { fy } = g;
      const beak = s.mouth === 'open'
        ? [[17, fy + 2], [18, fy + 2], [19, fy + 2], [17, fy + 4], [18, fy + 4]]
        : [[17, fy + 2], [18, fy + 2], [19, fy + 2], [18, fy + 3]];
      beak.forEach(([x, y]) => put(x, y, ORANGE));
      if (s.mouth === 'open') [[17, fy + 3], [18, fy + 3]].forEach(([x, y]) => put(x, y, INK));
    },
  },

  chick: {
    palette: fixed('#ffde5a', '#e8b232', '#fff0a0', { feet: ORANGE }),
    ears: (add, g, pal) => add(pixelsAt([[15, Math.round(g.top) - 1], [16, Math.round(g.top) - 2], [16, Math.round(g.top) - 1], [17, Math.round(g.top) - 1]]), pal.shade),
    face: (put, g, s, pal, base) => {
      base(put, g, s, { mouth: false });
      const { fy } = g;
      const beak = s.mouth === 'open'
        ? [[17, fy + 1], [18, fy + 1], [19, fy + 1], [17, fy + 3], [18, fy + 3]]
        : [[17, fy + 2], [18, fy + 2], [19, fy + 2], [17, fy + 3], [18, fy + 3]];
      beak.forEach(([x, y]) => put(x, y, ORANGE));
      if (s.mouth === 'open') [[17, fy + 2], [18, fy + 2]].forEach(([x, y]) => put(x, y, INK));
    },
  },

  frog: {
    palette: fixed('#82c86e', '#58a050', '#b4e49c', { belly: hex('#d8f0c0') }),
    body: { cy: 21, ry: 8.5, rx: 12.4 },
    ears: (add, g, pal) => {
      add(ellipse(11, g.top + 0.5, 3.6, 3.4), pal.body);
      add(ellipse(21, g.top + 0.5, 3.6, 3.4), pal.body);
      add(ellipse(11, g.top + 0.5, 2.2, 2.2), WHITE, true);
      add(ellipse(21, g.top + 0.5, 2.2, 2.2), WHITE, true);
    },
    front: (add, g, pal) => add(ellipse(16.5, g.cy + 3, 8, 4.5), pal.belly, true),
    face: (put, g, s) => {
      const ey = Math.round(g.top);
      if (s.eyes === 'open') [[11, ey], [12, ey], [21, ey], [22, ey]].forEach(([x, y]) => put(x, y, INK));
      else [[10, ey + 1], [11, ey + 1], [12, ey + 1], [20, ey + 1], [21, ey + 1], [22, ey + 1]].forEach(([x, y]) => put(x, y, INK));
      const my = g.fy + 2;
      [[9, my], [10, my], [22, my], [23, my]].forEach(([x, y]) => put(x, y, CHEEK));
      const line = [[12, my - 1], ...[13, 14, 15, 16, 17, 18, 19, 20].map((x) => [x, my]), [21, my - 1]];
      line.forEach(([x, y]) => put(x, y, INK));
      if (s.mouth === 'open') [14, 15, 16, 17, 18, 19].forEach((x) => put(x, my + 1, hex('#e86a6a')));
    },
  },

  hamster: {
    palette: fixed('#eab878', '#c8904c', '#f6d6a8'),
    ears: roundEars(2.3),
    front: (add, g) => {
      add(ellipse(16.5, g.cy + 5.5, 8, 4.2), WHITE, true);
      add(ellipse(9, g.fy + 3.5, 2.2, 1.8), WHITE, true);
      add(ellipse(24, g.fy + 3.5, 2.2, 1.8), WHITE, true);
    },
    face: (put, g, s, pal, base) => {
      base(put, g, s, { mouth: false });
      const { fy } = g;
      put(17, fy + 2, PINK);
      MOUTHS[s.mouth === 'open' ? 'open' : 'flat'](fy + 1).forEach(([x, y]) => put(x, y, INK));
    },
  },

  ghost: {
    palette: fixed('#f6f6fc', '#cfd0e6', '#ffffff'),
    body: { cy: 18, ry: 10.5 },
    hover: -1,
    noFeet: true,
    scarf: true,
    // Scalloped hem instead of feet.
    bodyShape: (g) => (x, y) => {
      if (!ellipse(g.cx, g.cy, g.rx, g.ry)(x, y) && !(y > g.cy && y < g.cy + g.ry + 1.5 && Math.abs(x + 0.5 - g.cx) <= g.rx - 0.5)) return false;
      const hem = Math.round(g.cy + g.ry);
      return !(y >= hem && Math.floor(x / 3) % 2 === 0) && y <= hem;
    },
    face: (put, g, s, pal, base) => {
      base(put, g, s, { mouth: false });
      const { fy } = g;
      const mouth = s.mouth === 'flat' ? MOUTHS.flat(fy) : [[16, fy + 2], [17, fy + 2], [16, fy + 3], [17, fy + 3]];
      mouth.forEach(([x, y]) => put(x, y, INK));
    },
  },

  fox: {
    palette: fixed('#f08c46', '#c8642e', '#fbb67e'),
    ears: pointedEars(5, 3.6, hex('#4a2a1a')),
    behind: (add, g, pal) => add(ellipse(4, g.cy + 1, 4.2, 6.5), (x, y) => (y + 0.5 > g.cy + 4.5 ? WHITE : pal.body)),
    front: (add, g) => add(ellipse(18, g.fy + 4, 6, 4.2), WHITE, true),
    face: (put, g, s, pal, base) => {
      base(put, g, s, { eyeX: [13, 21], mouth: false, cheeks: false });
      const { fy } = g;
      [[18, fy + 2], [19, fy + 2]].forEach(([x, y]) => put(x, y, INK));
      const mouth = s.mouth === 'open' ? [[18, fy + 3], [19, fy + 3], [18, fy + 4]] : [[17, fy + 4], [18, fy + 3], [19, fy + 4]];
      mouth.forEach(([x, y]) => put(x, y, INK));
    },
  },
};

module.exports = { SPECIES };

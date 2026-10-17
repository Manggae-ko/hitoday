// Draws the default pixel character "말랑이" as sprite sheets, one per room color,
// plus an empty template for people drawing their own.
// Usage: node scripts/make-sprites.js
//
// Sheet: 128×128 PNG = 4×4 cells of 32×32, character facing right.
//   row 0 idle (2 frames) · row 1 walk (4) · row 2 talk (2) · row 3 sleep (2)

const fs = require('node:fs');
const path = require('node:path');
const { encodePng } = require('./png');

const CELL = 32;
const SHEET = CELL * 4;
// Same order as ROOM_HUES in src/renderer/character.js.
const ROOM_HUES = [150, 330, 220, 35, 275, 95, 0, 190, 305, 60, 245, 15];

const OUTLINE = [43, 36, 32, 255];
const EYE = [43, 36, 32, 255];
const CHEEK = [255, 150, 150, 255];

function hsl(h, s, l) {
  const sat = s / 100;
  const light = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255), 255];
}

const paletteFor = (hue) => ({
  body: hsl(hue, 70, 89),
  shade: hsl(hue, 42, 74),
  light: hsl(hue, 85, 96),
});

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

const inEllipse = (x, y, cx, cy, rx, ry) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;

/** Draws one 32×32 frame into a Map of "x,y" -> color. */
function drawFrame(spec, palette) {
  const { dy = 0, squash = 0, feet = [[11, 29.5], [21, 29.5]], eyes = 'open', mouth = 'smile', arm = 'down' } = spec;
  const ry = 9.5 - squash;
  const cx = 16;
  const cy = 20 + dy + squash; // keep the bottom on the ground while squashing
  const armR = { down: [27.6, 22.5 + dy], up: [28.4, 14.5 + dy], wave: [29, 17.5 + dy] }[arm];

  const parts = [
    ...feet.map(([x, y]) => ({ test: (px, py) => inEllipse(px, py, x, y, 3, 1.8), color: palette.shade })),
    { test: (px, py) => inEllipse(px, py, 4.4, 22.5 + dy, 2.2, 2.8), color: palette.shade },
    { test: (px, py) => inEllipse(px, py, armR[0], armR[1], 2.2, 2.8), color: palette.shade },
    { test: (px, py) => inEllipse(px, py, 10, 11.5 + dy + squash, 2.6, 3.3), color: palette.shade },
    { test: (px, py) => inEllipse(px, py, 22, 11.5 + dy + squash, 2.6, 3.3), color: palette.shade },
    {
      test: (px, py) => inEllipse(px, py, cx, cy, 11.6, ry),
      color: (px, py) => {
        const nx = (px + 0.5 - cx) / 11.6;
        const ny = (py + 0.5 - cy) / ry;
        if (nx + ny > 0.95) return palette.shade;
        if (nx + ny < -1.0) return palette.light;
        return palette.body;
      },
    },
  ];

  const pixels = new Map();
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const part = [...parts].reverse().find((p) => p.test(x, y)); // body wins over ears/arms
      if (part) pixels.set(`${x},${y}`, typeof part.color === 'function' ? part.color(x, y) : part.color);
    }
  }
  // Silhouette outline: empty pixels touching the character.
  const outline = [];
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      if (pixels.has(`${x},${y}`)) continue;
      const touches = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => pixels.has(`${x + ox},${y + oy}`));
      if (touches) outline.push(`${x},${y}`);
    }
  }
  outline.forEach((key) => pixels.set(key, OUTLINE));

  // Face (facing right: features sit one pixel right of center).
  const fy = Math.round(cy - 1);
  const put = (x, y, color) => pixels.set(`${x},${y}`, color);
  if (eyes === 'open') {
    [[13, fy], [13, fy + 1], [20, fy], [20, fy + 1]].forEach(([x, y]) => put(x, y, EYE));
  } else {
    [[12, fy + 1], [13, fy + 1], [20, fy + 1], [21, fy + 1]].forEach(([x, y]) => put(x, y, EYE));
  }
  [[10, fy + 3], [11, fy + 3], [22, fy + 3], [23, fy + 3]].forEach(([x, y]) => put(x, y, CHEEK));
  const MOUTHS = {
    smile: [[15, fy + 2], [16, fy + 3], [17, fy + 3], [18, fy + 2]],
    open: [[16, fy + 2], [17, fy + 2], [16, fy + 3], [17, fy + 3]],
    flat: [[16, fy + 3], [17, fy + 3]],
  };
  MOUTHS[mouth].forEach(([x, y]) => put(x, y, EYE));
  return pixels;
}

function drawSheet(hue) {
  const palette = paletteFor(hue);
  const cells = FRAMES.map((row) => row.map((spec) => drawFrame(spec, palette)));
  return encodePng(SHEET, SHEET, (x, y) => {
    const row = Math.floor(y / CELL);
    const col = Math.floor(x / CELL);
    const frame = cells[row] && cells[row][col];
    return (frame && frame.get(`${x % CELL},${y % CELL}`)) || [0, 0, 0, 0];
  });
}

/** Empty sheet with faint cell guides: unused cells are greyed out. */
function drawTemplate() {
  const used = FRAMES.map((row) => row.length);
  return encodePng(SHEET, SHEET, (x, y) => {
    const row = Math.floor(y / CELL);
    const col = Math.floor(x / CELL);
    const edge = x % CELL === 0 || y % CELL === 0 || x === SHEET - 1 || y === SHEET - 1;
    if (edge) return [255, 90, 60, 160];
    if (col >= used[row]) return [0, 0, 0, 40];
    return [0, 0, 0, 0];
  });
}

function writeAll() {
  // The app and the download page each get a copy (the server image doesn't ship src/).
  const spriteDirs = [
    path.join(__dirname, '..', 'src', 'renderer', 'sprites'),
    path.join(__dirname, '..', 'web', 'sprites'),
  ];
  const docsDir = path.join(__dirname, '..', 'docs');
  fs.mkdirSync(docsDir, { recursive: true });
  spriteDirs.forEach((dir) => {
    fs.mkdirSync(dir, { recursive: true });
    ROOM_HUES.forEach((hue, i) => fs.writeFileSync(path.join(dir, `mochi-${i}.png`), drawSheet(hue)));
  });
  fs.writeFileSync(path.join(docsDir, 'character-template.png'), drawTemplate());
  process.stdout.write(`${ROOM_HUES.length} sheets → ${spriteDirs[0]}\ntemplate → ${docsDir}/character-template.png\n`);
}

// Other asset scripts (app icon, tray icon) reuse the same drawing.
module.exports = { drawFrame, paletteFor, FRAMES, ROOM_HUES, CELL };

if (require.main === module) writeAll();

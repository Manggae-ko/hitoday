// Draws every built-in character as sprite sheets (one per room color),
// a preview of all characters, and an empty template for people drawing their own.
// Usage: node scripts/make-sprites.js
//
// Sheet: 128×128 PNG = 4×4 cells of 32×32, character facing right.
//   row 0 idle (2 frames) · row 1 walk (4) · row 2 talk (2) · row 3 sleep (2)

const fs = require('node:fs');
const path = require('node:path');
const { encodePng } = require('./png');
const { CELL, ROOM_HUES, FRAMES, drawCharacter } = require('./sprites/draw');
const { SPECIES } = require('./sprites/species');
const { CHARACTER_IDS } = require('../shared/characters');

const SHEET = CELL * 4;
const PREVIEW_SCALE = 3;

function drawSheet(kind, hue) {
  const cells = FRAMES.map((row) => row.map((spec) => drawCharacter(kind, spec, hue)));
  return encodePng(SHEET, SHEET, (x, y) => {
    const frame = cells[Math.floor(y / CELL)] && cells[Math.floor(y / CELL)][Math.floor(x / CELL)];
    return (frame && frame.get(`${x % CELL},${y % CELL}`)) || [0, 0, 0, 0];
  });
}

/** Empty sheet with faint cell guides: unused cells are greyed out. */
function drawTemplate() {
  const used = FRAMES.map((row) => row.length);
  return encodePng(SHEET, SHEET, (x, y) => {
    const edge = x % CELL === 0 || y % CELL === 0 || x === SHEET - 1 || y === SHEET - 1;
    if (edge) return [255, 90, 60, 160];
    if (Math.floor(x / CELL) >= used[Math.floor(y / CELL)]) return [0, 0, 0, 40];
    return [0, 0, 0, 0];
  });
}

/** One row per character, columns = idle, walk, talk, sleep, each in a different room color. */
function drawPreview() {
  const shots = [[0, 0], [1, 1], [2, 0], [3, 0]];
  const grid = CHARACTER_IDS.map((id, row) => shots.map(([r, c], col) => (
    drawCharacter(SPECIES[id], FRAMES[r][c], ROOM_HUES[(row + col * 3) % ROOM_HUES.length])
  )));
  const width = shots.length * CELL * PREVIEW_SCALE;
  const height = CHARACTER_IDS.length * CELL * PREVIEW_SCALE;
  return encodePng(width, height, (x, y) => {
    const px = Math.floor(x / PREVIEW_SCALE);
    const py = Math.floor(y / PREVIEW_SCALE);
    const frame = grid[Math.floor(py / CELL)][Math.floor(px / CELL)];
    return frame.get(`${px % CELL},${py % CELL}`) || [246, 241, 231, 255];
  });
}

function writeAll() {
  const appDir = path.join(__dirname, '..', 'src', 'renderer', 'sprites');
  const webDir = path.join(__dirname, '..', 'web', 'sprites'); // the download page only shows mochi
  const docsDir = path.join(__dirname, '..', 'docs');
  [appDir, webDir, docsDir].forEach((dir) => fs.mkdirSync(dir, { recursive: true }));
  CHARACTER_IDS.forEach((id) => {
    ROOM_HUES.forEach((hue, i) => {
      const png = drawSheet(SPECIES[id], hue);
      fs.writeFileSync(path.join(appDir, `${id}-${i}.png`), png);
      if (id === 'mochi') fs.writeFileSync(path.join(webDir, `${id}-${i}.png`), png);
    });
  });
  fs.writeFileSync(path.join(docsDir, 'character-template.png'), drawTemplate());
  fs.writeFileSync(path.join(docsDir, 'characters-preview.png'), drawPreview());
  process.stdout.write(`${CHARACTER_IDS.length} characters × ${ROOM_HUES.length} colors → ${appDir}\n`);
}

module.exports = { drawSheet };

if (require.main === module) writeAll();

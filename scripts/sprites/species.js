'use strict';
// 종별 도안(scripts/sprites/designs.js 의 16×16 문자 그리드)을 포즈·프레임에 맞게 변형해 캔버스에 그린다.
// 규칙: 발은 항상 y=15, 외곽선은 실루엣 경계 1px, 뜬 눈은 (7,y)(9,y) 세로 2px, 감은 눈은 (6~7,y)(9~10,y) 가로.
const { ROOM_PALETTE, setPx } = require('./pixel');
const { designs, OUTLINE, EYE, BASE } = require('./designs');

const set = (grid, x, y, ch) => { grid[y] = grid[y].slice(0, x) + ch + grid[y].slice(x + 1); };
const topOf = (grid) => grid.findIndex((row) => /[^.]/.test(row));
const eyeRow = (grid) => grid.findIndex((row) => row.includes('E'));
/** 발 행에 틈이 생기면 그 위 픽셀을 외곽선으로 바꿔 경계 규칙을 지킨다. */
const fixFeet = (grid) => { grid[14] = grid[14].split('').map((ch, x) => (ch !== '.' && grid[15][x] === '.' ? '#' : ch)).join(''); };

function idleFrame(name, grid, index) {
  if (index !== 1) return;
  if (name === 'ghost') { grid[14] = '...#WW#WWW#W#...'; grid[15] = '...###.###.##...'; }
  if (name === 'rabbit') { grid[1] = '....###.###.....'; grid[2] = '....#P#.#P#.....'; grid[3] = '....#P#.#P#.....'; grid[4] = '....#P##P#......'; grid[5] = '....#WW#WW#.....'; }
  if (name === 'penguin') { grid[9] = '...#KRRRRRWK#...'; set(grid, 4, 10, 'W'); set(grid, 11, 12, 'W'); }
}

function walkFrame(name, grid, index) {
  if (name === 'ghost') {
    grid[14] = ['...#W#WWW#WW#...', '...#WW#WWW#W#...', '...#WWW#WWW#W#..'.slice(0, 16), '...#W#WWW#WW#...'][index];
    grid[15] = ['...##.###.###...', '...###.###.##...', '...####.###.#...', '...##.###.###...'][index];
    if (index === 3) { set(grid, 5, 8, 'W'); set(grid, 10, 8, 'W'); set(grid, 4, 8, 'B'); set(grid, 11, 8, 'B'); }
    return;
  }
  grid[15] = ['....#.######....', '....########....', '....######.#....', '....##.###.#....'][index];
  fixFeet(grid);
  if (index === 1) set(grid, 5, eyeRow(grid) + 3, 'W');
}

function talkFrame(name, grid, index) {
  if (index !== 1) return;
  const y = eyeRow(grid);
  if (name === 'ghost') set(grid, 8, y + 3, 'E');
  if (name === 'rabbit') set(grid, 8, y + 2, 'E');
  if (name === 'penguin') { set(grid, 7, y + 2, 'O'); set(grid, 8, y + 2, 'E'); }
}

function sleepFrame(name, grid, index) {
  const top = topOf(grid);
  const shifted = Array(16).fill('................');
  for (let y = top; y < 12; y += 1) shifted[y + 1] = grid[y]; // 윗부분을 1칸 내리고
  for (let y = 13; y < 16; y += 1) shifted[y] = grid[y]; // 몸통 한 줄(12행)을 줄여 웅크림
  for (let y = 0; y < 16; y += 1) grid[y] = shifted[y];
  const y = eyeRow(grid);
  grid[y] = grid[y].replace(/E/g, 'W');
  grid[y + 1] = grid[y + 1].replace(/E/g, 'W');
  [6, 7, 9, 10].forEach((x) => set(grid, x, y + 1, 'E'));
  if (name === 'penguin') { set(grid, 6, y, 'W'); set(grid, 10, y, 'W'); }
  if (index === 1 && name === 'ghost') { grid[14] = '...#WW#WWW#W#...'; grid[15] = '...###.###.##...'; }
  if (index === 1 && name !== 'ghost') set(grid, 4, eyeRow(grid) + 1, name === 'penguin' ? 'K' : 'W');
}

/** 포즈·프레임이 적용된 16행 문자 그리드. */
function frameGrid(name, pose, index) {
  const grid = designs[name].grid.slice();
  ({ idle: idleFrame, walk: walkFrame, talk: talkFrame, sleep: sleepFrame })[pose](name, grid, index);
  // 안전망: 투명과 맞닿은 픽셀은 외곽선
  for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) {
    const ch = grid[y][x];
    if (ch === '.' || ch === '#') continue;
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const xx = x + dx; const yy = y + dy;
      return xx < 0 || yy < 0 || xx > 15 || yy > 15 || grid[yy][xx] === '.';
    });
    if (edge) set(grid, x, y, '#');
  }
  return grid;
}

const colorOf = (ch, colorIndex) => ({ '#': OUTLINE, E: EYE, R: ROOM_PALETTE[colorIndex], ...BASE })[ch];

function drawAnimal(canvas, name, pose, frame, colorIndex) {
  frameGrid(name, pose, frame).forEach((row, y) => row.split('').forEach((ch, x) => {
    if (ch !== '.') setPx(canvas, x, y, colorOf(ch, colorIndex));
  }));
}

module.exports = { designs, drawAnimal, frameGrid, OUTLINE, EYE, BASE };

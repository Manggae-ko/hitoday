// Built-in characters. Each has 12 sprite sheets (one per room color):
// src/renderer/sprites/<id>-<color>.png, drawn by scripts/make-sprites.js.

const CHARACTERS = [
  { id: 'mochi', name: '말랑이' },
  { id: 'cat', name: '고양이' },
  { id: 'dog', name: '강아지' },
  { id: 'rabbit', name: '토끼' },
  { id: 'bear', name: '곰' },
  { id: 'penguin', name: '펭귄' },
  { id: 'chick', name: '병아리' },
  { id: 'frog', name: '개구리' },
  { id: 'hamster', name: '햄스터' },
  { id: 'ghost', name: '유령' },
  { id: 'fox', name: '여우' },
];

const DEFAULT_CHARACTER = 'mochi';
const CHARACTER_IDS = CHARACTERS.map((c) => c.id);
const isCharacter = (value) => CHARACTER_IDS.includes(value);

module.exports = { CHARACTERS, CHARACTER_IDS, DEFAULT_CHARACTER, isCharacter };

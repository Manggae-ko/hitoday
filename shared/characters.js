// Built-in characters. Each has 12 sprite sheets (one per room color):
// src/renderer/sprites/<id>-<color>.png, drawn by scripts/make-sprites.js.

const CHARACTERS = [
  { id: 'ghost', name: '유령' },
  { id: 'rabbit', name: '토끼' },
  { id: 'penguin', name: '펭귄' },
];

const DEFAULT_CHARACTER = 'ghost';
const CHARACTER_IDS = CHARACTERS.map((c) => c.id);
const isCharacter = (value) => CHARACTER_IDS.includes(value);

module.exports = { CHARACTERS, CHARACTER_IDS, DEFAULT_CHARACTER, isCharacter };

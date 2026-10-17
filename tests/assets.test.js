const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CHARACTER_IDS } = require('../shared/characters');
const { ROOM_COLORS } = require('../shared/colors');
const { checkAvatar } = require('../shared/avatar');

const SPRITES = path.join(__dirname, '..', 'src', 'renderer', 'sprites');

test('every built-in character has a valid 128×128 sheet in every room color', () => {
  CHARACTER_IDS.forEach((id) => {
    for (let color = 0; color < ROOM_COLORS; color += 1) {
      const file = path.join(SPRITES, `${id}-${color}.png`);
      assert.ok(fs.existsSync(file), `missing ${id}-${color}.png`);
      assert.equal(checkAvatar(fs.readFileSync(file)).kind, 'sheet', `${id}-${color}.png is not a 128×128 sheet`);
    }
  });
});

test('the renderer knows the same characters as the shared list', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'character.js'), 'utf8');
  const listed = source.match(/CHARACTER_IDS = \[([^\]]+)\]/)[1].match(/'([a-z]+)'/g).map((s) => s.slice(1, -1));
  assert.deepEqual(listed, CHARACTER_IDS);
});

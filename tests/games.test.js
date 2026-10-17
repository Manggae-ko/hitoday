const test = require('node:test');
const assert = require('node:assert/strict');
const { drawLottery, judgeRps, rankReaction } = require('../server/games');

const sequence = (values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

test('lottery picks a player and the spotlight path ends on them', () => {
  const players = ['A', 'B', 'C'];
  const { picked, bounce } = drawLottery(players, sequence([1, 2, 0]));
  assert.equal(picked, 'B');
  assert.equal(bounce.at(-1), 'B');
  assert.ok(bounce.length > players.length * 2);
  assert.ok(bounce.every((p) => players.includes(p)));
});

test('rock-paper-scissors: one winning hand wins, three hands or one hand is a draw', () => {
  assert.deepEqual(judgeRps({ A: 'rock', B: 'scissors', C: 'scissors' }), ['A']);
  assert.deepEqual(judgeRps({ A: 'paper', B: 'rock', C: 'paper' }).sort(), ['A', 'C']);
  assert.deepEqual(judgeRps({ A: 'rock', B: 'paper', C: 'scissors' }), []);
  assert.deepEqual(judgeRps({ A: 'rock', B: 'rock' }), []);
  assert.deepEqual(judgeRps({ A: 'rock' }), []);
});

test('reaction race ranks by time after the signal and flags false starts', () => {
  const result = rankReaction(1000, [
    { code: 'A', at: 1420 },
    { code: 'B', at: 900 },
    { code: 'C', at: 1310 },
  ]);
  assert.deepEqual(result.ranking, [{ code: 'C', ms: 310 }, { code: 'A', ms: 420 }]);
  assert.deepEqual(result.faults, ['B']);
});

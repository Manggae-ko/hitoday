const test = require('node:test');
const assert = require('node:assert/strict');
const { drawLottery, judgeRps, rankReaction, planRace, RACE_LEGS } = require('../server/games');

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

test('race: every runner gets rising split times, and the order follows the finish times', () => {
  const players = ['A', 'B', 'C'];
  const { race, order } = planRace(players, sequence([900, 0, 450, 200, 800, 100, 300, 600, 50, 700, 400, 850]));
  assert.deepEqual(race.map((r) => r.code), players);
  race.forEach(({ legs }) => {
    assert.equal(legs.length, RACE_LEGS);
    legs.forEach((t, i) => assert.ok(t > (i ? legs[i - 1] : 0), 'each split is later than the last'));
  });
  const finish = Object.fromEntries(race.map((r) => [r.code, r.legs.at(-1)]));
  assert.deepEqual(order, [...players].sort((x, y) => finish[x] - finish[y]));
});

test('race: a whole race stays between about 4 and 8 seconds per runner', () => {
  const fastest = planRace(['A'], () => 0).race[0].legs.at(-1);
  const slowest = planRace(['A'], (n) => n - 1).race[0].legs.at(-1);
  assert.ok(fastest >= 4000 && slowest <= 8000, `${fastest}..${slowest}`);
});

test('race: equal times keep the order people were listed in', () => {
  assert.deepEqual(planRace(['A', 'B', 'C'], () => 5).order, ['A', 'B', 'C']);
});

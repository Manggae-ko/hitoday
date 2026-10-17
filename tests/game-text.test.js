const test = require('node:test');
const assert = require('node:assert/strict');
const { describeGame } = require('../src/main/game-text');
const { parseServerMessage } = require('../src/main/transport');

const NAMES = { AAAAAA: '동동', BBBBBB: '민지', CCCCCC: '하린' };
const nameOf = (code) => NAMES[code] || '누군가';
const base = { id: 1, by: 'AAAAAA', players: ['AAAAAA', 'BBBBBB', 'CCCCCC'] };

test('coffee lottery names who buys', () => {
  const text = describeGame({ ...base, game: 'lottery', phase: 'result', picked: 'BBBBBB' }, nameOf);
  assert.equal(text.outcome, '☕ 오늘 커피는 민지!');
  assert.match(text.banner, /동동님이 시작/);
});

test('rock-paper-scissors: winners, draw, and nobody picking', () => {
  const rps = { ...base, game: 'rps', phase: 'result' };
  assert.equal(describeGame({ ...rps, choices: { AAAAAA: 'rock', BBBBBB: 'rock' }, winners: ['AAAAAA', 'BBBBBB'] }, nameOf).outcome,
    '✊ 가위바위보 · 동동·민지 승!');
  assert.equal(describeGame({ ...rps, choices: { AAAAAA: 'rock' }, winners: [] }, nameOf).outcome, '✊ 가위바위보 · 비겼어요! 한 판 더?');
  assert.equal(describeGame({ ...rps, choices: {}, winners: [] }, nameOf).outcome, '✊ 가위바위보 · 아무도 안 골랐어요');
  assert.match(describeGame({ ...base, game: 'rps', phase: 'pick', deadlineMs: 10_000 }, nameOf).banner, /10초/);
});

test('reaction race lists medals and false starts', () => {
  const text = describeGame({
    ...base,
    game: 'reaction',
    phase: 'result',
    ranking: [{ code: 'CCCCCC', ms: 312 }, { code: 'AAAAAA', ms: 455 }],
    faults: ['BBBBBB'],
  }, nameOf);
  assert.equal(text.outcome, '⚡ 반응속도 · 🥇 하린 0.31초 · 🥈 동동 0.46초 · 부정출발 민지');
  assert.equal(describeGame({ ...base, game: 'reaction', phase: 'go' }, nameOf).banner, '지금!');
});

test('game messages from the server are checked before use', () => {
  const ok = parseServerMessage(JSON.stringify({
    type: 'game', id: 3, game: 'rps', phase: 'result', by: 'AAAAAA', players: ['AAAAAA', 'bad'],
    choices: { AAAAAA: 'rock', BBBBBB: 'lasers' }, winners: ['AAAAAA'],
  }));
  assert.deepEqual(ok.players, ['AAAAAA']);
  assert.deepEqual(ok.choices, { AAAAAA: 'rock' });
  assert.equal(parseServerMessage(JSON.stringify({ type: 'game', id: 1, game: 'poker', phase: 'go', by: 'AAAAAA' })), null);
});

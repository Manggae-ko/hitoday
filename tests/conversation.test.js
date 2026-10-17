const test = require('node:test');
const assert = require('node:assert/strict');
const { initialConversation, onSent, onReceived, onIdle, RACE_WINDOW_MS } = require('../src/main/conversation');

const me = { code: 'AAAAAA', name: '동동', friendName: '민지' };
const channels = (result) => result.commands.map((c) => c.channel);
const fromFriend = (extra = {}) => ({ from: 'BBBBBB', fromName: '민지', message: 'hi', ...extra });

test('my first line sends my character to the friend', () => {
  const result = onSent(initialConversation, { message: '뭐해?', opens: true, queued: false }, me, 1000);
  assert.equal(result.conv.where, 'there');
  assert.deepEqual(channels(result), ['me:go', 'edge:line']);
});

test('while visiting, both sides of the chat appear at the screen edge', () => {
  const there = { where: 'there', openedAt: 1000 };
  assert.deepEqual(channels(onSent(there, { message: 'a', opens: false }, me, 2000)), ['edge:line']);
  const reply = onReceived(there, fromFriend(), me, 2000);
  assert.equal(reply.conv.where, 'there');
  assert.deepEqual(channels(reply), ['edge:line']);
});

test("a friend's first line brings their character to my screen", () => {
  const result = onReceived(initialConversation, fromFriend({ opens: true }), me, 1000);
  assert.equal(result.conv.where, 'here');
  assert.deepEqual(channels(result), ['guest:says']);
  assert.deepEqual(channels(onSent(result.conv, { message: 'yo' }, me, 1100)), ['home:says']);
});

test('if both open at once, the lower code is the visitor on both sides', () => {
  const mine = onSent(initialConversation, { message: 'x', opens: true }, me, 1000).conv;
  // I'm AAAAAA (lower), so I stay the visitor.
  assert.equal(onReceived(mine, fromFriend({ opens: true }), me, 1000 + 100).conv.where, 'there');
  // Friend BBBBBB applies the same rule and becomes the host.
  const friend = { code: 'BBBBBB', name: '민지' };
  const theirs = onSent(initialConversation, { message: 'y', opens: true }, friend, 1000).conv;
  const settled = onReceived(theirs, { from: 'AAAAAA', fromName: '동동', message: 'x', opens: true }, friend, 1100);
  assert.equal(settled.conv.where, 'here');
  assert.deepEqual(channels(settled), ['me:return-now', 'guest:says']);
});

test('an old visit yields to a fresh one from the friend', () => {
  const stale = { where: 'there', openedAt: 0 };
  const result = onReceived(stale, fromFriend({ opens: true }), me, RACE_WINDOW_MS + 1);
  assert.equal(result.conv.where, 'here');
});

test('notes left while I was offline do not move any character', () => {
  const result = onReceived(initialConversation, fromFriend({ late: true }), me, 1000);
  assert.equal(result.conv, initialConversation);
  assert.deepEqual(channels(result), ['home:note']);
});

test('a line to an offline friend drops a note and keeps everyone home', () => {
  const result = onSent(initialConversation, { message: 'x', opens: true, queued: true }, me, 1000);
  assert.equal(result.conv.where, null);
  assert.deepEqual(channels(result), ['me:drop-note']);
});

test('after a quiet spell the visitor goes home', () => {
  assert.deepEqual(channels(onIdle({ where: 'there' }, 'BBBBBB')), ['me:return']);
  const host = onIdle({ where: 'here' }, 'BBBBBB');
  assert.deepEqual(host.commands, [{ channel: 'guest:leave', payload: { from: 'BBBBBB' } }]);
  assert.equal(host.conv.where, null);
});

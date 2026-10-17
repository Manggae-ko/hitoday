const test = require('node:test');
const assert = require('node:assert/strict');
const { parseClientMessage, makeCode, isCode, cleanText, normalizeCode } = require('../shared/protocol');

const parse = (obj) => parseClientMessage(JSON.stringify(obj));

test('makeCode produces a valid 6-char code', () => {
  const code = makeCode((n) => Math.floor(Math.random() * n));
  assert.ok(isCode(code));
});

test('hello keeps a remembered room only if it is a valid code', () => {
  assert.deepEqual(parse({ type: 'hello', code: 'ABC234', name: '동동', room: 'ROOM22', character: 'fox' }).value,
    { type: 'hello', code: 'ABC234', name: '동동', room: 'ROOM22', character: 'fox' });
  assert.equal(parse({ type: 'hello', code: 'ABC234', name: '동동', room: 'nope' }).value.room, null);
});

test('hello falls back to the default character for unknown ones', () => {
  assert.equal(parse({ type: 'hello', code: 'ABC234', name: '동동', character: '../../etc' }).value.character, 'mochi');
  assert.equal(parse({ type: 'hello', code: 'ABC234', name: '동동' }).value.character, 'mochi');
});

test('hello rejects a bad code or empty name', () => {
  assert.deepEqual(parse({ type: 'hello', code: 'abc', name: 'x' }), { ok: false, error: 'bad-code' });
  assert.deepEqual(parse({ type: 'hello', code: 'ABC234', name: '   ' }), { ok: false, error: 'bad-name' });
});

test('join-room forgives lowercase and spaces in typed invite codes', () => {
  assert.deepEqual(parse({ type: 'join-room', room: ' ab c234 ' }).value, { type: 'join-room', room: 'ABC234' });
  assert.deepEqual(parse({ type: 'join-room', room: '12' }), { ok: false, error: 'bad-room' });
  assert.equal(normalizeCode(42), '');
});

test('say trims long messages to 80 characters and rejects blank ones', () => {
  assert.equal(Array.from(parse({ type: 'say', message: '가'.repeat(200) }).value.message).length, 80);
  assert.deepEqual(parse({ type: 'say', message: '   ' }), { ok: false, error: 'empty-message' });
});

test('cleanText removes control characters', () => {
  assert.equal(cleanText('안녕\n\u0007하세요', 80), '안녕  하세요');
});

test('invalid JSON and unknown types are rejected', () => {
  assert.deepEqual(parseClientMessage('{oops'), { ok: false, error: 'bad-json' });
  assert.deepEqual(parse({ type: 'hack' }), { ok: false, error: 'unknown-type' });
  assert.deepEqual(parseClientMessage('null'), { ok: false, error: 'bad-json' });
});

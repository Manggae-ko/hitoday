const test = require('node:test');
const assert = require('node:assert/strict');
const { parseClientMessage, makeCode, isCode, cleanText } = require('../shared/protocol');

const parse = (obj) => parseClientMessage(JSON.stringify(obj));

test('makeCode produces a valid 6-char code', () => {
  const code = makeCode((n) => Math.floor(Math.random() * n));
  assert.ok(isCode(code));
});

test('hello keeps only valid friend codes', () => {
  const result = parse({ type: 'hello', code: 'ABC234', name: '동동', friends: ['XYZ789', 'nope', 3] });
  assert.deepEqual(result, { ok: true, value: { type: 'hello', code: 'ABC234', name: '동동', friends: ['XYZ789'] } });
});

test('hello rejects a bad code', () => {
  assert.deepEqual(parse({ type: 'hello', code: 'abc', name: 'x' }), { ok: false, error: 'bad-code' });
});

test('visit trims long messages to 80 characters', () => {
  const result = parse({ type: 'visit', to: 'ABC234', message: '가'.repeat(200) });
  assert.equal(Array.from(result.value.message).length, 80);
});

test('visit rejects empty or whitespace-only messages', () => {
  assert.deepEqual(parse({ type: 'visit', to: 'ABC234', message: '   ' }), { ok: false, error: 'empty-message' });
});

test('cleanText removes control characters', () => {
  assert.equal(cleanText('안녕\n\u0007하세요', 80), '안녕  하세요');
});

test('invalid JSON and unknown types are rejected', () => {
  assert.deepEqual(parseClientMessage('{oops'), { ok: false, error: 'bad-json' });
  assert.deepEqual(parse({ type: 'hack' }), { ok: false, error: 'unknown-type' });
  assert.deepEqual(parseClientMessage('null'), { ok: false, error: 'bad-json' });
});

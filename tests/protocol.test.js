const test = require('node:test');
const assert = require('node:assert/strict');
const { keyFor } = require('./helpers');
const {
  parseClientMessage,
  parseScheduleEntries,
  statusAt,
  kstDate,
  kstMinutes,
  makeCode,
  isCode,
  cleanText,
  normalizeCode,
} = require('../shared/protocol');

const parse = (obj) => parseClientMessage(JSON.stringify(obj));
const KEY = keyFor('ABC234');

test('makeCode produces a valid 6-char code', () => {
  const code = makeCode((n) => Math.floor(Math.random() * n));
  assert.ok(isCode(code));
});

test('hello keeps a remembered room only if it is a valid code', () => {
  assert.deepEqual(parse({ type: 'hello', code: 'ABC234', key: KEY, name: '동동', room: 'ROOM22', character: 'penguin' }).value,
    { type: 'hello', code: 'ABC234', key: KEY, name: '동동', room: 'ROOM22', character: 'penguin', x: null });
  assert.equal(parse({ type: 'hello', code: 'ABC234', key: KEY, name: '동동', x: 0.42 }).value.x, 0.42);
  assert.equal(parse({ type: 'hello', code: 'ABC234', key: KEY, name: '동동', x: 3 }).value.x, null);
  assert.equal(parse({ type: 'hello', code: 'ABC234', key: KEY, name: '동동', room: 'nope' }).value.room, null);
});

test('hello falls back to the default character for unknown ones', () => {
  assert.equal(parse({ type: 'hello', code: 'ABC234', key: KEY, name: '동동', character: '../../etc' }).value.character, 'ghost');
  assert.equal(parse({ type: 'hello', code: 'ABC234', key: KEY, name: '동동' }).value.character, 'ghost');
});

test('hello requires a well-formed device key', () => {
  assert.deepEqual(parse({ type: 'hello', code: 'ABC234', name: '동동' }), { ok: false, error: 'need-key' });
  assert.deepEqual(parse({ type: 'hello', code: 'ABC234', key: 'short', name: '동동' }), { ok: false, error: 'need-key' });
});

test('hello rejects a bad code or empty name', () => {
  assert.deepEqual(parse({ type: 'hello', code: 'abc', name: 'x' }), { ok: false, error: 'bad-code' });
  assert.deepEqual(parse({ type: 'hello', code: 'ABC234', key: KEY, name: '   ' }), { ok: false, error: 'bad-name' });
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

test('presence only accepts a true/false away flag; the race is a known game', () => {
  assert.deepEqual(parse({ type: 'presence', away: true }), { ok: true, value: { type: 'presence', away: true } });
  assert.equal(parse({ type: 'presence', away: 'yes' }).ok, false);
  assert.equal(parse({ type: 'start-game', game: 'race' }).ok, true);
});

test('kstDate and kstMinutes use fixed Korea time boundaries', () => {
  assert.equal(kstDate(Date.UTC(2026, 9, 29, 14, 59)), '2026-10-29');
  assert.equal(kstDate(Date.UTC(2026, 9, 29, 15, 0)), '2026-10-30');
  assert.equal(kstMinutes(Date.UTC(2026, 9, 29, 14, 59)), 1439);
  assert.equal(kstMinutes(Date.UTC(2026, 9, 29, 15, 0)), 0);
});

test('parseScheduleEntries validates, cleans, and stably sorts entries', () => {
  const result = parseScheduleEntries([
    { from: '2026-11-02', to: '2026-11-02', kind: 'note', note: '  외부\n일정  ', ignored: true },
    { from: '2026-11-01', to: '2026-11-01', kind: 'remote' },
    { from: '2026-11-02', to: '2026-11-03', kind: 'trip' },
  ]);
  assert.deepEqual(result, { ok: true, value: [
    { from: '2026-11-01', to: '2026-11-01', kind: 'remote' },
    { from: '2026-11-02', to: '2026-11-02', kind: 'note', note: '외부 일정' },
    { from: '2026-11-02', to: '2026-11-03', kind: 'trip' },
  ] });
  assert.deepEqual(parse({ type: 'set-schedule', entries: result.value }).value,
    { type: 'set-schedule', entries: result.value });
});

test('parseScheduleEntries rejects malformed dates, ranges, notes, and counts', () => {
  const entry = { from: '2026-10-30', to: '2026-10-30', kind: 'leave' };
  const bad = [
    null,
    Array(31).fill(entry),
    [{ ...entry, from: '2026-02-30' }],
    [{ ...entry, from: '2026-10-31', to: '2026-10-30' }],
    [{ ...entry, to: '2026-12-29' }],
    [{ ...entry, kind: 'holiday' }],
    [{ ...entry, kind: 'note' }],
    [{ ...entry, kind: 'note', note: '가'.repeat(13) }],
  ];
  bad.forEach((value) => assert.deepEqual(parseScheduleEntries(value), { ok: false, error: 'bad-schedule' }));
  assert.deepEqual(parse({ type: 'set-schedule', entries: bad[2] }), { ok: false, error: 'bad-schedule' });
});

test('statusAt observes half-day and lunch boundaries', () => {
  const day = '2026-10-30';
  const at = (hour, minute) => Date.UTC(2026, 9, 30, hour - 9, minute);
  const entries = [
    { from: day, to: day, kind: 'half-am' },
    { from: day, to: day, kind: 'half-pm' },
    { from: day, to: day, kind: 'lunch' },
  ];
  assert.equal(statusAt(entries, at(11, 29)).kind, 'half-am');
  assert.equal(statusAt(entries, at(11, 30)).kind, 'half-am');
  assert.equal(statusAt(entries, at(11, 59)).kind, 'half-am');
  assert.equal(statusAt(entries, at(12, 0)).kind, 'half-pm');
  assert.equal(statusAt(entries, at(13, 29)).kind, 'half-pm');
  assert.equal(statusAt(entries, at(13, 30)).kind, 'half-pm');
});

test('statusAt uses priority and keeps the first same-kind entry', () => {
  const entries = [
    { from: '2026-10-30', to: '2026-10-30', kind: 'note', note: '첫 메모' },
    { from: '2026-10-30', to: '2026-10-30', kind: 'note', note: '둘째 메모' },
    { from: '2026-10-30', to: '2026-10-30', kind: 'remote' },
  ];
  const noon = Date.UTC(2026, 9, 30, 3, 0);
  assert.deepEqual(statusAt(entries, noon), { kind: 'remote', label: '재택' });
  assert.deepEqual(statusAt(entries.slice(0, 2), noon), { kind: 'note', label: '첫 메모' });
  assert.equal(statusAt(entries, Date.UTC(2026, 9, 31, 3, 0)), null);
});

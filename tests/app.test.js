const test = require('node:test');
const assert = require('node:assert/strict');
const { keyFor } = require('./helpers');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadProfile, applyChanges, withRoom } = require('../src/main/profile');
const { createTransport, parseServerMessage } = require('../src/main/transport');
const { createRelay } = require('../server/relay');
const { buildScheduleView } = require('../src/main/schedule-view');

const base = { code: 'AAAAAA', name: '나', room: '', serverUrl: 'ws://localhost:8787' };
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hitoday-'));

test('loadProfile creates a code and a distinct default name once', () => {
  const dir = tmpDir();
  const first = loadProfile(dir);
  assert.match(first.code, /^[A-Z0-9]{6}$/);
  assert.equal(first.name, `말랑${first.code.slice(0, 2)}`);
  assert.deepEqual(loadProfile(dir), first);
});

test('loadProfile recovers from a corrupted file', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'profile.json'), '{broken');
  assert.match(loadProfile(dir).code, /^[A-Z0-9]{6}$/);
});

test('loadProfile remembers the room between launches', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify({ code: 'AAAAAA', name: '동동', room: 'ROOM22' }));
  assert.equal(loadProfile(dir).room, 'ROOM22');
});

test('applyChanges returns a new object and validates input', () => {
  const result = applyChanges(base, { name: '동동', serverUrl: 'wss://example.com' });
  assert.deepEqual(result.profile, { ...base, name: '동동', serverUrl: 'wss://example.com' });
  assert.equal(base.name, '나');
  assert.ok(applyChanges(base, { name: '  ', serverUrl: 'ws://a' }).error);
  assert.ok(applyChanges(base, { name: 'x', serverUrl: 'http://a' }).error);
});

test('withRoom only stores valid room codes', () => {
  assert.equal(withRoom(base, 'ROOM22').room, 'ROOM22');
  assert.equal(withRoom(base, 'bad').room, '');
});

test('parseServerMessage drops malformed members and lines', () => {
  assert.equal(parseServerMessage('nope'), null);
  assert.equal(parseServerMessage(JSON.stringify({ type: 'surprise' })), null);
  const room = parseServerMessage(JSON.stringify({
    type: 'room',
    room: 'ROOM22',
    members: [
      { code: 'AAAAAA', name: '동동', color: 3, online: true },
      { code: 'BBBBBB', name: '민지', online: true, away: true },
      { code: 'bad', name: 'x' },
    ],
    history: [{ from: 'AAAAAA', fromName: '동동', message: 'hi', at: 1 }, { from: 'AAAAAA' }],
  }));
  assert.deepEqual(room.members, [
    { code: 'AAAAAA', name: '동동', character: 'ghost', color: 3, x: null, online: true, away: false, avatar: null, avatarKind: null, status: null, schedule: [] },
    { code: 'BBBBBB', name: '민지', character: 'ghost', color: null, x: null, online: true, away: true, avatar: null, avatarKind: null, status: null, schedule: [] },
  ]);
  assert.equal(room.history.length, 1);
});

test('friend images are downloaded once, checked, and refused if they do not match', async () => {
  const { createAvatarCache, httpBase } = require('../src/main/avatars');
  const { encodePng } = require('../scripts/png');
  const { checkAvatar } = require('../shared/avatar');
  const image = encodePng(16, 16, () => [10, 20, 30, 255]);
  const { version } = checkAvatar(image);
  let calls = 0;
  let loaded = 0;
  const cache = createAvatarCache({
    getServerUrl: () => 'wss://relay.example.com',
    onLoaded: () => { loaded += 1; },
    fetchImpl: async (url) => {
      calls += 1;
      assert.equal(url, `https://relay.example.com/avatars/AAAAAA.png?v=${version}`);
      return { ok: true, arrayBuffer: async () => image };
    },
  });
  assert.equal(cache.lookFor('AAAAAA', version), null); // starts downloading
  assert.equal(cache.lookFor('AAAAAA', version), null); // no second download while pending
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(calls, 1);
  assert.equal(loaded, 1);
  assert.equal(cache.lookFor('AAAAAA', version).single, true);
  assert.equal(cache.lookFor('BBBBBB', null), null);
  assert.equal(httpBase('ws://localhost:8787'), 'http://localhost:8787');

  const liar = createAvatarCache({
    getServerUrl: () => 'ws://x',
    onLoaded: () => assert.fail('should not load a mismatched image'),
    fetchImpl: async () => ({ ok: true, arrayBuffer: async () => image }),
  });
  liar.lookFor('AAAAAA', 'ffffffffffff');
  await new Promise((r) => setTimeout(r, 20));
});

test('an app replaced by another copy of itself stops instead of reconnecting', async () => {
  const relay = createRelay({ port: 0 });
  await relay.ready;
  const url = `ws://127.0.0.1:${relay.port()}`;
  const statuses = { first: [], second: [] };
  const make = (label) => {
    const transport = createTransport({
      getHello: () => ({ code: 'TWIN01', key: keyFor('TWIN01'), name: '쌍둥이' }),
      onMessage: () => {},
      onStatus: (s) => statuses[label].push(s),
    });
    transport.connect(url);
    return transport;
  };
  const until = async (fn) => {
    for (let i = 0; i < 100 && !fn(); i += 1) await new Promise((r) => setTimeout(r, 20));
    assert.ok(fn());
  };
  const first = make('first');
  await until(() => statuses.first.some((s) => s.connected));
  const second = make('second');
  try {
    await until(() => statuses.first.some((s) => s.replaced));
    await new Promise((r) => setTimeout(r, 1500)); // longer than the 1s retry
    assert.equal(statuses.second.filter((s) => s.connected).length, 1, 'the newer copy stays connected');
    assert.equal(statuses.first.filter((s) => s.connected).length, 1, 'the replaced copy did not come back');
  } finally {
    first.stop();
    second.stop();
    await relay.close();
  }
});

test('three app transports share a room through the relay', async () => {
  const relay = createRelay({ port: 0 });
  await relay.ready;
  const url = `ws://127.0.0.1:${relay.port()}`;
  const made = [];

  const makeClient = (code, name, room) => {
    const inbox = [];
    const transport = createTransport({
      getHello: () => ({ code, key: keyFor(code), name, room }),
      onMessage: (msg) => inbox.push(msg),
      onStatus: () => {},
    });
    transport.connect(url);
    made.push(transport);
    return { transport, inbox };
  };
  const until = async (fn) => {
    for (let i = 0; i < 100 && !fn(); i += 1) await new Promise((r) => setTimeout(r, 20));
    assert.ok(fn());
  };
  const lastRoom = (c) => [...c.inbox].reverse().find((m) => m.type === 'room');

  try {
    const a = makeClient('AAAAAA', '에이', 'ROOM22');
    await until(() => lastRoom(a));
    const b = makeClient('BBBBBB', '비', 'ROOM22');
    const c = makeClient('CCCCCC', '씨', 'ROOM22');
    await until(() => lastRoom(a) && lastRoom(a).members.length === 3);

    b.transport.send({ type: 'say', message: '다들 안녕' });
    await until(() => [a, b, c].every((x) => x.inbox.some((m) => m.type === 'said')));
    assert.equal(c.inbox.find((m) => m.type === 'said').fromName, '비');
  } finally {
    made.forEach((t) => t.stop());
    await relay.close();
  }
});

// --- 일정: parseMember·표 계산 ---

const roomWith = (member, extra = {}) => parseServerMessage(JSON.stringify({
  type: 'room', room: 'ROOM22', members: [{ code: 'AAAAAA', name: '동동', online: true, ...member }], history: [], ...extra,
}));

test('parseMember keeps status and schedule', () => {
  const schedule = [
    { from: '2026-11-02', to: '2026-11-03', kind: 'trip' },
    { from: '2026-10-30', to: '2026-10-30', kind: 'half-pm', note: '병원' },
  ];
  const room = roomWith({ status: { kind: 'half-pm', label: '오후반차' }, schedule }, { today: '2026-10-30' });
  const [member] = room.members;
  assert.deepEqual(member.status, { kind: 'half-pm', label: '오후반차' });
  assert.deepEqual(member.schedule, [schedule[1], schedule[0]]); // from 오름차순
  assert.equal(room.today, '2026-10-30');
});

test('parseMember drops unknown status kind', () => {
  assert.equal(roomWith({ status: { kind: 'vacation', label: '휴가' } }).members[0].status, null);
  assert.equal(roomWith({ status: { kind: 'leave', label: '   ' } }).members[0].status, null);
  assert.equal(roomWith({ status: 'leave' }).members[0].status, null);
});

test('parseMember drops oversized schedule', () => {
  const entry = { from: '2026-10-30', to: '2026-10-30', kind: 'out' };
  assert.deepEqual(roomWith({ schedule: Array(31).fill(entry) }).members[0].schedule, []);
  assert.equal(roomWith({ schedule: Array(30).fill(entry) }).members[0].schedule.length, 30);
  assert.deepEqual(roomWith({ schedule: [{ ...entry, kind: 'nap' }] }).members[0].schedule, []);
});

test('parseMember defaults when fields missing', () => {
  const room = roomWith({}, { today: '10/30' });
  assert.equal(room.members[0].status, null);
  assert.deepEqual(room.members[0].schedule, []);
  assert.equal(room.today, null);
  assert.equal(roomWith({}).today, null);
});

const viewOf = (schedule, today = '2026-10-30') => buildScheduleView([{ code: 'AAAAAA', name: '동동', schedule }], today);

test('schedule view marks weekends', () => {
  const { days, rows } = viewOf([]);
  assert.equal(days.length, 14);
  assert.deepEqual(days[0], { date: '2026-10-30', label: '10/30', dow: '금', weekend: false, isToday: true });
  assert.deepEqual(days.filter((d) => d.weekend).map((d) => d.date), ['2026-10-31', '2026-11-01', '2026-11-07', '2026-11-08']);
  assert.equal(days.filter((d) => d.isToday).length, 1);
  assert.deepEqual(rows[0].cells, Array(14).fill(null));
});

test('schedule view uses status priority', () => {
  const { rows } = viewOf([
    { from: '2026-10-30', to: '2026-10-30', kind: 'lunch' },
    { from: '2026-10-30', to: '2026-11-02', kind: 'trip' },
    { from: '2026-11-03', to: '2026-11-03', kind: 'note', note: '병원 예약' },
  ]);
  const { cells } = rows[0];
  assert.deepEqual(cells[0], { kind: 'trip', short: '출장', full: '출장' });
  assert.equal(cells[3].kind, 'trip');
  assert.deepEqual(cells[4], { kind: 'note', short: '병원', full: '메모 · 병원 예약' });
  assert.equal(cells[5], null);
});

test('schedule view crosses month boundary', () => {
  const { days, rows } = viewOf([{ from: '2026-10-31', to: '2026-11-01', kind: 'leave' }]);
  assert.equal(days[1].label, '10/31');
  assert.equal(days[2].label, '11/1');
  assert.equal(days[13].date, '2026-11-12');
  assert.deepEqual(rows[0].cells.map((c) => c && c.short).slice(0, 4), [null, '연차', '연차', null]);
  assert.equal(buildScheduleView([], '2026-12-25').days[13].date, '2027-01-07');
});

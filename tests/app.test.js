const test = require('node:test');
const assert = require('node:assert/strict');
const { keyFor } = require('./helpers');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadProfile, applyChanges, withRoom } = require('../src/main/profile');
const { createTransport, parseServerMessage } = require('../src/main/transport');
const { createRelay } = require('../server/relay');

const base = { code: 'AAAAAA', name: '나', room: '', serverUrl: 'ws://localhost:8787' };
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'jakdang-'));

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
    { code: 'AAAAAA', name: '동동', character: 'mochi', color: 3, x: null, online: true, away: false, avatar: null, avatarKind: null },
    { code: 'BBBBBB', name: '민지', character: 'mochi', color: null, x: null, online: true, away: true, avatar: null, avatarKind: null },
  ]);
  assert.equal(room.history.length, 1);
});

test('friend images are downloaded once, checked, and refused if they do not match', async () => {
  const { createAvatarCache, httpBase } = require('../src/main/avatars');
  const { encodePng } = require('../scripts/png');
  const { checkAvatar } = require('../shared/avatar');
  const image = encodePng(32, 32, () => [10, 20, 30, 255]);
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

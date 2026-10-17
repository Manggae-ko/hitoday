const test = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const { createRelay, MIN_SAY_INTERVAL_MS } = require('../server/relay');
const { MAX_ROOM_MEMBERS } = require('../shared/protocol');

function connect(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const inbox = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw));
    const i = waiters.findIndex((w) => w.match(msg));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else inbox.push(msg);
  });
  /** Waits for the next message of a type (optionally matching a predicate). */
  const next = (type, where = () => true) => {
    const match = (m) => m.type === type && where(m);
    const i = inbox.findIndex(match);
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
    return new Promise((resolve) => waiters.push({ match, resolve }));
  };
  const say = (obj) => ws.send(JSON.stringify(obj));
  const opened = new Promise((resolve) => ws.on('open', resolve));
  return { ws, next, say, opened };
}

async function hello(port, code, name, room) {
  const client = connect(port);
  await client.opened;
  client.say({ type: 'hello', code, name, room });
  await client.next('welcome');
  return client;
}

async function withRelay(fn, options = {}) {
  const relay = createRelay({ port: 0, ...options });
  await relay.ready;
  try {
    await fn(relay.port());
  } finally {
    await relay.close();
  }
}

const names = (room) => room.members.map((m) => m.name);

test('a new user starts outside any room', () =>
  withRelay(async (port) => {
    const a = await hello(port, 'AAAAAA', '에이');
    await a.next('left-room');
    a.ws.close();
  }));

test('create a room, others join with the invite code, everyone sees everyone', () =>
  withRelay(async (port) => {
    const a = await hello(port, 'AAAAAA', '에이');
    a.say({ type: 'create-room' });
    const created = await a.next('room');
    assert.match(created.room, /^[A-Z0-9]{6}$/);
    assert.deepEqual(names(created), ['에이']);

    const b = await hello(port, 'BBBBBB', '비');
    b.say({ type: 'join-room', room: created.room.toLowerCase() }); // typed in lowercase
    const seenByB = await b.next('room');
    assert.deepEqual(names(seenByB), ['에이', '비']);
    const seenByA = await a.next('room', (r) => r.members.length === 2);
    assert.deepEqual(seenByA.members.map((m) => m.online), [true, true]);
    a.ws.close();
    b.ws.close();
  }));

test('a message reaches every member and is kept in recent history', () =>
  withRelay(async (port) => {
    const a = await hello(port, 'AAAAAA', '에이');
    a.say({ type: 'create-room' });
    const { room } = await a.next('room');
    const b = await hello(port, 'BBBBBB', '비');
    b.say({ type: 'join-room', room });
    await b.next('room');

    a.say({ type: 'say', message: '다들 뭐해' });
    const toB = await b.next('said');
    const toA = await a.next('said');
    assert.deepEqual([toB.from, toB.fromName, toB.message], ['AAAAAA', '에이', '다들 뭐해']);
    assert.equal(toA.message, '다들 뭐해');

    const c = await hello(port, 'CCCCCC', '씨');
    c.say({ type: 'join-room', room });
    const seenByC = await c.next('room');
    assert.deepEqual(seenByC.history.map((h) => h.message), ['다들 뭐해']);
    [a, b, c].forEach((x) => x.ws.close());
  }));

test('closing the app shows you as offline; coming back puts you back in the room', () =>
  withRelay(async (port) => {
    const a = await hello(port, 'AAAAAA', '에이');
    a.say({ type: 'create-room' });
    const { room } = await a.next('room');
    const b = await hello(port, 'BBBBBB', '비');
    b.say({ type: 'join-room', room });
    await a.next('room', (r) => r.members.length === 2);

    b.ws.close();
    const asleep = await a.next('room', (r) => r.members.some((m) => !m.online));
    assert.deepEqual(asleep.members.map((m) => [m.name, m.online]), [['에이', true], ['비', false]]);

    const b2 = await hello(port, 'BBBBBB', '비');
    assert.equal((await b2.next('room')).room, room);
    a.ws.close();
    b2.ws.close();
  }));

test('after a server restart, the room is rebuilt from the code apps remember', () =>
  withRelay(async (port) => {
    const a = await hello(port, 'AAAAAA', '에이', 'ROOM22');
    const rebuilt = await a.next('room');
    assert.equal(rebuilt.room, 'ROOM22');
    const b = await hello(port, 'BBBBBB', '비', 'ROOM22');
    assert.deepEqual(names(await b.next('room')), ['에이', '비']);
    a.ws.close();
    b.ws.close();
  }));

test('joining a room that does not exist, or is full, is refused', () =>
  withRelay(async (port) => {
    const a = await hello(port, 'AAAAAA', '에이');
    a.say({ type: 'join-room', room: 'NOPE22' });
    assert.equal((await a.next('error')).reason, 'no-room');

    const owner = await hello(port, 'ZZZZZ2', '방장', 'FULL22');
    await owner.next('room');
    const others = [];
    for (let i = 1; i < MAX_ROOM_MEMBERS; i += 1) {
      others.push(await hello(port, `M${String(i).padStart(5, '0')}`, `m${i}`, 'FULL22'));
    }
    a.say({ type: 'join-room', room: 'FULL22' });
    assert.equal((await a.next('error')).reason, 'room-full');
    [a, owner, ...others].forEach((x) => x.ws.close());
  }));

test('everyone in a room gets a different color, and a freed color is reused', () =>
  withRelay(async (port) => {
    const a = await hello(port, 'AAAAAA', '에이', 'COLOR2');
    await a.next('room');
    const b = await hello(port, 'BBBBBB', '비', 'COLOR2');
    const c = await hello(port, 'CCCCCC', '씨', 'COLOR2');
    const full = await a.next('room', (r) => r.members.length === 3);
    assert.deepEqual(full.members.map((m) => m.color), [0, 1, 2]);

    b.say({ type: 'leave-room' });
    await a.next('room', (r) => r.members.length === 2);
    const d = await hello(port, 'DDDDDD', '디', 'COLOR2');
    const refilled = await a.next('room', (r) => r.members.length === 3);
    assert.equal(refilled.members.find((m) => m.name === '디').color, 1);
    [a, b, c, d].forEach((x) => x.ws.close());
  }));

test('leaving removes you for everyone', () =>
  withRelay(async (port) => {
    const a = await hello(port, 'AAAAAA', '에이', 'LEAVE2');
    await a.next('room');
    const b = await hello(port, 'BBBBBB', '비', 'LEAVE2');
    await a.next('room', (r) => r.members.length === 2);
    b.say({ type: 'leave-room' });
    await b.next('left-room');
    assert.deepEqual(names(await a.next('room', (r) => r.members.length === 1)), ['에이']);
    a.ws.close();
    b.ws.close();
  }));

test('rate-limits messages sent too quickly, and refuses talk outside a room', () => {
  let clock = 1_000_000;
  return withRelay(async (port) => {
    const lonely = await hello(port, 'CCCCCC', '씨');
    lonely.say({ type: 'say', message: '여보세요' });
    assert.equal((await lonely.next('error')).reason, 'no-room');

    const a = await hello(port, 'AAAAAA', '에이', 'FAST22');
    await a.next('room');
    a.say({ type: 'say', message: '1' });
    await a.next('said');
    a.say({ type: 'say', message: '2' });
    assert.equal((await a.next('error')).reason, 'too-fast');
    clock += MIN_SAY_INTERVAL_MS;
    a.say({ type: 'say', message: '3' });
    assert.equal((await a.next('said')).message, '3');
    lonely.ws.close();
    a.ws.close();
  }, { now: () => clock });
});

test('answers health checks over plain HTTP', () =>
  withRelay(async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'ok');
  }));

test('rejects messages before hello and invalid payloads', () =>
  withRelay(async (port) => {
    const c = connect(port);
    await c.opened;
    c.say({ type: 'say', message: 'hi' });
    assert.equal((await c.next('error')).reason, 'say-hello-first');
    c.ws.send('not json');
    assert.equal((await c.next('error')).reason, 'bad-json');
    c.ws.close();
  }));

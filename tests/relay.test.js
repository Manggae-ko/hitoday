const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { keyFor } = require('./helpers');
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
  client.say({ type: 'hello', code, key: keyFor(code), name, room });
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

test("everyone sees each member's chosen character, and a re-hello updates it", () =>
  withRelay(async (port) => {
    const a = connect(port);
    await a.opened;
    a.say({ type: 'hello', code: 'AAAAAA', key: keyFor('AAAAAA'), name: '에이', room: 'ZOO222', character: 'penguin' });
    assert.equal((await a.next('room')).members[0].character, 'penguin');
    a.say({ type: 'hello', code: 'AAAAAA', key: keyFor('AAAAAA'), name: '에이', room: 'ZOO222', character: 'rabbit' });
    assert.equal((await a.next('room', (r) => r.members[0].character === 'rabbit')).members[0].character, 'rabbit');
    a.ws.close();
  }));

test('moving my character reaches the room, and the final spot always arrives', () =>
  withRelay(async (port) => {
    const a = await hello(port, 'AAAAAA', '에이', 'WALK22');
    await a.next('room');
    const b = await hello(port, 'BBBBBB', '비', 'WALK22');
    await b.next('room');

    // A quick drag: many moves in a row; the last one must get through.
    [0.2, 0.3, 0.4, 0.55].forEach((x) => a.say({ type: 'move', x }));
    const last = await b.next('moved', (m) => m.x === 0.55);
    assert.equal(last.code, 'AAAAAA');

    // Late joiners see the spot in the room snapshot.
    const c = await hello(port, 'CCCCCC', '씨', 'WALK22');
    const room = await c.next('room');
    assert.equal(room.members.find((m) => m.code === 'AAAAAA').x, 0.55);
    assert.equal(room.members.find((m) => m.code === 'BBBBBB').x, null);

    a.say({ type: 'move', x: 7 });
    assert.equal((await a.next('error')).reason, 'bad-spot');
    [a, b, c].forEach((x) => x.ws.close());
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

const FAST_GAMES = { rpsMs: 300, reactionMinDelayMs: 50, reactionMaxDelayMs: 50, reactionWindowMs: 300 };

async function roomOfTwo(port, room) {
  const a = await hello(port, 'AAAAAA', '에이', room);
  await a.next('room');
  const b = await hello(port, 'BBBBBB', '비', room);
  await a.next('room', (r) => r.members.length === 2);
  await b.next('room');
  return [a, b];
}

test('coffee lottery: everyone sees the same pick and spotlight path', () =>
  withRelay(async (port) => {
    const [a, b] = await roomOfTwo(port, 'GAME01');
    a.say({ type: 'start-game', game: 'lottery' });
    const seenByA = await a.next('game');
    const seenByB = await b.next('game');
    assert.equal(seenByA.phase, 'result');
    assert.deepEqual(seenByA.players, ['AAAAAA', 'BBBBBB']);
    assert.equal(seenByA.picked, seenByB.picked);
    assert.deepEqual(seenByA.bounce, seenByB.bounce);
    assert.equal(seenByA.bounce.at(-1), seenByA.picked);
    a.ws.close();
    b.ws.close();
  }, { gameTimings: FAST_GAMES }));

test('two copies with the same code stop kicking each other: after a few swaps the newcomer is held', () =>
  withRelay(async (port) => {
    const kicks = [];
    let current = await hello(port, 'DUPE01', '복제');
    current.ws.on('close', (code) => kicks.push(code));
    // The old behaviour: each new copy kicks the last one off.
    for (let i = 0; i < 3; i += 1) {
      const next = await hello(port, 'DUPE01', '복제');
      next.ws.on('close', (code) => kicks.push(code));
      current = next;
    }
    for (let i = 0; i < 50 && kicks.length < 3; i += 1) await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(kicks, [4000, 4000, 4000]);
    // Now the next copy is held silently: no welcome, and the one online stays online.
    const held = connect(port);
    await held.opened;
    held.say({ type: 'hello', code: 'DUPE01', key: keyFor('DUPE01'), name: '복제' });
    const welcomed = await Promise.race([held.next('welcome').then(() => true), new Promise((r) => setTimeout(() => r(false), 300))]);
    assert.equal(welcomed, false, 'held, not welcomed');
    assert.equal(held.ws.readyState, held.ws.OPEN, 'held open, so an old app does not retry');
    assert.equal(current.ws.readyState, current.ws.OPEN, 'the copy already online is not kicked');
    assert.deepEqual(kicks, [4000, 4000, 4000]);
    held.ws.close();
    current.ws.close();
  }));

test('a room nobody has used for 5 days is removed, and a returning app is told it is gone', async () => {
  const DAY = 24 * 60 * 60 * 1000;
  let clock = Date.UTC(2026, 9, 1);
  const relay = createRelay({ port: 0, now: () => clock });
  await relay.ready;
  const port = relay.port();
  try {
    const a = await hello(port, 'OLDA01', '에이');
    a.say({ type: 'create-room' });
    const { room } = await a.next('room');
    a.ws.close();
    await new Promise((r) => setTimeout(r, 50));

    clock += 5 * DAY + 1;
    relay.sweepRooms();

    // The app still remembers the room and asks for it back on its next sign-in.
    const back = connect(port);
    await back.opened;
    back.say({ type: 'hello', code: 'OLDA01', key: keyFor('OLDA01'), name: '에이', room });
    await back.next('welcome');
    await back.next('left-room');

    const b = await hello(port, 'OLDB01', '비');
    b.say({ type: 'join-room', room });
    assert.equal((await b.next('error')).reason, 'no-room');
    back.ws.close();
    b.ws.close();
  } finally {
    await relay.close();
  }
});

test('race: everyone sees the same split times and finishing order', () =>
  withRelay(async (port) => {
    const [a, b] = await roomOfTwo(port, 'RACE01');
    a.say({ type: 'start-game', game: 'race' });
    const seenByA = await a.next('game');
    const seenByB = await b.next('game');
    assert.equal(seenByA.phase, 'result');
    assert.deepEqual(seenByA.race, seenByB.race);
    assert.deepEqual(seenByA.order, seenByB.order);
    assert.deepEqual([...seenByA.order].sort(), ['AAAAAA', 'BBBBBB']);
    a.ws.close();
    b.ws.close();
  }, { gameTimings: FAST_GAMES }));

test("away: stepping away shows on everyone's screen, and coming back clears it", () =>
  withRelay(async (port) => {
    const [a, b] = await roomOfTwo(port, 'AWAY01');
    b.say({ type: 'presence', away: true });
    const away = await a.next('room', (r) => r.members.some((m) => m.away));
    assert.deepEqual(away.members.map((m) => [m.code, m.away]), [['AAAAAA', false], ['BBBBBB', true]]);
    b.say({ type: 'presence', away: false });
    await a.next('room', (r) => r.members.every((m) => !m.away));
    b.say({ type: 'presence', away: true });
    await a.next('room', (r) => r.members.some((m) => m.away));
    b.ws.close();
    const gone = await a.next('room', (r) => r.members.some((m) => !m.online));
    assert.ok(gone.members.every((m) => !m.away), 'an app that closes is offline, not away');
    a.ws.close();
  }));

test('rock-paper-scissors ends as soon as everyone picks', () =>
  withRelay(async (port) => {
    const [a, b] = await roomOfTwo(port, 'GAME02');
    a.say({ type: 'start-game', game: 'rps' });
    assert.equal((await b.next('game')).phase, 'pick');
    a.say({ type: 'game-move', move: 'rock' });
    b.say({ type: 'game-move', move: 'scissors' });
    const result = await b.next('game', (g) => g.phase === 'result');
    assert.deepEqual(result.choices, { AAAAAA: 'rock', BBBBBB: 'scissors' });
    assert.deepEqual(result.winners, ['AAAAAA']);
    a.ws.close();
    b.ws.close();
  }, { gameTimings: FAST_GAMES }));

test('rock-paper-scissors times out with whoever picked', () =>
  withRelay(async (port) => {
    const [a, b] = await roomOfTwo(port, 'GAME03');
    a.say({ type: 'start-game', game: 'rps' });
    a.say({ type: 'game-move', move: 'paper' });
    const result = await a.next('game', (g) => g.phase === 'result');
    assert.deepEqual(result.choices, { AAAAAA: 'paper' });
    assert.deepEqual(result.winners, []);
    a.ws.close();
    b.ws.close();
  }, { gameTimings: FAST_GAMES }));

test('reaction race: tapping before "go" is a false start, after it is ranked', () =>
  withRelay(async (port) => {
    const [a, b] = await roomOfTwo(port, 'GAME04');
    a.say({ type: 'start-game', game: 'reaction' });
    await a.next('game', (g) => g.phase === 'ready');
    b.say({ type: 'game-move', move: 'tap' }); // too early
    await a.next('game', (g) => g.phase === 'go');
    a.say({ type: 'game-move', move: 'tap' });
    const result = await a.next('game', (g) => g.phase === 'result');
    assert.deepEqual(result.faults, ['BBBBBB']);
    assert.deepEqual(result.ranking.map((r) => r.code), ['AAAAAA']);
    a.ws.close();
    b.ws.close();
  }, { gameTimings: FAST_GAMES }));

test('games need two people online and only one runs at a time', () =>
  withRelay(async (port) => {
    const solo = await hello(port, 'CCCCCC', '씨', 'SOLO22');
    await solo.next('room');
    solo.say({ type: 'start-game', game: 'lottery' });
    assert.equal((await solo.next('error')).reason, 'need-two');

    const [a, b] = await roomOfTwo(port, 'GAME05');
    a.say({ type: 'start-game', game: 'rps' });
    await a.next('game');
    b.say({ type: 'start-game', game: 'reaction' });
    assert.equal((await b.next('error')).reason, 'game-running');
    [solo, a, b].forEach((x) => x.ws.close());
  }, { gameTimings: FAST_GAMES }));

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

const scheduleEntry = (kind, from = '2026-10-30', to = from, note) =>
  ({ from, to, kind, ...(note ? { note } : {}) });

test("schedule: offline member shows today's leave", async () => {
  const clock = Date.UTC(2026, 9, 30, 3);
  const relay = createRelay({ port: 0, now: () => clock });
  await relay.ready;
  try {
    const [a, b] = await roomOfTwo(relay.port(), 'SCH001');
    b.say({ type: 'set-schedule', entries: [scheduleEntry('leave')] });
    await b.next('schedule-saved');
    b.ws.close();
    const room = await a.next('room', (value) => value.members.some((member) => !member.online));
    const member = room.members.find((value) => value.code === 'BBBBBB');
    assert.deepEqual(member.status, { kind: 'leave', label: '연차' });
    assert.deepEqual(member.schedule, [scheduleEntry('leave')]);
    a.ws.close();
  } finally {
    await relay.close();
  }
});

test('schedule: far future entry survives replace', () =>
  withRelay(async (port) => {
    const a = await hello(port, 'AAAAAA', '에이', 'SCH002');
    await a.next('room');
    const future = scheduleEntry('trip', '2026-12-20');
    a.say({ type: 'set-schedule', entries: [future] });
    await a.next('schedule-saved');
    const room = await a.next('room', (value) => value.members[0].schedule.length === 1);
    assert.deepEqual(room.members[0].schedule, [future]);
    a.ws.close();
  }, { now: () => Date.UTC(2026, 9, 30, 3) }));

test('schedule: restart restores from schedules.json', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hitoday-relay-'));
  const clock = Date.UTC(2026, 9, 30, 3);
  const first = createRelay({ port: 0, now: () => clock, dataDir });
  await first.ready;
  const a = await hello(first.port(), 'AAAAAA', '에이', 'SCH003');
  await a.next('room');
  a.say({ type: 'set-schedule', entries: [scheduleEntry('remote')] });
  await a.next('schedule-saved');
  a.ws.close();
  await first.close();

  const restarted = createRelay({ port: 0, now: () => clock, dataDir });
  await restarted.ready;
  try {
    const back = await hello(restarted.port(), 'AAAAAA', '에이', 'SCH003');
    const room = await back.next('room');
    assert.deepEqual(room.members[0].status, { kind: 'remote', label: '재택' });
    assert.deepEqual(room.members[0].schedule, [scheduleEntry('remote')]);
    back.ws.close();
  } finally {
    await restarted.close();
  }
});

test('schedule: schedule list in snapshot', () =>
  withRelay(async (port) => {
    const a = await hello(port, 'AAAAAA', '에이', 'SCH004');
    await a.next('room');
    const entries = [scheduleEntry('note', '2026-10-30', '2026-10-30', '집중'), scheduleEntry('out', '2026-11-01')];
    a.say({ type: 'set-schedule', entries });
    await a.next('schedule-saved');
    const room = await a.next('room', (value) => value.members[0].schedule.length === 2);
    assert.equal(room.today, '2026-10-30');
    assert.deepEqual(room.members[0].schedule, entries);
    a.ws.close();
  }, { now: () => Date.UTC(2026, 9, 30, 3) }));

test('schedule: rejects bad entries and too-fast', () => {
  let clock = Date.UTC(2026, 9, 30, 3);
  return withRelay(async (port) => {
    const raw = connect(port);
    await raw.opened;
    raw.say({ type: 'set-schedule', entries: [{ from: '2026-02-30', to: '2026-02-30', kind: 'leave' }] });
    assert.equal((await raw.next('error')).reason, 'bad-schedule');
    raw.ws.close();

    const a = await hello(port, 'AAAAAA', '에이', 'SCH005');
    await a.next('room');
    a.say({ type: 'set-schedule', entries: [scheduleEntry('leave')] });
    await a.next('schedule-saved');
    a.say({ type: 'set-schedule', entries: [] });
    assert.equal((await a.next('error')).reason, 'too-fast');
    clock += 2_000;
    a.say({ type: 'set-schedule', entries: [] });
    await a.next('schedule-saved');
    a.ws.close();
  }, { now: () => clock });
});

test('schedule: only own schedule can be edited', () =>
  withRelay(async (port) => {
    const [a, b] = await roomOfTwo(port, 'SCH006');
    a.say({ type: 'set-schedule', code: 'BBBBBB', entries: [scheduleEntry('leave')] });
    await a.next('schedule-saved');
    const room = await b.next('room', (value) => value.members.some((member) => member.schedule.length));
    assert.deepEqual(room.members.find((member) => member.code === 'AAAAAA').schedule, [scheduleEntry('leave')]);
    assert.deepEqual(room.members.find((member) => member.code === 'BBBBBB').schedule, []);
    a.ws.close();
    b.ws.close();
  }, { now: () => Date.UTC(2026, 9, 30, 3) }));

test('schedule: boundary rebroadcast', async () => {
  let clock = Date.UTC(2026, 9, 30, 2, 29);
  const relay = createRelay({ port: 0, now: () => clock });
  await relay.ready;
  try {
    const a = await hello(relay.port(), 'AAAAAA', '에이', 'SCH007');
    await a.next('room');
    a.say({ type: 'set-schedule', entries: [scheduleEntry('lunch')] });
    await a.next('schedule-saved');
    await a.next('room');
    clock = Date.UTC(2026, 9, 30, 2, 31);
    assert.equal(relay.tickSchedules(), true);
    const boundary = await a.next('room');
    assert.deepEqual(boundary.members[0].status, { kind: 'lunch', label: '따점' });
    assert.equal(relay.tickSchedules(), false);
    const repeated = await Promise.race([
      a.next('room').then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 100)),
    ]);
    assert.equal(repeated, false);
    a.ws.close();
  } finally {
    await relay.close();
  }
});

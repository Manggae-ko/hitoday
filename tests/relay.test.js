const test = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const { createRelay, MIN_VISIT_INTERVAL_MS } = require('../server/relay');

function connect(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const inbox = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw));
    const i = waiters.findIndex((w) => w.type === msg.type);
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else inbox.push(msg);
  });
  const next = (type) => {
    const i = inbox.findIndex((m) => m.type === type);
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
    return new Promise((resolve) => waiters.push({ type, resolve }));
  };
  const say = (obj) => ws.send(JSON.stringify(obj));
  const opened = new Promise((resolve) => ws.on('open', resolve));
  return { ws, next, say, opened };
}

async function hello(port, code, name, friends) {
  const client = connect(port);
  await client.opened;
  client.say({ type: 'hello', code, name, friends });
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

test('friends can talk both ways and the sender gets an echo', () =>
  withRelay(async (port) => {
    const a = await hello(port, 'AAAAAA', '에이', ['BBBBBB']);
    const b = await hello(port, 'BBBBBB', '비', ['AAAAAA']);

    a.say({ type: 'visit', to: 'BBBBBB', message: '뭐해?' });
    const toB = await b.next('visit');
    assert.deepEqual([toB.from, toB.fromName, toB.message], ['AAAAAA', '에이', '뭐해?']);
    assert.deepEqual(await a.next('visit-sent'), { type: 'visit-sent', to: 'BBBBBB', message: '뭐해?', queued: false });

    b.say({ type: 'visit', to: 'AAAAAA', message: '밥 먹는 중' });
    const toA = await a.next('visit');
    assert.deepEqual([toA.from, toA.message], ['BBBBBB', '밥 먹는 중']);
    a.ws.close();
    b.ws.close();
  }));

test('queues a visit while the friend is offline and delivers it on hello', () =>
  withRelay(async (port) => {
    const a = await hello(port, 'AAAAAA', '에이', ['BBBBBB']);
    a.say({ type: 'visit', to: 'BBBBBB', message: '없을 때 왔다감' });
    assert.equal((await a.next('visit-sent')).queued, true);

    const b = await hello(port, 'BBBBBB', '비', ['AAAAAA']);
    assert.equal((await b.next('visit')).message, '없을 때 왔다감');
    a.ws.close();
    b.ws.close();
  }));

test('blocks visits from people who are not on the friend list', () =>
  withRelay(async (port) => {
    await hello(port, 'BBBBBB', '비', ['CCCCCC']);
    const stranger = await hello(port, 'AAAAAA', '모르는사람', []);
    stranger.say({ type: 'visit', to: 'BBBBBB', message: '안녕' });
    assert.equal((await stranger.next('error')).reason, 'not-friends');
    stranger.ws.close();
  }));

test('rate-limits visits sent too quickly', () => {
  let clock = 1_000_000;
  return withRelay(async (port) => {
    const a = await hello(port, 'AAAAAA', '에이', []);
    a.say({ type: 'visit', to: 'BBBBBB', message: '1' });
    await a.next('visit-sent');
    a.say({ type: 'visit', to: 'BBBBBB', message: '2' });
    assert.equal((await a.next('error')).reason, 'too-fast');

    clock += MIN_VISIT_INTERVAL_MS;
    a.say({ type: 'visit', to: 'BBBBBB', message: '3' });
    await a.next('visit-sent');
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
    c.say({ type: 'visit', to: 'BBBBBB', message: 'hi' });
    assert.equal((await c.next('error')).reason, 'say-hello-first');
    c.ws.send('not json');
    assert.equal((await c.next('error')).reason, 'bad-json');
    c.ws.close();
  }));

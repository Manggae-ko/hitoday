const test = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const { keyFor } = require('./helpers');
const { createNotifier, MAX_CONTENT } = require('../server/notify');
const { createRelay } = require('../server/relay');

const URL = 'https://discord.com/api/webhooks/1/secret';

/** A fake fetch that remembers what was posted. */
function fakeFetch({ fail = false } = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    if (fail) throw new Error('network down');
    return { ok: true, status: 204 };
  };
  return { fn, calls };
}

const tick = () => new Promise((r) => setTimeout(r, 10));

test('does nothing without a webhook address', async () => {
  const { fn, calls } = fakeFetch();
  const notifier = createNotifier({ url: '', fetch: fn, batchMs: 5 });
  notifier.notify('방이 생겼어요');
  notifier.notify('서버 켜짐', { now: true });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(calls.length, 0);
  assert.equal(notifier.enabled, false);
  notifier.stop();
});

test('refuses anything but an https address', () => {
  const { fn, calls } = fakeFetch();
  const notifier = createNotifier({ url: 'http://example.com/hook', fetch: fn });
  assert.equal(notifier.enabled, false);
  notifier.notify('x', { now: true });
  assert.equal(calls.length, 0);
  notifier.stop();
});

test('lines that arrive close together go out as one message', async () => {
  const { fn, calls } = fakeFetch();
  const notifier = createNotifier({ url: URL, fetch: fn, batchMs: 30 });
  notifier.notify('하나');
  notifier.notify('둘');
  await tick();
  assert.equal(calls.length, 0, 'held back until the batch window ends');
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, URL);
  assert.equal(calls[0].body.content, '하나\n둘');
  notifier.stop();
});

test('urgent lines go out right away, with anything already waiting', async () => {
  const { fn, calls } = fakeFetch();
  const notifier = createNotifier({ url: URL, fetch: fn, batchMs: 10_000 });
  notifier.notify('대기 중');
  notifier.notify('서버 꺼짐', { now: true });
  await tick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.content, '대기 중\n서버 꺼짐');
  notifier.stop();
});

test('a very long batch is cut to fit one message', async () => {
  const { fn, calls } = fakeFetch();
  const notifier = createNotifier({ url: URL, fetch: fn, batchMs: 10_000 });
  for (let i = 0; i < 300; i += 1) notifier.notify(`새 사용자가 처음 접속했어요 #${i}`);
  await notifier.flush();
  assert.equal(calls.length, 1);
  const { content } = calls[0].body;
  assert.ok(content.length <= MAX_CONTENT, `${content.length} > ${MAX_CONTENT}`);
  assert.match(content, /외 \d+건/);
  notifier.stop();
});

test('a failed send is logged, never thrown', async () => {
  const { fn } = fakeFetch({ fail: true });
  const logged = [];
  const notifier = createNotifier({ url: URL, fetch: fn, log: (line) => logged.push(line) });
  notifier.notify('x', { now: true });
  await tick();
  assert.ok(logged.some((line) => /notify failed/.test(line) && !line.includes('secret')), 'logs without the address');
  notifier.stop();
});

async function withRelay(notify, fn) {
  const relay = createRelay({ port: 0, notify });
  await relay.ready;
  try {
    await fn(relay.port());
  } finally {
    await relay.close();
  }
}

async function connect(port, hello) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise((resolve) => ws.on('open', resolve));
  const inbox = [];
  ws.on('message', (raw) => inbox.push(JSON.parse(String(raw))));
  ws.send(JSON.stringify({ type: 'hello', key: keyFor(hello.code), ...hello }));
  const waitFor = async (type) => {
    for (let i = 0; i < 50 && !inbox.some((m) => m.type === type); i += 1) await new Promise((r) => setTimeout(r, 20));
    return inbox.find((m) => m.type === type);
  };
  return { ws, inbox, waitFor };
}

test('the relay tells me about new people, new rooms and friends joining', async () => {
  const lines = [];
  const notify = (line) => lines.push(line);
  await withRelay(notify, async (port) => {
    const a = await connect(port, { code: 'NOTE01', name: '민지' });
    await a.waitFor('welcome');
    a.ws.send(JSON.stringify({ type: 'create-room' }));
    const room = await a.waitFor('room');

    const b = await connect(port, { code: 'NOTE02', name: '준호' });
    await b.waitFor('welcome');
    b.ws.send(JSON.stringify({ type: 'join-room', room: room.room }));
    await b.waitFor('room');

    assert.ok(lines.some((l) => l.includes('새 사용자') && l.includes('민지')));
    assert.ok(lines.some((l) => l.includes('새 사용자') && l.includes('준호')));
    assert.ok(lines.some((l) => l.includes('새 방') && l.includes('민지')));
    assert.ok(lines.some((l) => l.includes('준호') && l.includes('2명')));
    assert.ok(lines.every((l) => !l.includes(room.room)), 'room codes stay private');
    a.ws.close();
    b.ws.close();
  });
});

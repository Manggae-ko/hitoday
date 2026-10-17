const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadProfile, applyChanges } = require('../src/main/profile');
const { createTransport, parseServerMessage } = require('../src/main/transport');
const { createRelay } = require('../server/relay');

const base = { code: 'AAAAAA', name: '나', friendCode: '', serverUrl: 'ws://localhost:8787' };

test('loadProfile creates a code once and keeps it across restarts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nolleowa-'));
  const first = loadProfile(dir);
  const second = loadProfile(dir);
  assert.match(first.code, /^[A-Z0-9]{6}$/);
  assert.equal(second.code, first.code);
});

test('loadProfile recovers from a corrupted file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nolleowa-'));
  fs.writeFileSync(path.join(dir, 'profile.json'), '{broken');
  assert.match(loadProfile(dir).code, /^[A-Z0-9]{6}$/);
});

test('applyChanges normalizes the friend code and returns a new object', () => {
  const result = applyChanges(base, { name: '동동', friendCode: ' bbq234 ', serverUrl: 'wss://example.com' });
  assert.deepEqual(result.profile, { ...base, name: '동동', friendCode: 'BBQ234', serverUrl: 'wss://example.com' });
  assert.equal(base.name, '나');
});

test('applyChanges rejects my own code, bad codes, and non-websocket URLs', () => {
  const ok = { name: 'x', serverUrl: 'ws://a' };
  assert.ok(applyChanges(base, { ...ok, friendCode: 'AAAAAA' }).error);
  assert.ok(applyChanges(base, { ...ok, friendCode: 'NOPE' }).error);
  assert.ok(applyChanges(base, { name: 'x', serverUrl: 'http://a' }).error);
  assert.ok(applyChanges(base, { name: '  ', serverUrl: 'ws://a' }).error);
});

test('parseServerMessage drops malformed or unknown messages', () => {
  assert.equal(parseServerMessage('nope'), null);
  assert.equal(parseServerMessage(JSON.stringify({ type: 'visit', from: 'bad', fromName: 'x', message: 'y' })), null);
  assert.equal(parseServerMessage(JSON.stringify({ type: 'surprise' })), null);
});

test('two app transports can chat both ways through the relay', async () => {
  const relay = createRelay({ port: 0 });
  await relay.ready;
  const url = `ws://127.0.0.1:${relay.port()}`;

  const made = [];
  const makeClient = (code, name, friend) => {
    const inbox = [];
    let connectedResolve;
    const connected = new Promise((r) => { connectedResolve = r; });
    const transport = createTransport({
      getHello: () => ({ code, name, friends: [friend] }),
      onMessage: (msg) => inbox.push(msg),
      onStatus: ({ connected: isUp }) => isUp && connectedResolve(),
    });
    transport.connect(url);
    made.push(transport);
    return { transport, inbox, connected };
  };
  const until = async (fn) => {
    for (let i = 0; i < 100 && !fn(); i += 1) await new Promise((r) => setTimeout(r, 20));
    assert.ok(fn());
  };

  try {
    const a = makeClient('AAAAAA', '에이', 'BBBBBB');
    const b = makeClient('BBBBBB', '비', 'AAAAAA');
    await Promise.all([a.connected, b.connected]);

    assert.equal(a.transport.send({ type: 'visit', to: 'BBBBBB', message: '안녕' }), true);
    await until(() => b.inbox.some((m) => m.type === 'visit'));
    assert.deepEqual(b.inbox.find((m) => m.type === 'visit'), { type: 'visit', from: 'AAAAAA', fromName: '에이', message: '안녕' });

    await until(() => a.inbox.some((m) => m.type === 'visit-sent'));
    assert.equal(a.inbox.find((m) => m.type === 'visit-sent').message, '안녕');

    b.transport.send({ type: 'visit', to: 'AAAAAA', message: '어 안녕' });
    await until(() => a.inbox.some((m) => m.type === 'visit'));
  } finally {
    made.forEach((t) => t.stop());
    await relay.close();
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { keyFor } = require('./helpers');
const WebSocket = require('ws');
const { encodePng } = require('../scripts/png');
const { checkAvatar, decodeBase64, MAX_AVATAR_BYTES } = require('../shared/avatar');
const { createRelay } = require('../server/relay');

const png = (size) => encodePng(size, size, () => [200, 120, 80, 255]);

test('accepts a 16×16 single frame and a 64×64 sheet', () => {
  assert.equal(checkAvatar(png(16)).kind, 'single');
  assert.equal(checkAvatar(png(64)).kind, 'sheet');
  assert.match(checkAvatar(png(16)).version, /^[0-9a-f]{12}$/);
});

test('rejects other sizes, non-PNG data, and oversized files', () => {
  assert.equal(checkAvatar(png(32)).error, 'bad-size');
  assert.equal(checkAvatar(png(128)).error, 'bad-size');
  assert.equal(checkAvatar(encodePng(32, 64, () => [0, 0, 0, 255])).error, 'bad-size');
  assert.equal(checkAvatar(Buffer.from('GIF89a this is not a png at all, nope')).error, 'not-png');
  const huge = Buffer.concat([png(16), Buffer.alloc(MAX_AVATAR_BYTES)]);
  assert.equal(checkAvatar(huge).error, 'too-big');
});

test('base64 decoding refuses junk characters', () => {
  assert.equal(decodeBase64('abc$%^'), null);
  assert.equal(decodeBase64(42), null);
  assert.ok(Buffer.isBuffer(decodeBase64(png(16).toString('base64'))));
});

async function client(port, code, room) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const inbox = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw));
    const i = waiters.findIndex((w) => w.match(msg));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else inbox.push(msg);
  });
  const next = (match) => {
    const i = inbox.findIndex(match);
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
    return new Promise((resolve) => waiters.push({ match, resolve }));
  };
  await new Promise((resolve) => ws.on('open', resolve));
  ws.send(JSON.stringify({ type: 'hello', code, key: keyFor(code), name: code, room }));
  await next((m) => m.type === 'room');
  return { ws, next, say: (obj) => ws.send(JSON.stringify(obj)) };
}

test('an uploaded image reaches the room and is served over HTTP', async () => {
  const relay = createRelay({ port: 0 });
  await relay.ready;
  const port = relay.port();
  try {
    const a = await client(port, 'AAAAAA', 'PIXEL2');
    const b = await client(port, 'BBBBBB', 'PIXEL2');
    const image = png(64);
    a.say({ type: 'set-avatar', png: image.toString('base64') });
    const room = await b.next((m) => m.type === 'room' && m.members.some((x) => x.avatar));
    const member = room.members.find((x) => x.code === 'AAAAAA');
    assert.equal(member.avatar, checkAvatar(image).version);
    assert.equal(member.avatarKind, 'sheet');

    const res = await fetch(`http://127.0.0.1:${port}/avatars/AAAAAA.png`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.ok(Buffer.from(await res.arrayBuffer()).equals(image));
    assert.equal((await fetch(`http://127.0.0.1:${port}/avatars/BBBBBB.png`)).status, 404);

    a.say({ type: 'set-avatar', png: png(32).toString('base64') });
    assert.equal((await a.next((m) => m.type === 'error')).reason, 'bad-size');
    a.ws.close();
    b.ws.close();
  } finally {
    await relay.close();
  }
});

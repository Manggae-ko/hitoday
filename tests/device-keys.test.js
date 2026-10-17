const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const WebSocket = require('ws');
const { keyFor } = require('./helpers');
const { createRelay } = require('../server/relay');
const { createDeviceKeys } = require('../server/device-keys');

const OTHER_KEY = 'z'.repeat(43);

/** Says hello and resolves with the first reply type ('welcome' or 'error:<reason>'). */
function helloOnce(port, code, key) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', code, key, name: 'x' })));
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      ws.close();
      resolve(msg.type === 'error' ? `error:${msg.reason}` : msg.type);
    });
    ws.on('error', reject);
  });
}

test('the first device claims a code; another key for it is refused', async () => {
  const relay = createRelay({ port: 0 });
  await relay.ready;
  try {
    assert.equal(await helloOnce(relay.port(), 'AAAAAA', keyFor('AAAAAA')), 'welcome');
    assert.equal(await helloOnce(relay.port(), 'AAAAAA', OTHER_KEY), 'error:bad-key');
    assert.equal(await helloOnce(relay.port(), 'AAAAAA', keyFor('AAAAAA')), 'welcome');
  } finally {
    await relay.close();
  }
});

test('claims survive a server restart, and only hashes are written to disk', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jakdang-keys-'));
  const first = createRelay({ port: 0, dataDir });
  await first.ready;
  assert.equal(await helloOnce(first.port(), 'BBBBBB', keyFor('BBBBBB')), 'welcome');
  await first.close(); // flushes the key file

  const saved = fs.readFileSync(path.join(dataDir, 'device-keys.json'), 'utf8');
  assert.ok(!saved.includes(keyFor('BBBBBB')), 'the raw key must never be stored');

  const second = createRelay({ port: 0, dataDir });
  await second.ready;
  try {
    assert.equal(await helloOnce(second.port(), 'BBBBBB', OTHER_KEY), 'error:bad-key');
    assert.equal(await helloOnce(second.port(), 'BBBBBB', keyFor('BBBBBB')), 'welcome');
  } finally {
    await second.close();
  }
});

test('a corrupted key file is ignored instead of crashing the server', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jakdang-keys-'));
  const file = path.join(dir, 'device-keys.json');
  fs.writeFileSync(file, '{not json');
  const keys = createDeviceKeys({ file });
  assert.equal(keys.size(), 0);
  assert.equal(keys.check('CCCCCC', keyFor('CCCCCC')), 'claimed');
});

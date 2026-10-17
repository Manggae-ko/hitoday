const test = require('node:test');
const assert = require('node:assert/strict');
const { createRelay } = require('../server/relay');
const { downloadUrl } = require('../server/web');

async function withRelay(options, fn) {
  const relay = createRelay({ port: 0, ...options });
  await relay.ready;
  try {
    await fn(`http://127.0.0.1:${relay.port()}`);
  } finally {
    await relay.close();
  }
}

test('serves the download page with security headers', () =>
  withRelay({}, async (base) => {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.match(await res.text(), /맥 다운로드/);
  }));

test('download buttons redirect to the latest GitHub release asset', () =>
  withRelay({ repo: 'dong/nolleowa' }, async (base) => {
    const mac = await fetch(`${base}/download/mac`, { redirect: 'manual' });
    assert.equal(mac.status, 302);
    assert.equal(mac.headers.get('location'), 'https://github.com/dong/nolleowa/releases/latest/download/Nolleowa-mac.dmg');
    const win = await fetch(`${base}/download/win`, { redirect: 'manual' });
    assert.equal(win.headers.get('location'), 'https://github.com/dong/nolleowa/releases/latest/download/Nolleowa-Setup.exe');
  }));

test('downloads say "not ready" until a repo is configured', () =>
  withRelay({ repo: '' }, async (base) => {
    assert.equal((await fetch(`${base}/download/mac`, { redirect: 'manual' })).status, 503);
  }));

test('unknown paths and methods are rejected', () =>
  withRelay({}, async (base) => {
    assert.equal((await fetch(`${base}/download/linux`)).status, 404);
    assert.equal((await fetch(`${base}/`, { method: 'POST' })).status, 405);
  }));

test('downloadUrl refuses repo names that could break the URL', () => {
  assert.equal(downloadUrl('evil.com/x?y', 'mac'), null);
  assert.equal(downloadUrl('a/b/c', 'mac'), null);
});

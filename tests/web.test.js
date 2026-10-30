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
    assert.match(await res.text(), /윈도우 다운로드/);
  }));

test('the privacy policy has its own script-free page, linked from the download page', () =>
  withRelay({ gaId: 'G-ABC123XYZ' }, async (base) => {
    const res = await fetch(`${base}/privacy`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
    assert.ok(!res.headers.get('content-security-policy').includes('script-src'), 'no scripts, even with analytics on');
    const html = await res.text();
    assert.match(html, /개인정보처리방침/);
    assert.match(html, /github\.com\/Manggae-ko\/hitoday\/issues/);
    assert.ok(!html.includes('googletagmanager'));
    assert.match(await (await fetch(`${base}/`)).text(), /href="\/privacy"/);
  }));

test('download buttons redirect to the latest GitHub release asset', () =>
  withRelay({ repo: 'dong/hitoday' }, async (base) => {
    const win = await fetch(`${base}/download/win`, { redirect: 'manual' });
    assert.equal(win.headers.get('location'), 'https://github.com/dong/hitoday/releases/latest/download/HIToday-Setup.exe');
  }));

test('downloads say "not ready" until a repo is configured', () =>
  withRelay({ repo: '' }, async (base) => {
    assert.equal((await fetch(`${base}/download/win`, { redirect: 'manual' })).status, 503);
  }));

test('serves the pixel characters used on the download page', () =>
  withRelay({}, async (base) => {
    const res = await fetch(`${base}/sprites/ghost-2.png`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.equal((await fetch(`${base}/sprites/../package.json`)).status, 404);
    assert.equal((await fetch(`${base}/sprites/ghost-99.png`)).status, 404);
  }));

test('unknown paths and methods are rejected', () =>
  withRelay({}, async (base) => {
    assert.equal((await fetch(`${base}/download/linux`)).status, 404);
    assert.equal((await fetch(`${base}/`, { method: 'POST' })).status, 405);
  }));

test('downloadUrl refuses repo names that could break the URL', () => {
  assert.equal(downloadUrl('evil.com/x?y', 'win'), null);
  assert.equal(downloadUrl('a/b/c', 'win'), null);
});

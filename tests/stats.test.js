const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const WebSocket = require('ws');
const { keyFor } = require('./helpers');
const { createStats, dayOf } = require('../server/stats');
const { createRelay } = require('../server/relay');

const TOKEN = 'a-long-enough-stats-token';

test('days roll over at midnight Korea time, not UTC', () => {
  const beforeMidnightKst = Date.UTC(2026, 9, 17, 14, 59); // 23:59 KST
  const afterMidnightKst = Date.UTC(2026, 9, 17, 15, 1); // 00:01 KST next day
  assert.equal(dayOf(beforeMidnightKst), '2026-10-17');
  assert.equal(dayOf(afterMidnightKst), '2026-10-18');
});

test('counts events per day, keeps the peak, ignores unknown events', () => {
  let clock = Date.UTC(2026, 9, 17, 3, 0);
  const stats = createStats({ now: () => clock, live: () => ({ online: 3, rooms: 1 }) });
  stats.record('page_view');
  stats.record('page_view');
  stats.record('download_mac');
  stats.record('something_else');
  stats.notePeak(5);
  stats.notePeak(2);
  clock += 24 * 60 * 60 * 1000;
  stats.record('page_view');

  const report = stats.report(3);
  assert.deepEqual(report.live, { online: 3, rooms: 1 });
  assert.equal(report.today.page_view, 1);
  assert.equal(report.days[1].page_view, 2);
  assert.equal(report.days[1].peak_online, 5);
  assert.equal(report.totals.page_view, 3);
  assert.equal(report.totals.download_mac, 1);
  stats.stop();
});

test('daily counts survive a restart', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hitoday-stats-'));
  const file = path.join(dir, 'stats.json');
  const now = () => Date.UTC(2026, 9, 17, 3, 0);
  const first = createStats({ file, now });
  first.record('message', 4);
  first.stop();
  const second = createStats({ file, now });
  assert.equal(second.report().today.message, 4);
  second.stop();
});

async function withRelay(options, fn) {
  const relay = createRelay({ port: 0, ...options });
  await relay.ready;
  try {
    await fn(`http://127.0.0.1:${relay.port()}`, relay.port());
  } finally {
    await relay.close();
  }
}

test('the stats page needs the token, and does not exist without one', async () => {
  await withRelay({ statsToken: '' }, async (base) => {
    assert.equal((await fetch(`${base}/stats`)).status, 404);
  });
  await withRelay({ statsToken: 'short' }, async (base) => {
    assert.equal((await fetch(`${base}/stats?token=short`)).status, 404, 'short tokens are refused');
  });
  await withRelay({ statsToken: TOKEN }, async (base) => {
    assert.equal((await fetch(`${base}/stats`)).status, 401);
    assert.equal((await fetch(`${base}/stats?token=wrong-token-wrong-token`)).status, 401);
    const page = await fetch(`${base}/stats?token=${TOKEN}`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /오늘뭐해\? 통계/);
    const json = await fetch(`${base}/stats.json`, { headers: { authorization: `Bearer ${TOKEN}` } });
    assert.equal(json.status, 200);
  });
});

test('visits, downloads, sign-ins and messages show up in the numbers', () =>
  withRelay({ statsToken: TOKEN, repo: 'naego/hitoday' }, async (base, port) => {
    await fetch(`${base}/`);
    await fetch(`${base}/download/win`, { redirect: 'manual' });

    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((resolve) => ws.on('open', resolve));
    const inbox = [];
    ws.on('message', (raw) => inbox.push(JSON.parse(String(raw))));
    ws.send(JSON.stringify({ type: 'hello', code: 'STAT01', key: keyFor('STAT01'), name: '통계', room: 'STATRM' }));
    for (let i = 0; i < 50 && !inbox.some((m) => m.type === 'room'); i += 1) await new Promise((r) => setTimeout(r, 20));
    ws.send(JSON.stringify({ type: 'say', message: '하나' }));
    for (let i = 0; i < 50 && !inbox.some((m) => m.type === 'said'); i += 1) await new Promise((r) => setTimeout(r, 20));

    const report = await (await fetch(`${base}/stats.json?token=${TOKEN}`)).json();
    assert.equal(report.today.page_view, 1);
    assert.equal(report.today.download_win, 1);
    assert.equal(report.today.new_device, 1);
    assert.equal(report.today.connect, 1);
    assert.equal(report.today.message, 1);
    assert.equal(report.live.online, 1);
    assert.equal(report.live.rooms, 1);
    ws.close();
  }));

test('Google Analytics is added only with a valid id, under a per-visit nonce', async () => {
  await withRelay({ gaId: 'G-ABC123XYZ' }, async (base) => {
    const res = await fetch(`${base}/`);
    const html = await res.text();
    const csp = res.headers.get('content-security-policy');
    const nonce = csp.match(/'nonce-([^']+)'/)[1];
    assert.ok(html.includes(`<script nonce="${nonce}" async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ">`));
    assert.match(html, /Google Analytics를 사용해요/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const again = await fetch(`${base}/`);
    assert.notEqual(again.headers.get('content-security-policy'), csp, 'nonce changes every visit');
  });
  await withRelay({ gaId: 'not-an-id"><script>' }, async (base) => {
    const res = await fetch(`${base}/`);
    assert.ok(!(await res.text()).includes('googletagmanager'));
    assert.ok(!res.headers.get('content-security-policy').includes('script-src'));
  });
});

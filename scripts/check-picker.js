// Clicks the rock-paper-scissors hand picker in the real app, the way a person would
// (mouse press and release over the DevTools protocol), and checks the hand reaches the
// server without the settings window popping open. Needs a desktop session.
// Usage: npm run check:picker
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const REPO = path.join(__dirname, '..');
const WebSocket = require('ws');
const { createRelay } = require('../server/relay');
const ELECTRON = require('electron');
const PORT = 18799;
const DEBUG_PORT = 9333;
const ROOM = 'PICKRM';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdpTargets() {
  for (let i = 0; i < 50; i += 1) {
    try {
      return await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
    } catch { await wait(200); }
  }
  throw new Error('app debug port never opened');
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw));
    if (pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  const ready = new Promise((r) => ws.on('open', r));
  const send = (method, params = {}) => new Promise((resolve) => {
    id += 1;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  return { ready, send, close: () => ws.close() };
}

let app = null;
process.on('exit', () => { if (app) app.kill('SIGKILL'); });
(async () => {
  const relay = createRelay({ port: PORT });
  await relay.ready;

  // Test profile already in ROOM, pointed at the local relay.
  const userData = path.join(os.homedir(), 'Library/Application Support/hitoday-picktest');
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(path.join(userData, 'profile.json'), JSON.stringify({
    code: 'PICK01', name: '내고', room: ROOM, serverUrl: `ws://127.0.0.1:${PORT}`, character: 'penguin',
  }));

  app = spawn(ELECTRON, [REPO, `--remote-debugging-port=${DEBUG_PORT}`], {
    env: { ...process.env, HITODAY_PROFILE: 'picktest' },
    stdio: 'ignore',
  });

  // A bot friend in the same room.
  const bot = new WebSocket(`ws://127.0.0.1:${PORT}`);
  await new Promise((r) => bot.on('open', r));
  let result = null;
  bot.on('message', (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === 'game' && msg.phase === 'pick') setTimeout(() => bot.send(JSON.stringify({ type: 'game-move', move: 'rock' })), 300);
    if (msg.type === 'game' && msg.phase === 'result') result = msg;
  });

  const targets = await cdpTargets();
  await wait(3000); // app connects and joins
  bot.send(JSON.stringify({ type: 'hello', code: 'BOT001', key: `BOT001${'k'.repeat(37)}`, name: '준호', character: 'rabbit', room: ROOM }));
  await wait(2500);

  const overlay = (await cdpTargets()).find((t) => t.type === 'page' && t.url.includes('overlay.html'));
  if (!overlay) throw new Error(`overlay not found: ${targets.map((t) => t.url).join(', ')}`);
  const page = cdp(overlay.webSocketDebuggerUrl);
  await page.ready;

  bot.send(JSON.stringify({ type: 'start-game', game: 'rps' }));
  await wait(1500);

  const { result: { result: box } } = await page.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const b = document.querySelector('.hand-picker button[aria-label]');
      const all = [...document.querySelectorAll('.hand-picker button')];
      const scissors = all.find((x) => x.textContent.includes('✌')) || b;
      if (!scissors) return null;
      const r = scissors.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`,
  });
  if (!box.value) {
    const { result: { result: dbg } } = await page.send('Runtime.evaluate', { returnByValue: true, expression: "[...document.querySelectorAll('body *')].filter((e) => e.children.length < 4 && e.className).slice(0, 40).map((e) => e.tagName + '.' + e.className + '=' + (e.textContent || '').slice(0, 12)).join(' ; ')" });
    throw new Error('hand picker did not appear; overlay says: ' + dbg.value);
  }
  const { x, y } = box.value;
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    await wait(60);
  }
  await wait(1500);

  const { result: { result: bubble } } = await page.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `[...document.querySelectorAll('.bubble')].map((b) => b.textContent).join(' | ')`,
  });
  const windows = (await cdpTargets()).filter((t) => t.type === 'page').map((t) => path.basename(t.url));

  console.log('bubbles:', bubble.value);
  console.log('windows:', windows.join(', '));
  console.log('my hand reached the server:', result ? JSON.stringify(result.choices) : 'no result yet');
  const ok = result && result.choices.PICK01 === 'scissors' && !windows.includes('control.html');
  console.log(ok ? 'PASS' : 'FAIL');

  page.close();
  bot.close();
  app.kill();
  await relay.close();
  fs.rmSync(userData, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
})().catch((err) => {
  console.error(`verify failed: ${err.message}`);
  process.exit(1);
});

// Load test: starts the relay as its own process, connects many fake users in rooms,
// keeps them chatting and moving, and reports the server's memory and CPU.
// Usage: node scripts/load-test.js [users=2000] [roomSize=6] [seconds=40]

const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const WebSocket = require('ws');

const USERS = Number(process.argv[2]) || 2000;
const ROOM_SIZE = Number(process.argv[3]) || 6;
const SECONDS = Number(process.argv[4]) || 40;
const PORT = 18787;
const CONNECT_BATCH = 100;
const MOVE_EVERY_MS = 3_000; // each user nudges their character every few seconds
const SAY_EVERY_MS = 15_000; // and says something now and then

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const codeFor = (i) => `L${String(i).padStart(5, '0')}`;
const keyFor = (code) => `${code}${'k'.repeat(43)}`.slice(0, 43);
const roomFor = (i) => `R${String(Math.floor(i / ROOM_SIZE)).padStart(5, '0')}`;

function serverStats(pid) {
  const [rss, cpu] = execFileSync('ps', ['-o', 'rss=,%cpu=', '-p', String(pid)]).toString().trim().split(/\s+/);
  return { rssMb: Math.round(Number(rss) / 1024), cpu: Number(cpu) };
}

function connect(i, counters) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'hello', code: codeFor(i), key: keyFor(codeFor(i)), name: `u${i}`, room: roomFor(i) }));
    });
    ws.on('message', () => { counters.received += 1; });
    ws.on('error', () => { counters.errors += 1; resolve(null); });
    ws.once('message', () => resolve(ws));
  });
}

async function main() {
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'relay.js')], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: path.join(require('node:os').tmpdir(), `hitoday-load-${Date.now()}`) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve) => server.stdout.on('data', (d) => String(d).includes('listening') && resolve()));
  const idle = serverStats(server.pid);

  const counters = { received: 0, errors: 0, sent: 0 };
  const sockets = [];
  const t0 = Date.now();
  for (let i = 0; i < USERS; i += CONNECT_BATCH) {
    const batch = await Promise.all(Array.from({ length: Math.min(CONNECT_BATCH, USERS - i) }, (_, k) => connect(i + k, counters)));
    sockets.push(...batch.filter(Boolean));
  }
  const connectedIn = Date.now() - t0;
  await wait(2_000);
  const connected = serverStats(server.pid);

  // Activity: spread users over time so the load is steady, like real use.
  const timers = sockets.flatMap((ws, i) => [
    setInterval(() => { ws.send(JSON.stringify({ type: 'move', x: Math.random() })); counters.sent += 1; }, MOVE_EVERY_MS + (i % 50) * 20),
    setInterval(() => { ws.send(JSON.stringify({ type: 'say', message: `hi ${i}` })); counters.sent += 1; }, SAY_EVERY_MS + (i % 100) * 37),
  ]);

  const samples = [];
  const receivedBefore = counters.received;
  for (let s = 0; s < SECONDS; s += 5) {
    await wait(5_000);
    samples.push(serverStats(server.pid));
  }
  const busy = samples.slice(1); // skip the warm-up sample
  const avg = (key) => Math.round(busy.reduce((sum, x) => sum + x[key], 0) / busy.length);
  const max = (key) => Math.max(...busy.map((x) => x[key]));

  timers.forEach(clearInterval);
  sockets.forEach((ws) => ws.terminate());
  server.kill('SIGTERM');

  const lines = [
    `users connected: ${sockets.length}/${USERS} in ${(connectedIn / 1000).toFixed(1)}s (rooms of ${ROOM_SIZE}), errors: ${counters.errors}`,
    `server memory: idle ${idle.rssMb}MB → all connected ${connected.rssMb}MB → busy avg ${avg('rssMb')}MB (max ${max('rssMb')}MB)`,
    `server CPU while busy: avg ${avg('cpu')}% (max ${max('cpu')}%) of one core`,
    `messages: sent ${counters.sent} by users, delivered ${counters.received - receivedBefore} in ${SECONDS}s`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

main().catch((err) => {
  process.stderr.write(`load test failed: ${err.stack}\n`);
  process.exit(1);
});

// Tiny relay: passes chat lines ("visit" messages) between friends, both ways.
// It never sees anyone's screen — only codes, names and short notes.

const http = require('node:http');
const { WebSocketServer } = require('ws');
const { parseClientMessage } = require('../shared/protocol');

const MIN_VISIT_INTERVAL_MS = 800; // fast enough to chat, slow enough to stop spam

const MAX_QUEUED_PER_USER = 20;
const QUEUE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PAYLOAD_BYTES = 2_048;

function send(ws, payload) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function createRelay({ port = 8787, now = Date.now, log = () => {} } = {}) {
  const online = new Map(); // code -> ws
  const friendsOf = new Map(); // code -> Set of codes they accept visits from
  const queues = new Map(); // code -> pending visits
  const lastVisitAt = new Map(); // code -> timestamp

  // Plain HTTP for hosting health checks; WebSockets upgrade on the same port.
  const httpServer = http.createServer((req, res) => {
    const healthy = req.url === '/health';
    res.writeHead(healthy ? 200 : 404, { 'content-type': 'text/plain' });
    res.end(healthy ? 'ok' : 'not found');
  });
  const wss = new WebSocketServer({ server: httpServer, maxPayload: MAX_PAYLOAD_BYTES });

  function flushQueue(code, ws) {
    const fresh = (queues.get(code) || []).filter((v) => now() - v.sentAt < QUEUE_TTL_MS);
    queues.delete(code);
    // late: left while they were offline, so it shows as a note, not a visit.
    fresh.forEach((visit) => send(ws, { ...visit, late: true }));
  }

  function enqueue(code, visit) {
    const queue = queues.get(code) || [];
    queues.set(code, [...queue, visit].slice(-MAX_QUEUED_PER_USER));
  }

  function handleHello(ws, msg) {
    const previous = online.get(msg.code);
    if (previous && previous !== ws) previous.close(4000, 'replaced');
    ws.user = { code: msg.code, name: msg.name };
    online.set(msg.code, ws);
    friendsOf.set(msg.code, new Set(msg.friends));
    send(ws, { type: 'welcome', code: msg.code });
    flushQueue(msg.code, ws);
    log(`hello ${msg.code}`);
  }

  function handleVisit(ws, msg) {
    const from = ws.user.code;
    const last = lastVisitAt.get(from) || 0;
    if (now() - last < MIN_VISIT_INTERVAL_MS) return send(ws, { type: 'error', reason: 'too-fast' });

    const accepted = friendsOf.get(msg.to);
    if (accepted && !accepted.has(from)) return send(ws, { type: 'error', reason: 'not-friends' });

    lastVisitAt.set(from, now());
    const { message, opens } = msg;
    const visit = { type: 'visit', from, fromName: ws.user.name, message, opens, sentAt: now() };
    const target = online.get(msg.to);
    if (target) send(target, visit);
    else enqueue(msg.to, visit);
    send(ws, { type: 'visit-sent', to: msg.to, message, opens, queued: !target });
  }

  const HANDLERS = { visit: handleVisit };

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      const parsed = parseClientMessage(String(raw));
      if (!parsed.ok) return send(ws, { type: 'error', reason: parsed.error });
      const msg = parsed.value;
      if (msg.type === 'hello') return handleHello(ws, msg);
      if (!ws.user) return send(ws, { type: 'error', reason: 'say-hello-first' });
      return HANDLERS[msg.type](ws, msg);
    });
    ws.on('close', () => {
      if (ws.user && online.get(ws.user.code) === ws) online.delete(ws.user.code);
    });
    ws.on('error', (err) => log(`socket error: ${err.message}`));
  });

  const ready = new Promise((resolve) => httpServer.listen(port, resolve));

  return {
    ready,
    port: () => httpServer.address().port,
    close: () => new Promise((resolve) => {
      wss.clients.forEach((c) => c.terminate());
      wss.close(() => httpServer.close(resolve));
    }),
  };
}

module.exports = { createRelay, MIN_VISIT_INTERVAL_MS };

if (require.main === module) {
  const port = Number(process.env.PORT) || 8787;
  const relay = createRelay({ port, log: (line) => process.stdout.write(`${line}\n`) });
  relay.ready.then(() => process.stdout.write(`놀러와 relay listening on :${port}\n`));
}

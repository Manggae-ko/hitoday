// Keeps one WebSocket open to the relay and reconnects with backoff.

const WebSocket = require('ws');
const { isCode, cleanText, MAX_NAME_LENGTH, MAX_MESSAGE_LENGTH } = require('../../shared/protocol');

const MIN_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

// The server is external input too: only pass on messages we understand.
function parseServerMessage(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  switch (data.type) {
    case 'visit': {
      const fromName = cleanText(data.fromName, MAX_NAME_LENGTH);
      const message = cleanText(data.message, MAX_MESSAGE_LENGTH);
      if (!isCode(data.from) || !fromName || !message) return null;
      return { type: 'visit', from: data.from, fromName, message };
    }
    case 'visit-sent': {
      const message = cleanText(data.message, MAX_MESSAGE_LENGTH);
      return message ? { type: 'visit-sent', message, queued: Boolean(data.queued) } : null;
    }
    case 'error':
      return { type: 'error', reason: String(data.reason || 'unknown') };
    case 'welcome':
      return { type: 'welcome' };
    default:
      return null;
  }
}

function createTransport({ getHello, onMessage, onStatus }) {
  let ws = null;
  let url = null;
  let retryMs = MIN_RETRY_MS;
  let retryTimer = null;
  let stopped = false;

  function scheduleRetry() {
    if (stopped) return;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(open, retryMs);
    retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
  }

  function open() {
    if (stopped || !url) return;
    const socket = new WebSocket(url);
    ws = socket;
    socket.on('open', () => {
      retryMs = MIN_RETRY_MS;
      socket.send(JSON.stringify({ type: 'hello', ...getHello() }));
    });
    socket.on('message', (raw) => {
      const msg = parseServerMessage(String(raw));
      if (!msg) return;
      if (msg.type === 'welcome') onStatus({ connected: true });
      else onMessage(msg);
    });
    socket.on('close', () => {
      if (ws !== socket) return;
      onStatus({ connected: false });
      scheduleRetry();
    });
    socket.on('error', (err) => onStatus({ connected: false, detail: err.message }));
  }

  function connect(nextUrl) {
    url = nextUrl;
    clearTimeout(retryTimer);
    retryMs = MIN_RETRY_MS;
    const old = ws;
    ws = null;
    if (old) old.terminate();
    open();
  }

  function send(payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(payload));
    return true;
  }

  function stop() {
    stopped = true;
    clearTimeout(retryTimer);
    if (ws) ws.terminate();
  }

  return { connect, send, stop };
}

module.exports = { createTransport, parseServerMessage };

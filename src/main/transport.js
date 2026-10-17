// Keeps one WebSocket open to the relay and reconnects with backoff.

const WebSocket = require('ws');
const { isAvatarVersion } = require('../../shared/avatar');
const {
  isCode, cleanText, MAX_NAME_LENGTH, MAX_MESSAGE_LENGTH, MAX_ROOM_MEMBERS, ROOM_HISTORY, GAMES, RPS_HANDS,
} = require('../../shared/protocol');

const MIN_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

function parseLine(data) {
  const fromName = cleanText(data && data.fromName, MAX_NAME_LENGTH);
  const message = cleanText(data && data.message, MAX_MESSAGE_LENGTH);
  if (!isCode(data && data.from) || !fromName || !message) return null;
  return { from: data.from, fromName, message, at: Number(data.at) || 0 };
}

function parseMember(data) {
  const name = cleanText(data && data.name, MAX_NAME_LENGTH);
  if (!isCode(data && data.code) || !name) return null;
  const color = Number.isInteger(data.color) && data.color >= 0 && data.color < MAX_ROOM_MEMBERS ? data.color : null;
  const avatar = isAvatarVersion(data.avatar) ? data.avatar : null;
  const avatarKind = avatar && ['single', 'sheet'].includes(data.avatarKind) ? data.avatarKind : null;
  return { code: data.code, name, color, online: data.online === true, avatar, avatarKind };
}

function parseRoom(data) {
  if (!isCode(data.room) || !Array.isArray(data.members)) return null;
  const members = data.members.slice(0, MAX_ROOM_MEMBERS).map(parseMember).filter(Boolean);
  const history = (Array.isArray(data.history) ? data.history : []).slice(-ROOM_HISTORY).map(parseLine).filter(Boolean);
  return { type: 'room', room: data.room, members, history };
}

const PHASES = ['pick', 'ready', 'go', 'result'];
const MAX_BOUNCE = 80;
const codeList = (value, max = MAX_ROOM_MEMBERS) => (Array.isArray(value) ? value.slice(0, max).filter(isCode) : []);

function parseGame(data) {
  if (!Number.isInteger(data.id) || !GAMES.includes(data.game) || !PHASES.includes(data.phase)) return null;
  if (!isCode(data.by)) return null;
  const base = { type: 'game', id: data.id, game: data.game, phase: data.phase, by: data.by, players: codeList(data.players) };
  const choices = Object.fromEntries(
    Object.entries(data.choices && typeof data.choices === 'object' ? data.choices : {})
      .filter(([code, hand]) => isCode(code) && RPS_HANDS.includes(hand)),
  );
  const ranking = (Array.isArray(data.ranking) ? data.ranking : [])
    .filter((r) => r && isCode(r.code) && Number.isFinite(r.ms) && r.ms >= 0)
    .map((r) => ({ code: r.code, ms: r.ms }));
  return {
    ...base,
    deadlineMs: Number.isFinite(data.deadlineMs) ? data.deadlineMs : 0,
    picked: isCode(data.picked) ? data.picked : null,
    bounce: codeList(data.bounce, MAX_BOUNCE),
    choices,
    winners: codeList(data.winners),
    ranking,
    faults: codeList(data.faults),
  };
}

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
    case 'room':
      return parseRoom(data);
    case 'said': {
      const line = parseLine(data);
      return line ? { type: 'said', ...line } : null;
    }
    case 'left-room':
      return { type: 'left-room' };
    case 'game':
      return parseGame(data);
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

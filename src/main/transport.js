// Keeps one WebSocket open to the relay and reconnects with backoff.

const WebSocket = require('ws');
const { isAvatarVersion } = require('../../shared/avatar');
const { isCharacter, DEFAULT_CHARACTER } = require('../../shared/characters');
const {
  isCode, cleanText, spotOrNull, MAX_NAME_LENGTH, MAX_MESSAGE_LENGTH, MAX_ROOM_MEMBERS, ROOM_HISTORY, GAMES, RPS_HANDS,
  STATUS_KINDS, MAX_NOTE_LENGTH, parseScheduleEntries,
} = require('../../shared/protocol');

const MIN_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;
const REPLACED_CODE = 4000; // the relay closes with this when a newer copy signs in as me

function parseLine(data) {
  const fromName = cleanText(data && data.fromName, MAX_NAME_LENGTH);
  const message = cleanText(data && data.message, MAX_MESSAGE_LENGTH);
  if (!isCode(data && data.from) || !fromName || !message) return null;
  return { from: data.from, fromName, message, at: Number(data.at) || 0 };
}

// 지금 상태: 아는 kind 와 깨끗한 label 일 때만, 아니면 null
function parseStatus(value) {
  if (!value || typeof value !== 'object' || !STATUS_KINDS.includes(value.kind)) return null;
  const label = cleanText(value.label, MAX_NOTE_LENGTH);
  return label ? { kind: value.kind, label } : null;
}

function parseMember(data) {
  const name = cleanText(data && data.name, MAX_NAME_LENGTH);
  if (!isCode(data && data.code) || !name) return null;
  const color = Number.isInteger(data.color) && data.color >= 0 && data.color < MAX_ROOM_MEMBERS ? data.color : null;
  const avatar = isAvatarVersion(data.avatar) ? data.avatar : null;
  const avatarKind = avatar && ['single', 'sheet'].includes(data.avatarKind) ? data.avatarKind : null;
  const character = isCharacter(data.character) ? data.character : DEFAULT_CHARACTER;
  const online = data.online === true;
  const schedule = parseScheduleEntries(data.schedule);
  return {
    code: data.code,
    name,
    character,
    color,
    x: spotOrNull(data.x),
    online,
    away: online && data.away === true,
    avatar,
    avatarKind,
    status: parseStatus(data.status),
    schedule: schedule.ok ? schedule.value : [],
  };
}

function parseRoom(data) {
  if (!isCode(data.room) || !Array.isArray(data.members)) return null;
  const members = data.members.slice(0, MAX_ROOM_MEMBERS).map(parseMember).filter(Boolean);
  const history = (Array.isArray(data.history) ? data.history : []).slice(-ROOM_HISTORY).map(parseLine).filter(Boolean);
  const today = typeof data.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.today) ? data.today : null;
  return { type: 'room', room: data.room, members, history, today };
}

const PHASES = ['pick', 'ready', 'go', 'result'];
const MAX_BOUNCE = 80;
const codeList = (value, max = MAX_ROOM_MEMBERS) => (Array.isArray(value) ? value.slice(0, max).filter(isCode) : []);
const RACE_LEGS = 4;
const MAX_RACE_MS = 20_000;

/** A runner's split times: four rising times (ms), the whole race well under MAX_RACE_MS. */
function parseRunner(r) {
  if (!r || !isCode(r.code) || !Array.isArray(r.legs) || r.legs.length !== RACE_LEGS) return null;
  const rising = r.legs.every((t, i) => Number.isFinite(t) && t > (i ? r.legs[i - 1] : 0) && t <= MAX_RACE_MS);
  return rising ? { code: r.code, legs: [...r.legs] } : null;
}

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
    race: (Array.isArray(data.race) ? data.race : []).slice(0, MAX_ROOM_MEMBERS).map(parseRunner).filter(Boolean),
    order: codeList(data.order),
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
    case 'moved':
      return isCode(data.code) ? { type: 'moved', code: data.code, x: spotOrNull(data.x) } : null;
    case 'game':
      return parseGame(data);
    case 'error':
      return { type: 'error', reason: String(data.reason || 'unknown') };
    case 'welcome':
      return { type: 'welcome' };
    case 'schedule-saved':
      return { type: 'schedule-saved' };
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
      socket.send(JSON.stringify({ type: 'hello', ...getHello() }));
    });
    socket.on('message', (raw) => {
      const msg = parseServerMessage(String(raw));
      if (!msg) return;
      if (msg.type === 'welcome') {
        retryMs = MIN_RETRY_MS; // only a real sign-in resets the wait, not a bare connect
        onStatus({ connected: true });
      } else onMessage(msg);
    });
    socket.on('close', (code) => {
      if (ws !== socket) return;
      if (code === REPLACED_CODE) {
        // Another copy of this app signed in with the same code: let it have the
        // connection instead of kicking each other off every second.
        onStatus({ connected: false, replaced: true });
        return;
      }
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

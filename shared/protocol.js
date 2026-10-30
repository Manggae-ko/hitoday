// Messages exchanged between apps and the relay server.
// Shared by both sides so validation rules never drift apart.
// KST = UTC+9 고정, DST 없음.
//
// A "room" works like a group chat: whoever has the invite code can join,
// and everyone in the room sees everyone's character along the bottom of their screen.

const { checkAvatar, decodeBase64 } = require('./avatar');
const { isCharacter, DEFAULT_CHARACTER } = require('./characters');

const CODE_PATTERN = /^[A-Z0-9]{6}$/;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_NAME_LENGTH = 12;
const MAX_MESSAGE_LENGTH = 80;
const MAX_ROOM_MEMBERS = 12;
const ROOM_HISTORY = 30;
const STATUS_KINDS = ['leave', 'half-am', 'half-pm', 'out', 'remote', 'trip', 'lunch', 'note'];
const STATUS_LABELS = {
  leave: '연차',
  'half-am': '오전반차',
  'half-pm': '오후반차',
  out: '외근',
  remote: '재택',
  trip: '출장',
  lunch: '따점',
  note: '메모',
};
const STATUS_PRIORITY = ['leave', 'trip', 'half-am', 'half-pm', 'out', 'remote', 'lunch', 'note'];
const MAX_SCHEDULE_ENTRIES = 30;
const MAX_NOTE_LENGTH = 12;
const SCHEDULE_WINDOW_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function isCode(value) {
  return typeof value === 'string' && CODE_PATTERN.test(value);
}

function makeCode(randomInt) {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return null;
  // Strip control characters so a message can't break the bubble layout.
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (text.length === 0) return null;
  return Array.from(text).slice(0, maxLength).join('');
}

/** Invite codes are typed by people: be forgiving about case and spaces. */
function normalizeCode(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : '';
}

/**
 * Where someone stands on the strip: the center of their character as a fraction
 * of screen width (0 = left edge, 1 = right edge), or null for an automatic spot.
 */
function spotOrNull(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return null;
  return Math.round(value * 1000) / 1000;
}

const fail = (error) => ({ ok: false, error });
const pass = (value) => ({ ok: true, value });

const kstDate = (ms) => new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
const kstMinutes = (ms) => Math.floor(((ms + KST_OFFSET_MS) % DAY_MS) / 60_000);

function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const ms = Date.UTC(year, month - 1, day);
  const date = new Date(ms);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? ms : null;
}

function parseScheduleEntries(value) {
  if (!Array.isArray(value) || value.length > MAX_SCHEDULE_ENTRIES) return fail('bad-schedule');
  const entries = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || !STATUS_KINDS.includes(item.kind)) return fail('bad-schedule');
    const from = dateValue(item.from);
    const to = dateValue(item.to);
    if (from === null || to === null || from > to || to - from >= SCHEDULE_WINDOW_DAYS * DAY_MS) {
      return fail('bad-schedule');
    }
    const note = cleanText(item.note, Number.POSITIVE_INFINITY);
    if (note && Array.from(note).length > MAX_NOTE_LENGTH) return fail('bad-schedule');
    if (item.kind === 'note' && !note) return fail('bad-schedule');
    entries.push({ from: item.from, to: item.to, kind: item.kind, ...(note ? { note } : {}) });
  }
  entries.sort((a, b) => a.from.localeCompare(b.from));
  return pass(entries);
}

function statusAt(entries, nowMs) {
  const today = kstDate(nowMs);
  const minutes = kstMinutes(nowMs);
  const active = (entries || []).filter((entry) => {
    if (entry.from > today || entry.to < today) return false;
    if (entry.kind === 'half-am') return minutes < 720;
    if (entry.kind === 'half-pm') return minutes >= 720;
    if (entry.kind === 'lunch') return minutes >= 690 && minutes < 810;
    return true;
  });
  active.sort((a, b) => STATUS_PRIORITY.indexOf(a.kind) - STATUS_PRIORITY.indexOf(b.kind));
  const entry = active[0];
  return entry ? { kind: entry.kind, label: entry.kind === 'note' ? entry.note : STATUS_LABELS[entry.kind] } : null;
}

// A device key: 32 random bytes, base64url (43 characters). Generated once per install.
const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const isDeviceKey = (value) => typeof value === 'string' && KEY_PATTERN.test(value);

function parseHello(data) {
  if (!isCode(data.code)) return fail('bad-code');
  if (!isDeviceKey(data.key)) return fail('need-key');
  const name = cleanText(data.name, MAX_NAME_LENGTH);
  if (!name) return fail('bad-name');
  // room: the room this app was in last time, so rooms survive a server restart.
  const room = isCode(data.room) ? data.room : null;
  const character = isCharacter(data.character) ? data.character : DEFAULT_CHARACTER;
  return pass({ type: 'hello', code: data.code, key: data.key, name, room, character, x: spotOrNull(data.x) });
}

function parseJoin(data) {
  const room = normalizeCode(data.room);
  return isCode(room) ? pass({ type: 'join-room', room }) : fail('bad-room');
}

function parseSay(data) {
  const message = cleanText(data.message, MAX_MESSAGE_LENGTH);
  return message ? pass({ type: 'say', message }) : fail('empty-message');
}

const GAMES = ['lottery', 'rps', 'reaction', 'race'];
const RPS_HANDS = ['rock', 'paper', 'scissors'];

function parseStartGame(data) {
  return GAMES.includes(data.game) ? pass({ type: 'start-game', game: data.game }) : fail('bad-game');
}

/** A move in the running game: a hand for rock-paper-scissors, or a tap for the reaction race. */
function parseGameMove(data) {
  if (data.move === 'tap' || RPS_HANDS.includes(data.move)) return pass({ type: 'game-move', move: data.move });
  return fail('bad-move');
}

/** png: base64 PNG to use as my character, or null to go back to the built-in one. */
function parseSetAvatar(data) {
  if (data.png === null) return pass({ type: 'set-avatar', bytes: null });
  const bytes = decodeBase64(data.png);
  if (!bytes) return fail('not-png');
  const checked = checkAvatar(bytes);
  if (!checked.ok) return fail(checked.error);
  return pass({ type: 'set-avatar', bytes, kind: checked.kind, version: checked.version });
}

function parseMove(data) {
  if (data.x === null) return pass({ type: 'move', x: null });
  const x = spotOrNull(data.x);
  return x === null ? fail('bad-spot') : pass({ type: 'move', x });
}

/** Stepped away (idle or screen locked) or back. */
function parsePresence(data) {
  return typeof data.away === 'boolean' ? pass({ type: 'presence', away: data.away }) : fail('bad-presence');
}

function parseSetSchedule(data) {
  const parsed = parseScheduleEntries(data.entries);
  return parsed.ok ? pass({ type: 'set-schedule', entries: parsed.value }) : parsed;
}

const PARSERS = {
  hello: parseHello,
  move: parseMove,
  presence: parsePresence,
  'set-schedule': parseSetSchedule,
  'set-avatar': parseSetAvatar,
  'create-room': () => pass({ type: 'create-room' }),
  'join-room': parseJoin,
  'leave-room': () => pass({ type: 'leave-room' }),
  say: parseSay,
  'start-game': parseStartGame,
  'game-move': parseGameMove,
};

function parseClientMessage(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return fail('bad-json');
  }
  if (!data || typeof data !== 'object') return fail('bad-json');
  const parser = PARSERS[data.type];
  return parser ? parser(data) : fail('unknown-type');
}

module.exports = {
  MAX_NAME_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_ROOM_MEMBERS,
  ROOM_HISTORY,
  STATUS_KINDS,
  STATUS_LABELS,
  STATUS_PRIORITY,
  MAX_SCHEDULE_ENTRIES,
  MAX_NOTE_LENGTH,
  SCHEDULE_WINDOW_DAYS,
  GAMES,
  RPS_HANDS,
  isCode,
  makeCode,
  cleanText,
  normalizeCode,
  spotOrNull,
  isDeviceKey,
  kstDate,
  kstMinutes,
  parseScheduleEntries,
  statusAt,
  parseClientMessage,
};

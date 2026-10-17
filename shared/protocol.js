// Messages exchanged between apps and the relay server.
// Shared by both sides so validation rules never drift apart.
//
// A "room" works like a group chat: whoever has the invite code can join,
// and everyone in the room sees everyone's character along the bottom of their screen.

const { checkAvatar, decodeBase64 } = require('./avatar');

const CODE_PATTERN = /^[A-Z0-9]{6}$/;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_NAME_LENGTH = 12;
const MAX_MESSAGE_LENGTH = 80;
const MAX_ROOM_MEMBERS = 12;
const ROOM_HISTORY = 30;

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

const fail = (error) => ({ ok: false, error });
const pass = (value) => ({ ok: true, value });

function parseHello(data) {
  if (!isCode(data.code)) return fail('bad-code');
  const name = cleanText(data.name, MAX_NAME_LENGTH);
  if (!name) return fail('bad-name');
  // room: the room this app was in last time, so rooms survive a server restart.
  const room = isCode(data.room) ? data.room : null;
  return pass({ type: 'hello', code: data.code, name, room });
}

function parseJoin(data) {
  const room = normalizeCode(data.room);
  return isCode(room) ? pass({ type: 'join-room', room }) : fail('bad-room');
}

function parseSay(data) {
  const message = cleanText(data.message, MAX_MESSAGE_LENGTH);
  return message ? pass({ type: 'say', message }) : fail('empty-message');
}

const GAMES = ['lottery', 'rps', 'reaction'];
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

const PARSERS = {
  hello: parseHello,
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
  GAMES,
  RPS_HANDS,
  isCode,
  makeCode,
  cleanText,
  normalizeCode,
  parseClientMessage,
};

// Messages exchanged between apps and the relay server.
// Shared by both sides so validation rules never drift apart.

const CODE_PATTERN = /^[A-Z0-9]{6}$/;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_NAME_LENGTH = 12;
const MAX_MESSAGE_LENGTH = 80;
const MAX_FRIENDS = 20;

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

const fail = (error) => ({ ok: false, error });
const pass = (value) => ({ ok: true, value });

function parseHello(data) {
  if (!isCode(data.code)) return fail('bad-code');
  const name = cleanText(data.name, MAX_NAME_LENGTH);
  if (!name) return fail('bad-name');
  const friends = Array.isArray(data.friends) ? data.friends.filter(isCode).slice(0, MAX_FRIENDS) : [];
  return pass({ type: 'hello', code: data.code, name, friends });
}

function parseVisit(data) {
  if (!isCode(data.to)) return fail('bad-code');
  const message = cleanText(data.message, MAX_MESSAGE_LENGTH);
  if (!message) return fail('empty-message');
  return pass({ type: 'visit', to: data.to, message });
}

function parseReturned(data) {
  if (!isCode(data.to)) return fail('bad-code');
  return pass({ type: 'returned', to: data.to });
}

const PARSERS = { hello: parseHello, visit: parseVisit, returned: parseReturned };

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
  isCode,
  makeCode,
  cleanText,
  parseClientMessage,
};

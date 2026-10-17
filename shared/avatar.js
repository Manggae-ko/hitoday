// Uploaded character images: checked on the app before sending and again on the server.
// Allowed: a PNG that is either one 32×32 frame or a 128×128 sheet (see docs/CHARACTER_GUIDE.md).

const crypto = require('node:crypto');

const MAX_AVATAR_BYTES = 32 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SIZES = { 32: 'single', 128: 'sheet' };

/**
 * @param {Buffer} bytes
 * @returns {{ ok: true, kind: 'single'|'sheet', version: string } | { ok: false, error: string }}
 */
function checkAvatar(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 33) return { ok: false, error: 'not-png' };
  if (bytes.length > MAX_AVATAR_BYTES) return { ok: false, error: 'too-big' };
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return { ok: false, error: 'not-png' };
  if (bytes.toString('ascii', 12, 16) !== 'IHDR') return { ok: false, error: 'not-png' };
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const kind = width === height ? SIZES[width] : undefined;
  if (!kind) return { ok: false, error: 'bad-size' };
  const version = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  return { ok: true, kind, version };
}

/** Decodes base64 strictly (no stray characters) so junk can't slip through. */
function decodeBase64(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) return null;
  if (text.length > Math.ceil((MAX_AVATAR_BYTES * 4) / 3) + 4) return null;
  return Buffer.from(text, 'base64');
}

const isAvatarVersion = (value) => typeof value === 'string' && /^[0-9a-f]{12}$/.test(value);

module.exports = { MAX_AVATAR_BYTES, checkAvatar, decodeBase64, isAvatarVersion };

// Local profile: my code, my name, the room I'm in, which server to use.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { makeCode, isCode, cleanText, spotOrNull, MAX_NAME_LENGTH } = require('../../shared/protocol');
const { isCharacter, DEFAULT_CHARACTER } = require('../../shared/characters');

const FILE_NAME = 'profile.json';
// Installers ship with the server from package.json ("jakdang.server"), so users never type it.
const PACKAGED_SERVER = (require('../../package.json').jakdang || {}).server;
const DEFAULT_SERVER = process.env.JAKDANG_SERVER || PACKAGED_SERVER || 'ws://localhost:8787';

// A distinct default name, so two new users never both show up as the same name.
const defaultName = (code) => `말랑${code.slice(0, 2)}`;
const OLD_DEFAULT_NAME = '나';

function isServerUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'ws:' || url.protocol === 'wss:';
  } catch {
    return false;
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') process.stderr.write(`profile unreadable, starting fresh: ${err.message}\n`);
    return null;
  }
}

function saveProfile(dir, profile) {
  // Only remember a custom server; the default can then change in a later release.
  const { serverUrl, ...rest } = profile;
  const stored = serverUrl === DEFAULT_SERVER ? rest : profile;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, FILE_NAME), JSON.stringify(stored, null, 2));
}

function loadProfile(dir) {
  const stored = readJson(path.join(dir, FILE_NAME)) || {};
  const code = isCode(stored.code) ? stored.code : makeCode((n) => crypto.randomInt(n));
  const storedName = cleanText(stored.name, MAX_NAME_LENGTH);
  const profile = {
    code,
    name: storedName && storedName !== OLD_DEFAULT_NAME ? storedName : defaultName(code),
    room: isCode(stored.room) ? stored.room : '',
    character: isCharacter(stored.character) ? stored.character : DEFAULT_CHARACTER,
    x: spotOrNull(stored.x), // where I parked my character (null = automatic)
    serverUrl: isServerUrl(stored.serverUrl) ? stored.serverUrl : DEFAULT_SERVER,
  };
  saveProfile(dir, profile);
  return profile;
}

/** Returns { profile } with changes applied, or { error } explaining what was wrong. */
function applyChanges(profile, changes) {
  const name = cleanText(changes.name, MAX_NAME_LENGTH);
  if (!name) return { error: '이름을 입력해 주세요.' };
  const serverUrl = String(changes.serverUrl || '').trim();
  if (!isServerUrl(serverUrl)) return { error: '서버 주소는 ws:// 또는 wss:// 로 시작해야 해요.' };
  return { profile: { ...profile, name, serverUrl } };
}

const withRoom = (profile, room) => ({ ...profile, room: isCode(room) ? room : '' });
const withCharacter = (profile, character) => (isCharacter(character) ? { ...profile, character } : profile);
const withSpot = (profile, x) => ({ ...profile, x: spotOrNull(x) });

module.exports = { loadProfile, saveProfile, applyChanges, withRoom, withCharacter, withSpot };

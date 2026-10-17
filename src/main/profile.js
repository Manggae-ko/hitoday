// Local profile: my code, my name, my one friend, which server to use.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { makeCode, isCode, cleanText, MAX_NAME_LENGTH } = require('../../shared/protocol');

const FILE_NAME = 'profile.json';
// Installers ship with the server from package.json ("nolleowa.server"), so users never type it.
const PACKAGED_SERVER = (require('../../package.json').nolleowa || {}).server;
const DEFAULT_SERVER = process.env.NOLLEOWA_SERVER || PACKAGED_SERVER || 'ws://localhost:8787';

function isServerUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'ws:' || url.protocol === 'wss:';
  } catch {
    return false;
  }
}

function freshProfile() {
  return {
    code: makeCode((n) => crypto.randomInt(n)),
    name: '나',
    friendCode: '',
    serverUrl: DEFAULT_SERVER,
  };
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
  const base = freshProfile();
  const stored = readJson(path.join(dir, FILE_NAME)) || {};
  const profile = {
    code: isCode(stored.code) ? stored.code : base.code,
    name: cleanText(stored.name, MAX_NAME_LENGTH) || base.name,
    friendCode: isCode(stored.friendCode) ? stored.friendCode : '',
    serverUrl: isServerUrl(stored.serverUrl) ? stored.serverUrl : base.serverUrl,
  };
  saveProfile(dir, profile);
  return profile;
}

/** Returns { profile } with changes applied, or { error } explaining what was wrong. */
function applyChanges(profile, changes) {
  const name = cleanText(changes.name, MAX_NAME_LENGTH);
  if (!name) return { error: '이름을 입력해 주세요.' };

  const friendCode = String(changes.friendCode || '').trim().toUpperCase();
  if (friendCode && !isCode(friendCode)) return { error: '친구 코드는 영문·숫자 6자리예요.' };
  if (friendCode === profile.code) return { error: '내 코드는 친구로 등록할 수 없어요.' };

  const serverUrl = String(changes.serverUrl || '').trim();
  if (!isServerUrl(serverUrl)) return { error: '서버 주소는 ws:// 또는 wss:// 로 시작해야 해요.' };

  return { profile: { ...profile, name, friendCode, serverUrl } };
}

module.exports = { loadProfile, saveProfile, applyChanges };

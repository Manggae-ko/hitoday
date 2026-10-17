// Character images: my own (kept on disk, re-sent on every connect) and
// friends' (downloaded from the server once per version, checked, cached in memory).

const fs = require('node:fs');
const path = require('node:path');
const { checkAvatar } = require('../../shared/avatar');

const FILE_NAME = 'avatar.png';

const toLook = (bytes, kind) => ({ url: `data:image/png;base64,${bytes.toString('base64')}`, single: kind === 'single' });

function loadOwnAvatar(dir) {
  try {
    const bytes = fs.readFileSync(path.join(dir, FILE_NAME));
    const checked = checkAvatar(bytes);
    return checked.ok ? { bytes, ...checked } : null;
  } catch (err) {
    if (err.code !== 'ENOENT') process.stderr.write(`avatar unreadable: ${err.message}\n`);
    return null;
  }
}

function saveOwnAvatar(dir, bytes) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, FILE_NAME), bytes);
}

function clearOwnAvatar(dir) {
  fs.rmSync(path.join(dir, FILE_NAME), { force: true });
}

/** ws://host:port → http://host:port (wss → https), where the server serves /avatars/. */
function httpBase(serverUrl) {
  const url = new URL(serverUrl);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  return url.origin;
}

/**
 * Remembers friends' images by code + version. lookFor() answers right away
 * (null until downloaded) and calls onLoaded once a new image is ready.
 */
function createAvatarCache({ getServerUrl, onLoaded, fetchImpl = fetch }) {
  const looks = new Map(); // "code:version" -> look
  const pending = new Set();

  async function download(code, version) {
    const key = `${code}:${version}`;
    pending.add(key);
    try {
      const res = await fetchImpl(`${httpBase(getServerUrl())}/avatars/${code}.png?v=${version}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      const checked = checkAvatar(bytes);
      if (!checked.ok || checked.version !== version) throw new Error('image failed the check');
      looks.set(key, toLook(bytes, checked.kind));
      onLoaded();
    } catch (err) {
      process.stderr.write(`could not load ${code}'s character: ${err.message}\n`);
    } finally {
      pending.delete(key);
    }
  }

  function lookFor(code, version) {
    if (!version) return null;
    const key = `${code}:${version}`;
    if (looks.has(key)) return looks.get(key);
    if (!pending.has(key)) download(code, version);
    return null;
  }

  return { lookFor };
}

module.exports = { loadOwnAvatar, saveOwnAvatar, clearOwnAvatar, createAvatarCache, httpBase, toLook };

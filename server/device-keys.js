// Device keys: the first app to use a code claims it with a secret key; after that,
// only that app may sign in as that code. Only a hash of each key is kept, on disk,
// so restarts don't let someone else grab a code.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SAVE_DELAY_MS = 1_000;
const MAX_KEYS = 200_000;

const hashKey = (key) => crypto.createHash('sha256').update(key).digest('hex');

function safeEqual(a, b) {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * @param {{ file?: string, log?: (line: string) => void }} options
 *   file: where to keep the hashes (no file = memory only, e.g. in tests)
 */
function createDeviceKeys({ file, log = () => {} } = {}) {
  const hashes = new Map(); // code -> sha256(key)
  let saveTimer = null;

  if (file) {
    try {
      const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
      Object.entries(stored).forEach(([code, hash]) => hashes.set(code, hash));
      log(`device keys loaded: ${hashes.size}`);
    } catch (err) {
      if (err.code !== 'ENOENT') log(`device keys unreadable, starting empty: ${err.message}`);
    }
  }

  function saveSoon() {
    if (!file || saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const tmp = `${file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(hashes)));
        fs.renameSync(tmp, file); // never leave a half-written file behind
      } catch (err) {
        log(`device keys not saved: ${err.message}`);
      }
    }, SAVE_DELAY_MS);
  }

  /** Returns 'ok', 'claimed' (first use), 'bad-key' or 'server-full'. */
  function check(code, key) {
    const hash = hashKey(key);
    const known = hashes.get(code);
    if (known) return safeEqual(known, hash) ? 'ok' : 'bad-key';
    if (hashes.size >= MAX_KEYS) return 'server-full';
    hashes.set(code, hash);
    saveSoon();
    return 'claimed';
  }

  function flush() {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(Object.fromEntries(hashes)));
  }

  return { check, flush, size: () => hashes.size };
}

module.exports = { createDeviceKeys };

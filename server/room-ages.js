// When each room was last used, so rooms nobody has been in for 5 days can be removed.
// Apps remember their room and ask for it back when they sign in (that's how rooms come
// back after a server restart), so removed rooms are remembered as expired for a while,
// and kept on disk, or the first returning app would simply rebuild them.

const fs = require('node:fs');
const path = require('node:path');

const DAY_MS = 24 * 60 * 60 * 1000;
const ROOM_IDLE_MS = 5 * DAY_MS;
const FORGET_EXPIRED_MS = 90 * DAY_MS;
const SAVE_DELAY_MS = 5_000;
const MAX_ROOMS_TRACKED = 100_000;

/**
 * @param {{ file?: string, now?: () => number, log?: (line: string) => void }} options
 *   file: where to keep the ages (no file = memory only, e.g. in tests)
 */
function createRoomAges({ file, now = Date.now, log = () => {} } = {}) {
  let active = new Map(); // room code -> last time someone was in it (ms)
  let expired = new Map(); // room code -> when it was removed (ms)
  let saveTimer = null;

  if (file) {
    try {
      const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
      const valid = (entries) => Object.entries(entries || {}).filter(([, at]) => Number.isFinite(at));
      active = new Map(valid(stored.active));
      expired = new Map(valid(stored.expired));
    } catch (err) {
      if (err.code !== 'ENOENT') log(`room ages unreadable, starting empty: ${err.message}`);
    }
  }

  function write() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ active: Object.fromEntries(active), expired: Object.fromEntries(expired) }));
    fs.renameSync(tmp, file); // never leave a half-written file behind
  }

  function saveSoon() {
    if (!file || saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try {
        write();
      } catch (err) {
        log(`room ages not saved: ${err.message}`);
      }
    }, SAVE_DELAY_MS);
    if (saveTimer.unref) saveTimer.unref();
  }

  /** Someone is in the room right now. */
  function touch(code) {
    if (!active.has(code) && active.size >= MAX_ROOMS_TRACKED) return;
    active.set(code, now());
    expired.delete(code);
    saveSoon();
  }

  /**
   * Returns the codes of rooms to remove: unused for ROOM_IDLE_MS and nobody online.
   * Rooms with someone online count as used right now.
   */
  function sweep(isOccupied) {
    const t = now();
    const gone = [];
    active.forEach((at, code) => {
      if (isOccupied(code)) active.set(code, t);
      else if (t - at > ROOM_IDLE_MS) gone.push(code);
    });
    gone.forEach((code) => {
      active.delete(code);
      expired.set(code, t);
    });
    expired.forEach((at, code) => {
      if (t - at > FORGET_EXPIRED_MS) expired.delete(code);
    });
    saveSoon();
    return gone;
  }

  function flush() {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    if (file) write();
  }

  /** Starts counting a room that has no record yet (leaves known rooms alone). */
  function track(code) {
    if (!active.has(code) && !expired.has(code)) touch(code);
  }

  return { touch, track, sweep, isExpired: (code) => expired.has(code), flush };
}

module.exports = { createRoomAges, ROOM_IDLE_MS, FORGET_EXPIRED_MS };

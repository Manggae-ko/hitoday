// Usage counters for the operator's stats page: daily totals (Korea time) kept on disk,
// plus live numbers (online now, open rooms) asked from the relay when the page loads.
// Only counts — no names, codes, messages or IPs are recorded.

const fs = require('node:fs');
const path = require('node:path');

const EVENTS = [
  'page_view', // download page opened
  'download_mac',
  'download_win',
  'new_device', // first time an install connected
  'connect', // an app signed in
  'room_created',
  'message',
  'game_lottery',
  'game_rps',
  'game_reaction',
];
const KEEP_DAYS = 90;
const SAVE_EVERY_MS = 60_000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const dayOf = (ms) => new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
const emptyDay = () => Object.fromEntries([...EVENTS, 'peak_online'].map((e) => [e, 0]));

function createStats({ file, now = Date.now, log = () => {}, live = () => ({ online: 0, rooms: 0 }) } = {}) {
  let days = {}; // "YYYY-MM-DD" -> counts
  let dirty = false;

  if (file) {
    try {
      const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (stored && typeof stored.days === 'object') days = stored.days;
    } catch (err) {
      if (err.code !== 'ENOENT') log(`stats unreadable, starting empty: ${err.message}`);
    }
  }

  const today = () => {
    const key = dayOf(now());
    if (!days[key]) days = { ...days, [key]: emptyDay() };
    return days[key];
  };

  function record(event, amount = 1) {
    if (!EVENTS.includes(event)) return;
    const counts = today();
    counts[event] += amount;
    dirty = true;
  }

  function notePeak(online) {
    const counts = today();
    if (online > counts.peak_online) {
      counts.peak_online = online;
      dirty = true;
    }
  }

  function prune() {
    const cutoff = dayOf(now() - KEEP_DAYS * 24 * 60 * 60 * 1000);
    days = Object.fromEntries(Object.entries(days).filter(([key]) => key >= cutoff));
  }

  function flush() {
    if (!file || !dirty) return;
    prune();
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ days }));
      fs.renameSync(tmp, file);
      dirty = false;
    } catch (err) {
      log(`stats not saved: ${err.message}`);
    }
  }

  const timer = file ? setInterval(flush, SAVE_EVERY_MS) : null;
  if (timer) timer.unref();

  /** Everything the stats page shows: live numbers, today, the last `count` days, and totals. */
  function report(count = 14) {
    today();
    const recent = Array.from({ length: count }, (_, i) => dayOf(now() - i * 24 * 60 * 60 * 1000))
      .map((date) => ({ date, ...(days[date] || emptyDay()) }));
    const totals = emptyDay();
    Object.values(days).forEach((counts) => {
      EVENTS.forEach((e) => { totals[e] += counts[e] || 0; });
      totals.peak_online = Math.max(totals.peak_online, counts.peak_online || 0);
    });
    return { live: live(), today: recent[0], days: recent, totals, keptDays: KEEP_DAYS };
  }

  function stop() {
    if (timer) clearInterval(timer);
    flush();
  }

  return { record, notePeak, report, flush, stop };
}

module.exports = { createStats, EVENTS, dayOf };

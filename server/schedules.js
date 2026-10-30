const fs = require('node:fs');
const path = require('node:path');
const { parseScheduleEntries, kstDate } = require('../shared/protocol');

const SAVE_DELAY_MS = 5_000;

function createSchedules({ file, now = Date.now, log = () => {} } = {}) {
  let schedules = new Map();
  let saveTimer = null;

  if (file) {
    try {
      const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const [code, value] of Object.entries(stored || {})) {
        const parsed = parseScheduleEntries(value);
        if (parsed.ok) schedules.set(code, parsed.value);
        else log(`schedule for ${code} invalid, ignoring`);
      }
    } catch (err) {
      if (err.code !== 'ENOENT') log(`schedules unreadable, starting empty: ${err.message}`);
    }
  }

  function write() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(schedules)));
    fs.renameSync(tmp, file);
  }

  function saveSoon() {
    if (!file || saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try {
        write();
      } catch (err) {
        log(`schedules not saved: ${err.message}`);
      }
    }, SAVE_DELAY_MS);
    if (saveTimer.unref) saveTimer.unref();
  }

  function prune() {
    const currentTime = now();
    const today = kstDate(currentTime);
    let changed = false;
    schedules.forEach((entries, code) => {
      const kept = entries.filter((entry) => entry.to >= today);
      if (kept.length === entries.length) return;
      changed = true;
      if (kept.length) schedules.set(code, kept);
      else schedules.delete(code);
    });
    if (changed) saveSoon();
    return changed;
  }

  function set(code, entries) {
    if (entries.length) schedules.set(code, entries);
    else schedules.delete(code);
    prune();
    saveSoon();
  }

  function flush() {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    if (file) write();
  }

  return {
    get: (code) => schedules.get(code) || [],
    set,
    visible: (code) => {
      const currentTime = now();
      return (schedules.get(code) || []).filter((entry) => entry.to >= kstDate(currentTime));
    },
    prune,
    flush,
  };
}

module.exports = { createSchedules };

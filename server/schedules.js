const fs = require('node:fs');
const path = require('node:path');
const { parseScheduleEntries, kstDate } = require('../shared/protocol');

const SAVE_DELAY_MS = 5_000;
const CODE_PATTERN = /^[A-Z0-9]{6}$/;

const copyEntries = (entries) => entries.map((entry) => ({ ...entry }));

function createSchedules({ file, now = Date.now, log = () => {} } = {}) {
  let schedules = new Map();
  let saveTimer = null;
  let dirty = false;

  if (file) {
    try {
      const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
        log('schedules invalid top-level value, starting empty');
        schedules = new Map();
      } else for (const [code, value] of Object.entries(stored)) {
        if (!CODE_PATTERN.test(code)) {
          log(`schedule code ${code} invalid, ignoring`);
          continue;
        }
        const parsed = parseScheduleEntries(value);
        if (parsed.ok) schedules.set(code, copyEntries(parsed.value));
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
    dirty = false;
  }

  function saveSoon() {
    if (!file || saveTimer || !dirty) return;
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
    if (changed) {
      dirty = true;
      saveSoon();
    }
    return changed;
  }

  function set(code, entries) {
    if (!CODE_PATTERN.test(code)) {
      log(`schedule code ${code} invalid, ignoring`);
      return false;
    }
    const parsed = parseScheduleEntries(entries);
    if (!parsed.ok) {
      log(`schedule for ${code} invalid, ignoring`);
      return false;
    }
    const today = kstDate(now());
    const kept = parsed.value.filter((entry) => entry.to >= today);
    if (kept.length) schedules.set(code, copyEntries(kept));
    else schedules.delete(code);
    dirty = true;
    saveSoon();
    return true;
  }

  function flush() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (file && dirty) write();
  }

  return {
    get: (code) => copyEntries(schedules.get(code) || []),
    set,
    visible: (code) => {
      const currentTime = now();
      return copyEntries((schedules.get(code) || [])
        .filter((entry) => entry.to >= kstDate(currentTime))
        .slice(0, 30));
    },
    prune,
    flush,
  };
}

module.exports = { createSchedules };

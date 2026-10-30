const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSchedules } = require('../server/schedules');

const DAY = 24 * 60 * 60 * 1000;
const clock = () => Date.UTC(2026, 9, 30, 3);
const leave = (from, to = from) => ({ from, to, kind: 'leave' });

test('schedules: restart restores from file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hitoday-schedules-'));
  const file = path.join(dir, 'schedules.json');
  const first = createSchedules({ file, now: clock });
  first.set('ABC234', [leave('2026-10-30')]);
  first.flush();
  const restarted = createSchedules({ file, now: clock });
  assert.deepEqual(restarted.get('ABC234'), [leave('2026-10-30')]);
});

test('schedules: corrupt file starts empty', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hitoday-schedules-'));
  const file = path.join(dir, 'schedules.json');
  fs.writeFileSync(file, '{broken');
  const lines = [];
  const schedules = createSchedules({ file, now: clock, log: (line) => lines.push(line) });
  assert.deepEqual(schedules.get('ABC234'), []);
  assert.match(lines[0], /unreadable/);
});

test('schedules: prune drops past entries', () => {
  let at = clock() - DAY;
  const schedules = createSchedules({ now: () => at });
  schedules.set('ABC234', [leave('2026-10-29'), leave('2026-10-30')]);
  at = clock();
  assert.equal(schedules.prune(), true);
  assert.deepEqual(schedules.get('ABC234'), [leave('2026-10-30')]);
  assert.equal(schedules.prune(), false);
});

test('schedules: visible keeps far future', () => {
  const schedules = createSchedules({ now: clock });
  schedules.set('ABC234', [leave('2026-10-29'), leave('2026-10-30'), leave('2026-12-28')]);
  assert.deepEqual(schedules.visible('ABC234'), [leave('2026-10-30'), leave('2026-12-28')]);
});

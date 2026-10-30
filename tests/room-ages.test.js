const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRoomAges, ROOM_IDLE_MS, FORGET_EXPIRED_MS } = require('../server/room-ages');

const DAY = 24 * 60 * 60 * 1000;

test('rooms nobody has been in for 5 days expire; rooms in use do not', () => {
  let clock = Date.UTC(2026, 9, 1);
  const ages = createRoomAges({ now: () => clock });
  assert.equal(ROOM_IDLE_MS, 5 * DAY);
  ages.touch('QUIET1');
  ages.touch('BUSY01');
  clock += 4 * DAY;
  ages.touch('BUSY01');
  assert.deepEqual(ages.sweep(() => false), [], 'four days is not long enough');
  clock += 1 * DAY + 1;
  assert.deepEqual(ages.sweep((code) => code === 'BUSY01'), ['QUIET1']);
  assert.equal(ages.isExpired('QUIET1'), true);
  assert.equal(ages.isExpired('BUSY01'), false);
  assert.equal(ages.isExpired('NEVER1'), false, 'unknown rooms are not expired');
});

test('someone online counts as activity, so an occupied room never expires', () => {
  let clock = 0;
  const ages = createRoomAges({ now: () => clock });
  ages.touch('ROOM01');
  clock += 30 * DAY;
  assert.deepEqual(ages.sweep(() => true), []);
  clock += 4 * DAY;
  assert.deepEqual(ages.sweep(() => false), [], 'counted from the last time someone was online');
  clock += 2 * DAY;
  assert.deepEqual(ages.sweep(() => false), ['ROOM01']);
});

test('a room code can be used again once it has been forgotten', () => {
  let clock = 0;
  const ages = createRoomAges({ now: () => clock });
  ages.touch('OLDRM1');
  clock += ROOM_IDLE_MS + 1;
  ages.sweep(() => false);
  assert.equal(ages.isExpired('OLDRM1'), true);
  clock += FORGET_EXPIRED_MS + 1;
  ages.sweep(() => false);
  assert.equal(ages.isExpired('OLDRM1'), false);
});

test('ages survive a restart', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hitoday-rooms-'));
  const file = path.join(dir, 'rooms.json');
  let clock = 0;
  const first = createRoomAges({ file, now: () => clock });
  first.touch('KEEP01');
  clock += ROOM_IDLE_MS + 1;
  first.sweep(() => false);
  first.flush();
  const second = createRoomAges({ file, now: () => clock });
  assert.equal(second.isExpired('KEEP01'), true);
});

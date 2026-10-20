const test = require('node:test');
const assert = require('node:assert/strict');
const { createPresence, AWAY_AFTER_S, CHECK_EVERY_MS } = require('../src/main/presence');

/** A presence watcher with a fake clock: set `idle` and call tick(). */
function setup() {
  let idle = 0;
  const changes = [];
  let tick = null;
  const presence = createPresence({
    getIdleSeconds: () => idle,
    onChange: (away) => changes.push(away),
    setInterval: (fn, ms) => {
      tick = fn;
      return { ms, unref() {} };
    },
  });
  return { presence, changes, setIdle: (s) => { idle = s; }, tick: () => tick() };
}

test('goes away after the idle limit and comes back on the next input, telling only on changes', () => {
  const { presence, changes, setIdle, tick } = setup();
  assert.ok(AWAY_AFTER_S >= 5 * 60 && AWAY_AFTER_S <= 15 * 60);
  assert.ok(CHECK_EVERY_MS <= 60_000);
  setIdle(AWAY_AFTER_S - 1);
  tick();
  assert.deepEqual(changes, []);
  setIdle(AWAY_AFTER_S);
  tick();
  tick();
  assert.deepEqual(changes, [true]);
  assert.equal(presence.isAway(), true);
  setIdle(2);
  tick();
  assert.deepEqual(changes, [true, false]);
  presence.stop();
});

test('locking the screen is away right away; unlocking is back', () => {
  const { presence, changes } = setup();
  presence.locked(true);
  assert.deepEqual(changes, [true]);
  presence.locked(false);
  assert.deepEqual(changes, [true, false]);
  presence.stop();
});

test('stays away while locked even if the idle counter resets', () => {
  const { presence, changes, setIdle, tick } = setup();
  presence.locked(true);
  setIdle(0);
  tick();
  assert.deepEqual(changes, [true]);
  presence.stop();
});

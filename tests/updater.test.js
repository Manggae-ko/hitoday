const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { startUpdater, CHECK_EVERY_MS } = require('../src/main/updater');

/** A stand-in for electron-updater's autoUpdater. */
function fakeUpdater({ failCheck = false } = {}) {
  const updater = new EventEmitter();
  updater.checks = 0;
  updater.checkForUpdates = async () => {
    updater.checks += 1;
    if (failCheck) throw new Error('offline');
    return null;
  };
  return updater;
}

/** Records the repeating timer instead of waiting hours. */
function fakeTimers() {
  const timers = [];
  return {
    timers,
    setInterval: (fn, ms) => {
      const timer = { fn, ms, unref() { this.unrefed = true; } };
      timers.push(timer);
      return timer;
    },
  };
}

test('checks once at start, then on a long repeating timer that does not keep the app alive', async () => {
  const updater = fakeUpdater();
  const { timers, setInterval } = fakeTimers();
  const settle = () => new Promise((r) => setImmediate(r));
  startUpdater({ autoUpdater: updater, onReady: () => {}, setInterval });
  await settle();
  assert.equal(updater.checks, 1);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, CHECK_EVERY_MS);
  assert.ok(CHECK_EVERY_MS >= 60 * 60 * 1000, 'no more than once an hour');
  assert.ok(timers[0].unrefed);
  timers[0].fn();
  await settle();
  assert.equal(updater.checks, 2);
});

test('tells me once when a new version is downloaded and ready', () => {
  const updater = fakeUpdater();
  const ready = [];
  startUpdater({ autoUpdater: updater, onReady: (version) => ready.push(version), setInterval: fakeTimers().setInterval });
  updater.emit('update-downloaded', { version: '0.1.4' });
  updater.emit('update-downloaded', { version: '0.1.4' });
  assert.deepEqual(ready, ['0.1.4']);
});

test('a failed check is logged, never thrown, and the app keeps going', async () => {
  const updater = fakeUpdater({ failCheck: true });
  const logged = [];
  startUpdater({
    autoUpdater: updater,
    onReady: () => {},
    log: (line) => logged.push(line),
    setInterval: fakeTimers().setInterval,
  });
  updater.emit('error', new Error('bad signature'));
  await new Promise((r) => setImmediate(r));
  assert.ok(logged.some((l) => /offline/.test(l)));
  assert.ok(logged.some((l) => /bad signature/.test(l)));
});

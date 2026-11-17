const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { keepOnTop, REASSERT_EVERY_MS } = require('../src/main/keep-on-top');

/** BrowserWindow 대역: 최상단 재지정 호출만 기록 */
function fakeWindow({ visible = true } = {}) {
  const win = new EventEmitter();
  win.calls = [];
  win.visible = visible;
  win.destroyed = false;
  win.isVisible = () => win.visible;
  win.isDestroyed = () => win.destroyed;
  win.setAlwaysOnTop = (flag, level) => win.calls.push(['setAlwaysOnTop', flag, level]);
  win.moveTop = () => win.calls.push(['moveTop']);
  return win;
}

/** 실제로 기다리지 않고 반복 타이머를 기록 */
function fakeTimers() {
  const timers = [];
  return {
    timers,
    setInterval: (fn, ms) => {
      const timer = { fn, ms, cleared: false, unref() { this.unrefed = true; } };
      timers.push(timer);
      return timer;
    },
    clearInterval: (timer) => { timer.cleared = true; },
  };
}

test('반복 타이머마다 항상 위를 다시 걸고 맨 위로 올리며, 앱 종료를 막지 않는다', () => {
  const win = fakeWindow();
  const clock = fakeTimers();
  keepOnTop(win, { level: 'floating', ...clock });
  assert.equal(clock.timers.length, 1);
  assert.equal(clock.timers[0].ms, REASSERT_EVERY_MS);
  assert.ok(clock.timers[0].unrefed);
  clock.timers[0].fn();
  assert.deepEqual(win.calls, [['setAlwaysOnTop', true, 'floating'], ['moveTop']]);
});

test('숨김 중이거나 파괴된 창은 건드리지 않는다', () => {
  const win = fakeWindow({ visible: false });
  const clock = fakeTimers();
  keepOnTop(win, clock);
  clock.timers[0].fn();
  win.visible = true;
  win.destroyed = true;
  clock.timers[0].fn();
  assert.deepEqual(win.calls, []);
});

test('창이 닫히면 타이머를 정리한다', () => {
  const win = fakeWindow();
  const clock = fakeTimers();
  keepOnTop(win, clock);
  win.emit('closed');
  assert.ok(clock.timers[0].cleared);
});

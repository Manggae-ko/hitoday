// 캐릭터 창 최상단 유지: Windows에서 상주 프로그램(보안·오버레이 등)이 "항상 위"를 풀면
// 클릭으로 활성화되지 않는 창이라 스스로 다시 올라오지 못하므로, 주기적으로 다시 건다.

const REASSERT_EVERY_MS = 15 * 1000;

/**
 * @param {import('electron').BrowserWindow} win
 * @param {{
 *   level?: string,
 *   intervalMs?: number,
 *   setInterval?: typeof setInterval,
 *   clearInterval?: typeof clearInterval,
 * }} [options]
 */
function keepOnTop(win, {
  level = 'floating',
  intervalMs = REASSERT_EVERY_MS,
  setInterval = global.setInterval,
  clearInterval = global.clearInterval,
} = {}) {
  const reassert = () => {
    // 숨김(단축키·트레이) 중이거나 닫힌 창은 건드리지 않음
    if (win.isDestroyed() || !win.isVisible()) return;
    win.setAlwaysOnTop(true, level);
    win.moveTop(); // 포커스를 뺏지 않고 z-order만 올림
  };
  const timer = setInterval(reassert, intervalMs);
  if (timer && timer.unref) timer.unref();
  win.on('closed', () => clearInterval(timer));
  return { reassert };
}

module.exports = { keepOnTop, REASSERT_EVERY_MS };

// "Away" detection: the computer has had no mouse or keyboard input for a while, or the
// screen is locked. Only how long the computer has been idle is read, never what was typed.

const AWAY_AFTER_S = 10 * 60;
const CHECK_EVERY_MS = 30_000;

/**
 * @param {{
 *   getIdleSeconds: () => number,
 *   onChange: (away: boolean) => void,
 *   setInterval?: typeof setInterval,
 * }} options
 */
function createPresence({ getIdleSeconds, onChange, setInterval = global.setInterval }) {
  let away = false;
  let isLocked = false;

  function update() {
    const next = isLocked || getIdleSeconds() >= AWAY_AFTER_S;
    if (next === away) return;
    away = next;
    onChange(away);
  }

  const timer = setInterval(update, CHECK_EVERY_MS);
  if (timer && timer.unref) timer.unref();

  return {
    isAway: () => away,
    /** The screen was locked (true) or unlocked (false). */
    locked: (value) => {
      isLocked = value;
      update();
    },
    check: update,
    stop: () => clearInterval(timer),
  };
}

module.exports = { createPresence, AWAY_AFTER_S, CHECK_EVERY_MS };

// Runs one mini-game at a time per room: timers, collecting moves, announcing results.
// Outcomes come from ./games.js so they're identical on every screen.

const { drawLottery, judgeRps, rankReaction, RPS_HANDS } = require('./games');

const DEFAULT_TIMINGS = {
  rpsMs: 10_000, // time to pick a hand
  reactionMinDelayMs: 2_000, // "ready…" lasts between min and max
  reactionMaxDelayMs: 5_000,
  reactionWindowMs: 3_000, // time to tap after "now!"
};

function createGameHost({ broadcast, now, randomInt, timings = {} }) {
  const t = { ...DEFAULT_TIMINGS, ...timings };
  const running = new Map(); // room code -> game
  let nextId = 1;

  function announce(roomCode, game, phase, extra = {}) {
    broadcast(roomCode, { type: 'game', id: game.id, game: game.kind, phase, players: game.players, by: game.by, ...extra });
  }

  function finish(roomCode, game, extra) {
    clearTimeout(game.timer);
    running.delete(roomCode);
    announce(roomCode, game, 'result', extra);
  }

  function finishRps(roomCode, game) {
    finish(roomCode, game, { choices: game.choices, winners: judgeRps(game.choices) });
  }

  function finishReaction(roomCode, game) {
    finish(roomCode, game, rankReaction(game.goAt ?? Infinity, game.taps));
  }

  const STARTERS = {
    lottery(roomCode, game) {
      // Instant: the spotlight animation on each screen is the suspense.
      const { picked, bounce } = drawLottery(game.players, randomInt);
      announce(roomCode, game, 'result', { picked, bounce });
    },
    rps(roomCode, game) {
      Object.assign(game, { choices: {} });
      game.timer = setTimeout(() => finishRps(roomCode, game), t.rpsMs);
      running.set(roomCode, game);
      announce(roomCode, game, 'pick', { deadlineMs: t.rpsMs });
    },
    reaction(roomCode, game) {
      Object.assign(game, { taps: [], goAt: null });
      running.set(roomCode, game);
      announce(roomCode, game, 'ready');
      const delay = t.reactionMinDelayMs + randomInt(t.reactionMaxDelayMs - t.reactionMinDelayMs + 1);
      game.timer = setTimeout(() => {
        game.goAt = now();
        announce(roomCode, game, 'go');
        game.timer = setTimeout(() => finishReaction(roomCode, game), t.reactionWindowMs);
      }, delay);
    },
  };

  /** Returns an error reason, or null when the game started. */
  function start(roomCode, kind, by, onlinePlayers) {
    if (running.has(roomCode)) return 'game-running';
    if (onlinePlayers.length < 2) return 'need-two';
    const game = { id: nextId++, kind, by, players: onlinePlayers, timer: null };
    STARTERS[kind](roomCode, game);
    return null;
  }

  /** Returns an error reason, or null when the move counted. */
  function move(roomCode, code, value) {
    const game = running.get(roomCode);
    if (!game) return 'no-game';
    if (!game.players.includes(code)) return 'not-player';
    if (game.kind === 'rps') {
      if (!RPS_HANDS.includes(value) || game.choices[code]) return 'bad-move';
      game.choices = { ...game.choices, [code]: value };
      if (Object.keys(game.choices).length === game.players.length) finishRps(roomCode, game);
      return null;
    }
    if (game.kind === 'reaction') {
      if (value !== 'tap' || game.taps.some((tap) => tap.code === code)) return 'bad-move';
      game.taps = [...game.taps, { code, at: now() }];
      if (game.taps.length === game.players.length && game.goAt !== null) finishReaction(roomCode, game);
      return null;
    }
    return 'bad-move';
  }

  function stop(roomCode) {
    const game = running.get(roomCode);
    if (game) clearTimeout(game.timer);
    running.delete(roomCode);
  }

  const stopAll = () => [...running.keys()].forEach(stop);

  return { start, move, stop, stopAll };
}

module.exports = { createGameHost, DEFAULT_TIMINGS };

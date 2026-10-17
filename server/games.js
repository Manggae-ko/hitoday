// Mini-game rules. Pure functions: the relay owns timers and sockets,
// these only decide outcomes, so every screen shows the same result.

const RPS_BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };

/**
 * Coffee lottery: picks one player at random, plus the path the spotlight
 * hops along before landing (same path on every screen).
 */
function drawLottery(players, randomInt) {
  const picked = players[randomInt(players.length)];
  const laps = 2 * players.length + randomInt(players.length);
  const start = randomInt(players.length);
  const bounce = Array.from({ length: laps }, (_, i) => players[(start + i) % players.length]);
  return { picked, bounce: [...bounce, picked] };
}

/**
 * Rock-paper-scissors among everyone who chose. Winners win only when exactly
 * two different hands were thrown; everything else is a draw (no winners).
 */
function judgeRps(choices) {
  const kinds = [...new Set(Object.values(choices))];
  if (kinds.length !== 2) return [];
  const [a, b] = kinds;
  const winning = RPS_BEATS[a] === b ? a : b;
  return Object.keys(choices).filter((code) => choices[code] === winning);
}

/** Reaction race: fastest first; anyone who clicked before the signal is listed separately. */
function rankReaction(goAt, taps) {
  const faults = taps.filter((t) => t.at < goAt).map((t) => t.code);
  const ranking = taps
    .filter((t) => t.at >= goAt)
    .map((t) => ({ code: t.code, ms: t.at - goAt }))
    .sort((x, y) => x.ms - y.ms);
  return { ranking, faults };
}

module.exports = { drawLottery, judgeRps, rankReaction, RPS_HANDS: Object.keys(RPS_BEATS) };

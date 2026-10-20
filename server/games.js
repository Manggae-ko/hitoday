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

/**
 * Race along the bottom of the screen: each runner's time at every quarter of the track
 * (cumulative ms), so speeds change mid-race and overtakes happen. Same plan on every screen.
 * Finishing order is by total time; ties keep the order players were listed in.
 */
const RACE_LEGS = 4;
const RACE_LEG_MIN_MS = 1_000;
const RACE_LEG_SPREAD_MS = 1_000; // each quarter takes 1.0–2.0 s, so a race is 4–8 s

function planRace(players, randomInt) {
  const race = players.map((code) => {
    let t = 0;
    const legs = Array.from({ length: RACE_LEGS }, () => {
      t += RACE_LEG_MIN_MS + randomInt(RACE_LEG_SPREAD_MS + 1);
      return t;
    });
    return { code, legs };
  });
  const finish = (code) => race.find((r) => r.code === code).legs[RACE_LEGS - 1];
  const order = [...players].sort((a, b) => finish(a) - finish(b) || players.indexOf(a) - players.indexOf(b));
  return { race, order };
}

module.exports = { drawLottery, judgeRps, rankReaction, planRace, RACE_LEGS, RPS_HANDS: Object.keys(RPS_BEATS) };

// Turns a game event from the server into the words shown on screen and in the chat.

const HAND_EMOJI = { rock: '✊', paper: '✋', scissors: '✌️' };
const GAME_TITLE = { lottery: '☕ 커피 뽑기', rps: '✊ 가위바위보', reaction: '⚡ 반응속도', race: '🏁 달리기 경주' };
const MEDALS = ['🥇', '🥈', '🥉'];

const seconds = (ms) => `${(ms / 1000).toFixed(2)}초`;

function rpsOutcome(msg, nameOf) {
  if (Object.keys(msg.choices).length === 0) return '아무도 안 골랐어요';
  if (msg.winners.length === 0) return '비겼어요! 한 판 더?';
  return `${msg.winners.map(nameOf).join('·')} 승!`;
}

function reactionOutcome(msg, nameOf) {
  const ranks = msg.ranking.map((r, i) => `${MEDALS[i] || `${i + 1}.`} ${nameOf(r.code)} ${seconds(r.ms)}`);
  const faults = msg.faults.length ? [`부정출발 ${msg.faults.map(nameOf).join('·')}`] : [];
  const parts = [...ranks, ...faults];
  return parts.length ? parts.join(' · ') : '아무도 못 눌렀어요';
}

/**
 * @returns {{ banner: string, outcome: string|null }}
 *   banner: what the big sign says while the game runs; outcome: the final line (also logged in chat).
 */
function describeGame(msg, nameOf) {
  const title = GAME_TITLE[msg.game];
  if (msg.game === 'lottery') {
    return { banner: `${title} 중… (${nameOf(msg.by)}님이 시작)`, outcome: `☕ 오늘 커피는 ${nameOf(msg.picked)}!` };
  }
  if (msg.game === 'race') {
    const first = msg.order[0];
    const last = msg.order[msg.order.length - 1];
    return {
      banner: `${title}! 꼴찌가 커피 쏘기 (${nameOf(msg.by)}님이 시작)`,
      outcome: first ? `${title} · 1등 ${nameOf(first)} · 꼴찌 ${nameOf(last)} ☕ 커피 당첨` : `${title} · 아무도 안 달렸어요`,
    };
  }
  if (msg.game === 'rps') {
    if (msg.phase === 'pick') {
      return { banner: `${title}! ${Math.round(msg.deadlineMs / 1000)}초 안에 내 캐릭터 위에서 골라요`, outcome: null };
    }
    return { banner: title, outcome: `${title} · ${rpsOutcome(msg, nameOf)}` };
  }
  if (msg.phase === 'ready') return { banner: `${title}! 준비… "지금!"이 뜨면 내 캐릭터를 클릭`, outcome: null };
  if (msg.phase === 'go') return { banner: '지금!', outcome: null };
  return { banner: title, outcome: `${title} · ${reactionOutcome(msg, nameOf)}` };
}

module.exports = { describeGame, HAND_EMOJI, seconds };

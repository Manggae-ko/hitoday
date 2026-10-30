// Mini-game staging on the room strip. The server already decided every outcome;
// this file only plays it out: a banner sign, spotlights, hand pickers, bubbles.

(() => {
const HANDS = [
  { move: 'rock', emoji: '✊', label: '바위' },
  { move: 'scissors', emoji: '✌️', label: '가위' },
  { move: 'paper', emoji: '✋', label: '보' },
];
const HAND_EMOJI = Object.fromEntries(HANDS.map((h) => [h.move, h.emoji]));
const RESULT_LINGER_MS = 7_000;
const BUBBLE_MS = 7_000;
const SPOT_FAST_MS = 80;
const SPOT_SLOW_MS = 420;
const RACE_COUNTDOWN_MS = 2_000; // keep in step with src/main/main.js
const COUNTDOWN = ['3…', '2…', '1…'];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const seconds = (ms) => `${(ms / 1000).toFixed(2)}초`;

/**
 * @param stage  { root, actor(code), say(code, text, ms), hushAll(), mark(code, cls, on), clearMarks(cls),
 *                 race(runners, delayMs, order) → Promise, raceHome() }
 * @param api    window.hitoday
 */
function createGameStage(stage, api) {
  const banner = document.createElement('div');
  banner.className = 'game-banner';
  banner.hidden = true;
  banner.setAttribute('role', 'status');
  stage.root.append(banner);

  let current = null; // { id, game, me, tapHandler }
  let lingerTimer = null;

  function showBanner(text, flash = false) {
    clearTimeout(lingerTimer);
    banner.textContent = text;
    banner.hidden = false;
    banner.classList.toggle('is-flash', flash);
  }

  function endSoon() {
    clearTimeout(lingerTimer);
    lingerTimer = setTimeout(() => {
      banner.hidden = true;
      ['is-spot', 'is-picked', 'is-target', 'is-winner'].forEach((cls) => stage.clearMarks(cls));
      removePicker();
      stage.raceHome();
      current = null;
    }, RESULT_LINGER_MS);
  }

  // --- race ---------------------------------------------------------------

  async function playRace(msg) {
    const stillOn = () => current && current.id === msg.id;
    const finished = stage.race(msg.race, RACE_COUNTDOWN_MS, msg.order);
    showBanner(msg.banner);
    const step = RACE_COUNTDOWN_MS / (COUNTDOWN.length + 1);
    for (const count of COUNTDOWN) {
      await wait(step);
      if (!stillOn()) return;
      showBanner(count);
    }
    await wait(step);
    if (!stillOn()) return;
    showBanner('출발! 🏁', true);
    await finished;
    if (!stillOn()) return;
    const last = msg.order.length - 1;
    msg.order.forEach((code, i) => {
      const line = i === 0 ? '1등! 🏁' : i === last ? '꼴찌… ☕' : `${i + 1}등`;
      stage.say(code, line, BUBBLE_MS);
      if (i === 0) stage.mark(code, 'is-winner', true);
    });
    showBanner(msg.outcome);
    endSoon();
  }

  // --- coffee lottery -----------------------------------------------------

  async function playLottery(msg) {
    showBanner(msg.banner);
    const steps = msg.bounce.length;
    for (let i = 0; i < steps; i += 1) {
      if (!current || current.id !== msg.id) return;
      stage.clearMarks('is-spot');
      stage.mark(msg.bounce[i], 'is-spot', true);
      const progress = i / Math.max(1, steps - 1);
      await wait(SPOT_FAST_MS + (SPOT_SLOW_MS - SPOT_FAST_MS) * progress ** 2);
    }
    stage.mark(msg.picked, 'is-picked', true);
    showBanner(msg.outcome);
    stage.say(msg.picked, '☕ 내가 쏜다…', BUBBLE_MS);
    msg.players.filter((p) => p !== msg.picked).forEach((p) => stage.say(p, '잘 마실게 ㅎㅎ', BUBBLE_MS));
    endSoon();
  }

  // --- rock-paper-scissors ------------------------------------------------

  let picker = null;
  function removePicker() {
    if (picker) picker.remove();
    picker = null;
  }

  function showPicker(me) {
    const actor = stage.actor(me);
    if (!actor) return;
    removePicker();
    picker = document.createElement('div');
    picker.className = 'hand-picker interactive';
    HANDS.forEach(({ move, emoji, label }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = emoji;
      button.setAttribute('aria-label', label);
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        api.gameMove(move);
        removePicker();
        stage.say(me, '골랐어!', BUBBLE_MS);
      });
      picker.append(button);
    });
    actor.character.root.append(picker);
  }

  function rpsPick(msg) {
    showBanner(msg.banner);
    const iPlay = msg.players.includes(msg.me);
    // Everyone else thinks; I get the hand buttons instead of a bubble.
    msg.players.filter((p) => !(iPlay && p === msg.me)).forEach((p) => stage.say(p, '🤔', msg.deadlineMs));
    if (iPlay) showPicker(msg.me);
  }

  function rpsResult(msg) {
    removePicker();
    msg.players.forEach((p) => stage.say(p, HAND_EMOJI[msg.choices[p]] || '…', BUBBLE_MS));
    msg.winners.forEach((p) => stage.mark(p, 'is-winner', true));
    showBanner(msg.outcome);
    endSoon();
  }

  // --- reaction race ------------------------------------------------------

  function reactionReady(msg) {
    showBanner(msg.banner);
    if (!msg.players.includes(msg.me)) return;
    stage.mark(msg.me, 'is-target', true);
    current.tapHandler = () => {
      api.gameMove('tap');
      current.tapHandler = null;
      stage.mark(msg.me, 'is-target', false);
      stage.say(msg.me, '탁!', 2_000);
    };
  }

  function reactionResult(msg) {
    stage.clearMarks('is-target');
    if (current) current.tapHandler = null;
    msg.ranking.forEach((r, i) => {
      stage.say(r.code, `${i + 1}등 ${seconds(r.ms)}`, BUBBLE_MS);
      if (i === 0) stage.mark(r.code, 'is-winner', true);
    });
    msg.faults.forEach((p) => stage.say(p, '앗 부정출발', BUBBLE_MS));
    showBanner(msg.outcome);
    endSoon();
  }

  // --- dispatcher ---------------------------------------------------------

  function handle(msg) {
    if (!current || current.id !== msg.id) {
      // A new game: wipe the last game's marks and bubbles.
      ['is-spot', 'is-picked', 'is-target', 'is-winner'].forEach((cls) => stage.clearMarks(cls));
      stage.hushAll();
      removePicker();
      stage.raceHome(); // a new game ends any race still lined up
      current = { id: msg.id, game: msg.game, tapHandler: null };
    }
    if (msg.game === 'lottery') return playLottery(msg);
    if (msg.game === 'race') return playRace(msg);
    if (msg.game === 'rps') return msg.phase === 'pick' ? rpsPick(msg) : rpsResult(msg);
    if (msg.phase === 'ready') return reactionReady(msg);
    if (msg.phase === 'go') return showBanner(msg.banner, true);
    return reactionResult(msg);
  }

  /** My character was clicked: returns true if a game used the click. */
  function takeClick() {
    if (!current || !current.tapHandler) return false;
    current.tapHandler();
    return true;
  }

  return { handle, takeClick };
}

window.GameStage = { createGameStage };
})();

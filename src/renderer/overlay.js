// Room strip: everyone in my room stands along the bottom of my screen.
// I'm at the far right; others line up to my left in the order they joined.
// Whoever talks gets a bubble; people whose app is off doze (dimmed, zzz).

const { createCharacter, hueFor } = window.Character;
const api = window.nolleowa;

const CHAR_WIDTH = 96;
const WALK_SPEED_PX_PER_S = 170;
const EDGE_INSET = 40;
const MAX_GAP = 120;
const MIN_GAP = 64;
const BUBBLE_MS = 9_000;

const stage = document.getElementById('stage');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const actors = new Map(); // member code -> { character, chain, bubbleTimer, index }
let lineup = []; // member codes, me first
let hasLinedUp = false;

const offLeft = () => -CHAR_WIDTH - 20;

/** x position for the n-th person from the right; squeezes together on narrow screens. */
function slotX(index, count) {
  const room = window.innerWidth - EDGE_INSET * 2 - CHAR_WIDTH;
  const gap = count > 1 ? Math.max(MIN_GAP, Math.min(MAX_GAP, room / (count - 1))) : MAX_GAP;
  return window.innerWidth - EDGE_INSET - CHAR_WIDTH - index * gap;
}

function place(character, x) {
  character.x = x;
  character.root.style.transform = `translateX(${x}px)`;
}

async function walk(character, toX) {
  const fromX = character.x;
  if (fromX === toX) return;
  character.face(toX < fromX ? 'left' : 'right');
  if (reducedMotion) {
    place(character, toX);
    return;
  }
  character.pose('is-walking');
  const duration = (Math.abs(toX - fromX) / WALK_SPEED_PX_PER_S) * 1000;
  const animation = character.root.animate(
    [{ transform: `translateX(${fromX}px)` }, { transform: `translateX(${toX}px)` }],
    { duration, easing: 'linear', fill: 'forwards' },
  );
  await animation.finished;
  place(character, toX);
  animation.cancel();
  character.pose();
  character.face('left');
}

/** Runs one actor's moves in order, so a new move never cuts into a walk midway. */
function perform(actor, move) {
  actor.chain = actor.chain.then(move).catch((err) => console.error('stage move failed', err));
}

function createActor(member, isMe) {
  const character = createCharacter({ name: member.name, hue: hueFor(member.code, member.color) });
  if (isMe) character.root.classList.add('is-me');
  const zzz = document.createElement('span');
  zzz.className = 'zzz';
  zzz.textContent = 'z z';
  character.root.append(zzz);
  character.root.addEventListener('click', () => {
    // During the reaction race, clicking my own character is the game move.
    if (isMe && games.takeClick()) return;
    api.openControl();
  });
  stage.append(character.root);
  return { character, chain: Promise.resolve(), bubbleTimer: null, index: -1 };
}

function updateLineup({ me, members }) {
  const others = members.filter((m) => m.code !== me);
  const mine = members.find((m) => m.code === me) || { code: me, name: '나', online: true };
  const ordered = [mine, ...others];
  const count = ordered.length;
  const present = new Set(ordered.map((m) => m.code));

  // People who left walk off to the left.
  actors.forEach((actor, code) => {
    if (present.has(code)) return;
    actors.delete(code);
    perform(actor, async () => {
      clearTimeout(actor.bubbleTimer);
      actor.character.hush();
      await walk(actor.character, offLeft());
      actor.character.root.remove();
    });
  });

  ordered.forEach((member, index) => {
    const isNew = !actors.has(member.code);
    const actor = isNew ? createActor(member, member.code === me) : actors.get(member.code);
    actors.set(member.code, actor);
    actor.index = index;
    actor.character.setLabel(member.name);
    actor.character.root.style.setProperty('--hue', String(hueFor(member.code, member.color)));
    actor.character.root.classList.toggle('is-asleep', !member.online);
    const target = slotX(index, count);
    if (isNew) {
      // On first launch everyone is simply there; later arrivals walk in.
      place(actor.character, hasLinedUp && member.code !== me ? offLeft() : target);
      actor.character.face('left');
    }
    perform(actor, () => walk(actor.character, target));
  });

  lineup = ordered.map((m) => m.code);
  hasLinedUp = true;
}

/** Shows a bubble over someone; a newer line replaces the old one. */
function say(code, text, ms = BUBBLE_MS) {
  const actor = actors.get(code);
  if (!actor) return;
  perform(actor, () => {
    clearTimeout(actor.bubbleTimer);
    actor.character.say(text);
    actor.character.pose('is-waving');
    actor.bubbleTimer = setTimeout(() => {
      actor.character.hush();
      actor.character.pose();
    }, ms);
  });
}

function memberSays({ from, message }) {
  const actor = actors.get(from);
  if (actor) actor.character.root.classList.remove('is-asleep');
  say(from, message);
}

const games = window.GameStage.createGameStage({
  root: stage,
  actor: (code) => actors.get(code),
  say,
  hushAll: () => actors.forEach((actor) => {
    clearTimeout(actor.bubbleTimer);
    actor.character.hush();
    actor.character.pose();
  }),
  mark: (code, cls, on) => {
    const actor = actors.get(code);
    if (actor) actor.character.root.classList.toggle(cls, on);
  },
  clearMarks: (cls) => actors.forEach((actor) => actor.character.root.classList.remove(cls)),
}, api);

const DIRECTIONS = {
  'room:members': updateLineup,
  'member:says': memberSays,
  game: (msg) => games.handle(msg),
};

// --- click-through --------------------------------------------------------
// The window ignores the mouse except while it hovers a character.

let ignoring = true;
document.addEventListener('mousemove', (event) => {
  const overCharacter = Boolean(event.target.closest && event.target.closest('.interactive'));
  if (overCharacter === !ignoring) return;
  ignoring = !overCharacter;
  api.setIgnoreMouse(ignoring);
});

window.addEventListener('resize', () => {
  lineup.forEach((code, index) => {
    const actor = actors.get(code);
    if (actor) place(actor.character, slotX(index, lineup.length));
  });
});

api.onCommand((channel, payload) => DIRECTIONS[channel](payload));
api.ready();

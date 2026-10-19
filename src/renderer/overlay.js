// Room strip: everyone in my room stands along the bottom of my screen.
// I'm at the far right; others line up to my left in the order they joined.
// Whoever talks gets a bubble; people whose app is off doze (dimmed, zzz).

const { createCharacter, colorFor } = window.Character;
const api = window.jakdang;

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

const DRAG_THRESHOLD_PX = 5;
const DRAG_SEND_MS = 120;

/** Turns a chosen spot (center as a fraction of width) into a left edge in pixels. */
const spotToX = (spot) => Math.min(window.innerWidth - CHAR_WIDTH, Math.max(0, spot * window.innerWidth - CHAR_WIDTH / 2));
const xToSpot = (x) => Math.min(1, Math.max(0, (x + CHAR_WIDTH / 2) / window.innerWidth));

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

/** Where someone should stand: their chosen spot, or their automatic place in line. */
const targetX = (actor, count) => (actor.spot !== null && actor.spot !== undefined ? spotToX(actor.spot) : slotX(actor.index, count));

// --- dragging my own character ---------------------------------------------

let drag = null; // { startX, originX, moved, lastSent }
let justDragged = false;

/** Buttons that sit on my character (the hand picker) get the click, not drag or open-settings. */
const fromControl = (event) => Boolean(event.target.closest && event.target.closest('button, .hand-picker'));

function startDrag(actor, event) {
  if (event.button !== 0 || fromControl(event)) return;
  actor.character.root.setPointerCapture(event.pointerId);
  actor.character.root.getAnimations().forEach((a) => a.cancel()); // stop any walk in progress
  drag = { actor, startX: event.clientX, originX: actor.character.x, moved: false, lastSent: 0 };
}

function moveDrag(event) {
  if (!drag) return;
  const dx = event.clientX - drag.startX;
  if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
  const { character } = drag.actor;
  const x = Math.min(window.innerWidth - CHAR_WIDTH, Math.max(0, drag.originX + dx));
  if (!drag.moved) character.pose('is-walking');
  drag.moved = true;
  character.face(x < character.x ? 'left' : 'right');
  place(character, x);
  if (event.timeStamp - drag.lastSent > DRAG_SEND_MS) {
    drag.lastSent = event.timeStamp;
    api.move(xToSpot(x), false); // friends see me walk while I drag
  }
}

function endDrag() {
  if (!drag) return;
  const { actor, moved } = drag;
  drag = null;
  if (!moved) return;
  justDragged = true; // the click that follows a drag shouldn't open the settings window
  actor.spot = xToSpot(actor.character.x);
  actor.character.pose();
  api.move(actor.spot, true);
}

function createActor(member, isMe) {
  const character = createCharacter({
    name: member.name,
    color: colorFor(member.code, member.color),
    avatar: member.avatar,
    character: member.character,
  });
  if (isMe) character.root.classList.add('is-me');
  const zzz = document.createElement('span');
  zzz.className = 'zzz';
  zzz.textContent = 'z z';
  character.root.append(zzz);
  const actor = { character, chain: Promise.resolve(), bubbleTimer: null, index: -1, spot: null };
  character.root.addEventListener('click', (event) => {
    if (fromControl(event)) return;
    if (justDragged) {
      justDragged = false;
      return;
    }
    // During the reaction race, clicking my own character is the game move.
    if (isMe && games.takeClick()) return;
    api.openControl();
  });
  if (isMe) {
    character.root.addEventListener('pointerdown', (event) => startDrag(actor, event));
    character.root.addEventListener('pointermove', moveDrag);
    character.root.addEventListener('pointerup', endDrag);
    character.root.addEventListener('pointercancel', endDrag);
  }
  stage.append(character.root);
  return actor;
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
    // While I'm dragging, my own spot is whatever is under my mouse.
    if (!(drag && drag.actor === actor)) actor.spot = member.x ?? null;
    actor.character.setLabel(member.name);
    actor.character.setLook(colorFor(member.code, member.color), member.avatar, member.character);
    actor.character.root.classList.toggle('is-asleep', !member.online);
    if (drag && drag.actor === actor) return;
    const target = targetX(actor, count);
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

/** A friend dragged their character somewhere: walk there. */
function memberMoved({ code, x }) {
  const actor = actors.get(code);
  if (!actor) return;
  actor.spot = x;
  perform(actor, () => walk(actor.character, targetX(actor, lineup.length)));
}

const DIRECTIONS = {
  'room:members': updateLineup,
  'member:says': memberSays,
  'member:moved': memberMoved,
  game: (msg) => games.handle(msg),
};

// --- click-through --------------------------------------------------------
// The window ignores the mouse except while it hovers a character.

let ignoring = true;
document.addEventListener('mousemove', (event) => {
  if (drag) return; // keep the mouse while dragging, even if the pointer outruns the character
  const overCharacter = Boolean(event.target.closest && event.target.closest('.interactive'));
  if (overCharacter === !ignoring) return;
  ignoring = !overCharacter;
  api.setIgnoreMouse(ignoring);
});

window.addEventListener('resize', () => {
  lineup.forEach((code) => {
    const actor = actors.get(code);
    if (actor) place(actor.character, targetX(actor, lineup.length));
  });
});

api.onCommand((channel, payload) => DIRECTIONS[channel](payload));
api.ready();

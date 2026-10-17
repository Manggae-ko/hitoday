// Conversation scene: my character lives at the right edge and speaks what I send.
// A friend who talks to me walks in from the left, stays while we chat, and
// wanders off after a quiet spell. Both screens show the same scene, mirrored.

const { createCharacter, hueFor, HOME_HUE } = window.Character;
const api = window.nolleowa;

const CHAR_WIDTH = 96;
const WALK_SPEED_PX_PER_S = 150;
const HOME_INSET = 40;
const BUBBLE_MS = 9_000;
const GUEST_IDLE_MS = 60_000;
const GUEST_GAP = 130;

const stage = document.getElementById('stage');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const offLeft = () => -CHAR_WIDTH - 20;
const homeX = () => window.innerWidth - CHAR_WIDTH - HOME_INSET;
// Guests line up from the middle-left so they never stand on each other or on me.
const guestSpot = (slot) => Math.max(20, Math.round(window.innerWidth * 0.4) - slot * GUEST_GAP);

function place(character, x) {
  character.x = x;
  character.root.style.transform = `translateX(${x}px)`;
}

async function walk(character, toX) {
  const fromX = character.x;
  character.face(toX < fromX ? 'left' : 'right');
  if (reducedMotion) {
    place(character, toX);
    return;
  }
  const duration = (Math.abs(toX - fromX) / WALK_SPEED_PX_PER_S) * 1000;
  const animation = character.root.animate(
    [{ transform: `translateX(${fromX}px)` }, { transform: `translateX(${toX}px)` }],
    { duration, easing: 'linear', fill: 'forwards' },
  );
  await animation.finished;
  place(character, toX);
  animation.cancel();
}

/** Shows a bubble and hides it later; a newer line replaces the old one. */
function speak(entry, text) {
  clearTimeout(entry.bubbleTimer);
  entry.character.say(text);
  entry.character.pose('is-waving');
  entry.bubbleTimer = setTimeout(() => {
    entry.character.hush();
    entry.character.pose();
  }, BUBBLE_MS);
}

// --- me -------------------------------------------------------------------

let home = null;

async function setupHome() {
  const { name } = await api.getHome();
  const character = createCharacter({ name, hue: HOME_HUE });
  character.root.classList.add('is-home');
  character.root.addEventListener('click', () => api.openControl());
  stage.append(character.root);
  place(character, homeX());
  character.face('left');
  home = { character, bubbleTimer: null };
}

// --- friends --------------------------------------------------------------

const guests = new Map(); // friend code -> { character, slot, ready, bubbleTimer, idleTimer }

function freeSlot() {
  const taken = new Set([...guests.values()].map((g) => g.slot));
  let slot = 0;
  while (taken.has(slot)) slot += 1;
  return slot;
}

function arrive(from, fromName) {
  const character = createCharacter({ name: fromName, hue: hueFor(from), label: fromName });
  character.root.classList.add('is-guest');
  character.root.addEventListener('click', () => api.openControl());
  stage.append(character.root);
  place(character, offLeft());

  const entry = { character, slot: freeSlot(), bubbleTimer: null, idleTimer: null, ready: null };
  guests.set(from, entry);
  character.pose('is-walking');
  entry.ready = walk(character, guestSpot(entry.slot)).then(() => character.pose());
  return entry;
}

async function leave(from) {
  const entry = guests.get(from);
  if (!entry) return;
  guests.delete(from);
  clearTimeout(entry.bubbleTimer);
  entry.character.hush();
  entry.character.pose('is-walking');
  await walk(entry.character, offLeft());
  entry.character.root.remove();
}

async function guestSays({ from, fromName, message }) {
  const entry = guests.get(from) || arrive(from, fromName);
  entry.character.setLabel(fromName);
  clearTimeout(entry.idleTimer);
  entry.idleTimer = setTimeout(() => leave(from), GUEST_IDLE_MS);
  await entry.ready;
  if (guests.get(from) === entry) speak(entry, message);
}

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
  if (home) place(home.character, homeX());
  guests.forEach((entry) => place(entry.character, guestSpot(entry.slot)));
});

api.onGuestSays((msg) => {
  guestSays(msg).catch((err) => console.error('guest failed', err));
});
api.onHomeSays(({ message }) => home && speak(home, message));
api.onHomeRename(({ name }) => home && home.character.setLabel(name));
setupHome();

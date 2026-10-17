// Stage for one person's screen. Each character exists in exactly one place:
// my character lives at the right edge and walks out (right) to visit a friend;
// a visiting friend walks in from the left. The main process decides who is where
// (src/main/conversation.js); this file only performs the stage directions.

const { createCharacter, hueFor } = window.Character;
const api = window.nolleowa;

const CHAR_WIDTH = 96;
const WALK_SPEED_PX_PER_S = 150;
const HOME_INSET = 40;
const BUBBLE_MS = 9_000;
const EDGE_LINE_MS = 9_000;
const EDGE_LINES_MAX = 3;
const NOTE_TRIP_MS = 2_500;
const GREETING_MS = 2_500;
const GUEST_GAP = 130;

const stage = document.getElementById('stage');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const offLeft = () => -CHAR_WIDTH - 20;
const offRight = () => window.innerWidth + 20;
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
function speak(actor, text) {
  clearTimeout(actor.bubbleTimer);
  actor.character.say(text);
  actor.character.pose('is-waving');
  actor.bubbleTimer = setTimeout(() => {
    actor.character.hush();
    actor.character.pose();
  }, BUBBLE_MS);
}

/** Runs one actor's moves in order, so a "come back" never interrupts a "leave" midway. */
function perform(actor, move) {
  actor.chain = actor.chain.then(move).catch((err) => console.error('stage move failed', err));
  return actor.chain;
}

// --- me -------------------------------------------------------------------

let home = null;
const sign = document.createElement('div');
sign.className = 'sign';
sign.hidden = true;
const edge = document.createElement('ol');
edge.className = 'edge-chat';

async function setupHome() {
  const { name, code } = await api.getHome();
  const character = createCharacter({ name, hue: hueFor(code) });
  character.root.classList.add('is-home');
  character.root.addEventListener('click', () => api.openControl());
  stage.append(sign, edge, character.root);
  place(character, homeX());
  character.face('left');
  home = { character, bubbleTimer: null, chain: Promise.resolve(), away: false };
}

async function goOut(label) {
  if (home.away) return;
  home.away = true;
  clearTimeout(home.bubbleTimer);
  home.character.hush();
  home.character.pose('is-walking', 'has-note');
  await walk(home.character, offRight());
  home.character.root.hidden = true;
  sign.textContent = label;
  sign.hidden = false;
}

async function comeBack(greeting) {
  if (!home.away) return;
  home.away = false;
  sign.hidden = true;
  home.character.root.hidden = false;
  place(home.character, offRight());
  home.character.pose('is-walking');
  await walk(home.character, homeX());
  home.character.face('left');
  if (!greeting) return home.character.pose();
  speak(home, greeting);
  await wait(GREETING_MS);
  return undefined;
}

function showEdgeLine({ mine, name, message }) {
  const item = document.createElement('li');
  item.className = mine ? 'edge-line mine' : 'edge-line';
  const who = document.createElement('span');
  who.className = 'who';
  who.textContent = name;
  const text = document.createElement('span');
  text.textContent = message;
  item.append(who, text);
  edge.append(item);
  while (edge.children.length > EDGE_LINES_MAX) edge.firstElementChild.remove();
  setTimeout(() => item.classList.add('is-fading'), EDGE_LINE_MS);
  setTimeout(() => item.remove(), EDGE_LINE_MS + 600);
}

// --- friends --------------------------------------------------------------

const guests = new Map(); // friend code -> actor

function freeSlot() {
  const taken = new Set([...guests.values()].map((g) => g.slot));
  let slot = 0;
  while (taken.has(slot)) slot += 1;
  return slot;
}

function guestFor(from, fromName) {
  const existing = guests.get(from);
  if (existing) return existing;
  const character = createCharacter({ name: fromName, hue: hueFor(from), label: fromName });
  character.root.classList.add('is-guest');
  character.root.addEventListener('click', () => api.openControl());
  stage.append(character.root);
  place(character, offLeft());
  const actor = { character, slot: freeSlot(), bubbleTimer: null, chain: Promise.resolve() };
  guests.set(from, actor);
  perform(actor, async () => {
    character.pose('is-walking', 'has-note');
    await walk(character, guestSpot(actor.slot));
    character.pose();
  });
  return actor;
}

function guestSays({ from, fromName, message }) {
  const actor = guestFor(from, fromName);
  actor.character.setLabel(fromName);
  perform(actor, () => speak(actor, message));
}

function guestLeaves({ from }) {
  const actor = guests.get(from);
  if (!actor) return;
  guests.delete(from);
  perform(actor, async () => {
    clearTimeout(actor.bubbleTimer);
    actor.character.hush();
    actor.character.pose('is-walking');
    await walk(actor.character, offLeft());
    actor.character.root.remove();
  });
}

// --- stage directions -----------------------------------------------------

const DIRECTIONS = {
  'me:go': ({ friendName }) => perform(home, () => goOut(`${friendName}네 놀러 감`)),
  'me:return': () => perform(home, () => comeBack('다녀왔어!')),
  'me:return-now': () => perform(home, () => comeBack('')),
  'me:drop-note': () => perform(home, async () => {
    await goOut('쪽지 두러 감');
    await wait(NOTE_TRIP_MS);
    await comeBack('친구가 없어서 쪽지만 두고 왔어');
  }),
  'edge:line': showEdgeLine,
  'home:says': ({ message }) => perform(home, () => speak(home, message)),
  'home:note': ({ fromName, message }) => {
    const text = `${fromName}가 남긴 쪽지: ${message}`;
    if (home.away) return showEdgeLine({ mine: false, name: fromName, message: text });
    return perform(home, () => speak(home, text));
  },
  'home:rename': ({ name }) => home.character.setLabel(name),
  'guest:says': guestSays,
  'guest:leave': guestLeaves,
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
  if (home && !home.away) place(home.character, homeX());
  guests.forEach((actor) => place(actor.character, guestSpot(actor.slot)));
});

setupHome().then(() => {
  api.onCommand((channel, payload) => DIRECTIONS[channel](payload));
});

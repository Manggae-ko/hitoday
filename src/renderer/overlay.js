// Choreography: my character lives at the right edge; friends walk in from the left.
// Leaving exits right, arriving enters left, so two screens side by side look connected.

const { createCharacter, hueFor } = window.Character;
const api = window.nolleowa;

const CHAR_WIDTH = 96;
const WALK_SPEED_PX_PER_S = 150;
const HOME_INSET = 40;
const TALK_MS = 6_500;
const NOBODY_HOME_MS = 4_000;
const RETURN_FALLBACK_MS = 60_000;
const HOME_HUE = 32;

const stage = document.getElementById('stage');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const offLeft = () => -CHAR_WIDTH - 20;
const offRight = () => window.innerWidth + 20;
const homeX = () => window.innerWidth - CHAR_WIDTH - HOME_INSET;
const guestSpot = () => Math.round(window.innerWidth * 0.42);

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

// --- my character ---------------------------------------------------------

const home = { character: null, away: false, returnTimer: null };

async function setupHome() {
  const { name } = await api.getHome();
  const me = createCharacter({ name, hue: HOME_HUE });
  me.root.classList.add('is-home');
  me.root.addEventListener('click', () => api.openControl());
  stage.append(me.root);
  place(me, homeX());
  home.character = me;
}

async function leaveHome({ queued }) {
  const me = home.character;
  if (!me || home.away) return;
  home.away = true;
  me.pose('is-walking', 'has-note');
  await walk(me, offRight());
  me.root.hidden = true;
  if (queued) {
    await wait(NOBODY_HOME_MS);
    return returnHome({ greeted: false });
  }
  home.returnTimer = setTimeout(() => returnHome({ greeted: false }), RETURN_FALLBACK_MS);
}

async function returnHome({ greeted }) {
  const me = home.character;
  if (!me || !home.away) return;
  clearTimeout(home.returnTimer);
  home.away = false;
  me.root.hidden = false;
  me.pose('is-walking');
  await walk(me, homeX());
  me.pose('is-waving');
  me.face('left');
  me.say(greeted ? '다녀왔어!' : '친구가 없어서 쪽지만 두고 왔어');
  await wait(2_500);
  me.hush();
  me.pose();
  api.homeBack();
}

// --- visiting friends -----------------------------------------------------

let guestLine = Promise.resolve();

async function hostGuest({ from, fromName, message }) {
  const guest = createCharacter({ name: fromName, hue: hueFor(from), label: `${fromName} 놀러옴` });
  guest.root.classList.add('is-guest');
  stage.append(guest.root);
  place(guest, offLeft());

  guest.pose('is-walking', 'has-note');
  await walk(guest, guestSpot());
  guest.pose('is-waving', 'has-note');
  guest.say(message);

  // Clicking the guest says goodbye early.
  await Promise.race([wait(TALK_MS), new Promise((r) => guest.root.addEventListener('click', r, { once: true }))]);

  guest.hush();
  guest.pose('is-walking');
  await walk(guest, offLeft());
  guest.root.remove();
  api.guestDone(from);
}

function queueGuest(visit) {
  guestLine = guestLine.then(() => hostGuest(visit)).catch((err) => {
    console.error('guest visit failed', err);
  });
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
  if (home.character && !home.away) place(home.character, homeX());
});

api.onGuestArrive(queueGuest);
api.onHomeLeave(leaveHome);
api.onHomeReturn(returnHome);
api.onHomeRename(({ name }) => home.character && home.character.setLabel(name));
setupHome();

// Pixel characters drawn from sprite sheets (see docs/CHARACTER_GUIDE.md).
// A sheet is 128×128: 4×4 cells of 32×32, shown at 3× (96×96) with crisp pixels.
//   row 0 idle (2) · row 1 walk (4) · row 2 talk (2) · row 3 sleep (2)
// A single 32×32 image also works; it just doesn't animate frame-by-frame.
// Names and messages always go in via textContent.

(() => {
// The main process picks each member's color (shared/colors.js); this just guards the range.
const ROOM_COLORS = 12;
const colorFor = (_code, color) => (Number.isInteger(color) ? Math.abs(color) % ROOM_COLORS : 0);

const defaultSheet = (color) => `sprites/mochi-${color}.png`;

function createCharacter({ name, color, avatar }) {
  const root = document.createElement('div');
  root.className = 'char interactive';

  const figure = document.createElement('div');
  figure.className = 'figure';
  const sheet = document.createElement('img');
  sheet.className = 'sheet';
  sheet.alt = '';
  sheet.draggable = false;
  figure.append(sheet);

  const tag = document.createElement('div');
  tag.className = 'tag';
  tag.textContent = name;

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.setAttribute('role', 'status');

  root.append(bubble, tag, figure);

  /** avatar: { url, single } for an uploaded image, or null for the built-in mochi. */
  function setLook(nextColor, nextAvatar) {
    const src = nextAvatar ? nextAvatar.url : defaultSheet(nextColor);
    if (sheet.getAttribute('src') !== src) sheet.src = src;
    figure.classList.toggle('is-single', Boolean(nextAvatar && nextAvatar.single));
  }
  setLook(color, avatar);

  return {
    root,
    setLook,
    setLabel: (text) => {
      tag.textContent = text;
    },
    say: (text) => {
      bubble.textContent = text;
      root.classList.add('is-talking');
    },
    hush: () => root.classList.remove('is-talking'),
    pose: (...poses) => {
      root.classList.remove('is-walking', 'is-waving');
      poses.forEach((p) => root.classList.add(p));
    },
    face: (direction) => root.classList.toggle('facing-left', direction === 'left'),
  };
}

window.Character = { createCharacter, colorFor };
})();

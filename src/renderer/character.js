// "말랑이": an original round mochi character drawn in SVG.
// The SVG is static markup; names and notes always go in via textContent.
// Wrapped in its own scope so these names don't clash with overlay.js globals.

(() => {
const CHARACTER_SVG = `
<svg class="figure" viewBox="0 0 100 100" aria-hidden="true">
  <ellipse class="shadow" cx="50" cy="94" rx="30" ry="4"/>
  <ellipse class="foot foot-l" cx="38" cy="89" rx="9" ry="5"/>
  <ellipse class="foot foot-r" cx="62" cy="89" rx="9" ry="5"/>
  <g class="torso">
    <ellipse class="ear" cx="33" cy="27" rx="7" ry="9"/>
    <ellipse class="ear" cx="67" cy="27" rx="7" ry="9"/>
    <path class="body" d="M50 22 C75 22 88 42 88 62 C88 80 72 89 50 89 C28 89 12 80 12 62 C12 42 25 22 50 22 Z"/>
    <g class="eyes">
      <ellipse class="eye" cx="38" cy="56" rx="3.2" ry="4.2"/>
      <ellipse class="eye" cx="62" cy="56" rx="3.2" ry="4.2"/>
    </g>
    <ellipse class="cheek" cx="29" cy="66" rx="6" ry="3.5"/>
    <ellipse class="cheek" cx="71" cy="66" rx="6" ry="3.5"/>
    <path class="mouth" d="M46 63 Q50 67 54 63"/>
    <ellipse class="arm arm-l" cx="15" cy="68" rx="6" ry="8"/>
    <g class="arm-r-group">
      <ellipse class="arm arm-r" cx="85" cy="68" rx="6" ry="8"/>
      <g class="note">
        <rect x="80" y="46" width="19" height="15" rx="2"/>
        <path d="M84 52 h11 M84 56 h7"/>
      </g>
    </g>
  </g>
</svg>`;

/** Stable hue per person's code: the same character looks the same on every screen. */
function hueFor(code) {
  return Array.from(code || '').reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) % 360, 17);
}

function createCharacter({ name, hue, label }) {
  const root = document.createElement('div');
  root.className = 'char interactive';
  root.style.setProperty('--hue', String(hue));
  root.innerHTML = CHARACTER_SVG;

  const tag = document.createElement('div');
  tag.className = 'tag';
  tag.textContent = label || name;
  root.prepend(tag);

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.setAttribute('role', 'status');
  root.prepend(bubble);

  return {
    root,
    setLabel: (text) => {
      tag.textContent = text;
    },
    say: (text) => {
      bubble.textContent = text;
      root.classList.add('is-talking');
    },
    hush: () => root.classList.remove('is-talking'),
    pose: (...poses) => {
      root.classList.remove('is-walking', 'is-waving', 'has-note');
      poses.forEach((p) => root.classList.add(p));
    },
    face: (direction) => root.classList.toggle('facing-left', direction === 'left'),
  };
}

window.Character = { createCharacter, hueFor };
})();

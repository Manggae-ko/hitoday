// Built-in character colors: 12 sprite sheets per character (src/renderer/sprites/<id>-0..11.png).
// In a room the server hands out seats; alone, the color comes from the user's code.

const ROOM_COLORS = 12;

function colorFor(code, seat) {
  if (Number.isInteger(seat) && seat >= 0) return seat % ROOM_COLORS;
  return Array.from(code || '').reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) % ROOM_COLORS, 7);
}

module.exports = { ROOM_COLORS, colorFor };

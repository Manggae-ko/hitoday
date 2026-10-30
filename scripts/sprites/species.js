'use strict';

const { ROOM_PALETTE, furTint, mix, rect, setPx } = require('./pixel');

const OUTLINE = '#3a2f2a';
const EYE = '#241d1a';
const designs = {
  ghost: { bodyW: 8, maxHeight: 13 },
  rabbit: { bodyW: 8, maxHeight: 15 },
  penguin: { bodyW: 8, maxHeight: 13 },
};

function eyes(canvas, pose, y) {
  if (pose === 'sleep') {
    rect(canvas, 6, y + 1, 2, 1, EYE);
    rect(canvas, 10, y + 1, 2, 1, EYE);
  } else {
    rect(canvas, 7, y, 1, 2, EYE);
    rect(canvas, 10, y, 1, 2, EYE);
  }
}

function ghost(canvas, pose, frame, colorIndex) {
  const room = ROOM_PALETTE[colorIndex];
  const fill = furTint('#fff7ed', colorIndex);
  const lift = pose === 'walk' && frame % 2 ? -1 : 0;
  const top = 4 + lift;
  const rows = [[6, 11], [5, 12], [4, 12], [4, 12], [4, 12], [4, 12], [4, 12], [4, 12], [4, 12]];
  rows.forEach(([a, b], i) => rect(canvas, a, top + i, b - a + 1, 1, i === 0 || a === 4 || b === 12 ? OUTLINE : fill));
  rect(canvas, 5, top + 1, 7, 7, fill);
  rect(canvas, 5, top + 8, 2, 15 - (top + 8), fill); rect(canvas, 8, top + 8, 2, 15 - (top + 8), fill); rect(canvas, 11, top + 8, 1, 15 - (top + 8), fill);
  setPx(canvas, 5, 15, OUTLINE); setPx(canvas, 8, 15, OUTLINE); setPx(canvas, 11, 15, OUTLINE);
  eyes(canvas, pose, top + 3);
  if (pose === 'talk' && frame % 2) setPx(canvas, 11, top + 6, room);
}

function rabbit(canvas, pose, frame, colorIndex) {
  const room = ROOM_PALETTE[colorIndex];
  const fill = furTint('#fffaf2', colorIndex);
  const crouch = pose === 'sleep' ? 1 : 0;
  rect(canvas, 5, 1 + crouch, 2, 5 - crouch, OUTLINE); rect(canvas, 6, 2 + crouch, 1, 3 - crouch, room);
  rect(canvas, 9, 2 + crouch, 2, 4 - crouch, OUTLINE); setPx(canvas, 11, 2 + crouch, OUTLINE); rect(canvas, 9, 3 + crouch, 1, 2 - crouch, room);
  rect(canvas, 4, 6, 8, 4, OUTLINE); rect(canvas, 5, 6, 6, 4, fill);
  rect(canvas, 4, 10, 8, 5, OUTLINE); rect(canvas, 5, 10, 6, 4, fill);
  rect(canvas, 4, 10, 8, 2, room);
  setPx(canvas, 12, 12, OUTLINE); setPx(canvas, 13, 13, OUTLINE); setPx(canvas, 12, 14, OUTLINE);
  const footShift = pose === 'walk' ? frame % 2 : 0;
  rect(canvas, 4 + footShift, 15, 3, 1, OUTLINE); rect(canvas, 9 - footShift, 15, 3, 1, OUTLINE);
  eyes(canvas, pose, 7);
  if (pose === 'talk' && frame % 2) setPx(canvas, 11, 9, EYE);
}

function penguin(canvas, pose, frame, colorIndex) {
  const room = ROOM_PALETTE[colorIndex];
  const back = mix('#242a32', room, 0.48);
  rect(canvas, 5, 3, 6, 1, OUTLINE); rect(canvas, 4, 4, 8, 9, OUTLINE); rect(canvas, 3, 8, 2, 4, OUTLINE); rect(canvas, 12, 8, 2, 4, OUTLINE);
  rect(canvas, 5, 4, 6, 8, back); rect(canvas, 5, 8, 6, 4, '#fffaf0');
  rect(canvas, 4, 9, 1, 3, back); rect(canvas, 12, 9, 1, 3, back);
  rect(canvas, 5, 11, 6, 2, room);
  eyes(canvas, pose, 5);
  rect(canvas, 11, 7, pose === 'talk' && frame % 2 ? 2 : 1, 1, room);
  const step = pose === 'walk' ? frame % 2 : 0;
  rect(canvas, 4 + step, 15, 3, 1, room); rect(canvas, 10 - step, 15, 3, 1, room);
  setPx(canvas, 4 + step, 15, OUTLINE); setPx(canvas, 12 - step, 15, OUTLINE);
}

function drawAnimal(canvas, name, pose, frame, colorIndex) {
  ({ ghost, rabbit, penguin })[name](canvas, pose, frame, colorIndex);
}

module.exports = { designs, drawAnimal, OUTLINE };

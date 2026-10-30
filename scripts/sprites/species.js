'use strict';

const { ROOM_PALETTE, furTint, rect, roomTone, setPx } = require('./pixel');

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
    rect(canvas, 9, y + 1, 2, 1, EYE);
  } else {
    rect(canvas, 7, y, 1, 2, EYE);
    rect(canvas, 9, y, 1, 2, EYE);
  }
}

function ghost(canvas, pose, frame, colorIndex) {
  const room = ROOM_PALETTE[colorIndex];
  const fill = furTint('#fff7ed', colorIndex);
  const top = 4 - (pose === 'idle' && frame === 1 ? 1 : 0) + (pose === 'sleep' ? 1 : 0);
  const bodyW = designs.ghost.bodyW;
  rect(canvas, 5, top, bodyW - 2, 1, OUTLINE);
  rect(canvas, 4, top + 1, bodyW, 8, OUTLINE);
  rect(canvas, 5, top + 1, bodyW - 2, 7, fill);
  const phases = pose === 'walk' ? [[4, 7, 10], [5, 8, 10], [4, 8, 9], [5, 7, 10]] : [[4, 7, 10], [4, 7, 10]];
  const teeth = phases[frame % phases.length];
  teeth.forEach((x, index) => {
    const toothTop = top + 9 + ((pose === 'walk' && (frame + index) % 2) ? 1 : 0);
    rect(canvas, x, toothTop, 2, 15 - toothTop + 1, OUTLINE);
  });
  eyes(canvas, pose, top + 3);
  if (pose === 'talk' && frame % 2) setPx(canvas, 9, top + 6, room);
}

function rabbit(canvas, pose, frame, colorIndex) {
  const room = ROOM_PALETTE[colorIndex];
  const fill = furTint('#fffaf2', colorIndex);
  const crouch = pose === 'sleep' ? 1 : 0;
  const breathe = pose === 'idle' && frame === 1 ? -1 : 0;
  rect(canvas, 5, 1 + crouch, 2, 4, OUTLINE);
  rect(canvas, 9, 2 + crouch, 2, 3, OUTLINE); setPx(canvas, 11, 2 + crouch, OUTLINE);
  rect(canvas, 4, 5 + crouch + breathe, designs.rabbit.bodyW, 5 - breathe, OUTLINE); rect(canvas, 5, 6 + crouch + breathe, 6, 3 - breathe, fill);
  rect(canvas, 4, 10, designs.rabbit.bodyW, 5, OUTLINE); rect(canvas, 5, 10, 6, 4, fill);
  rect(canvas, 5, 10, 6, 2, room);
  setPx(canvas, 12, 12, OUTLINE); setPx(canvas, 13, 13, OUTLINE); setPx(canvas, 12, 14, OUTLINE);
  const steps = [[4, 9], [5, 9], [5, 8], [4, 8]];
  const [leftFoot, rightFoot] = pose === 'walk' ? steps[frame] : steps[0];
  rect(canvas, leftFoot, 15, 3, 1, OUTLINE); rect(canvas, rightFoot, 15, 3, 1, OUTLINE);
  eyes(canvas, pose, 6 + crouch + breathe);
  if (pose === 'talk' && frame % 2) setPx(canvas, 9, 9, EYE);
}

function penguin(canvas, pose, frame, colorIndex) {
  const room = ROOM_PALETTE[colorIndex];
  const back = roomTone(colorIndex, 0.48, 0.30);
  const crouch = pose === 'sleep' ? 1 : 0;
  const breathe = pose === 'idle' && frame === 1 ? -1 : 0;
  const top = 3 + crouch;
  rect(canvas, 5, top, 6, 1, OUTLINE); rect(canvas, 4, top + 1, designs.penguin.bodyW, 14 - top, OUTLINE);
  rect(canvas, 5, top + 1, 6, 13 - top, back); rect(canvas, 5, top + 6 + breathe, 6, 14 - (top + 6 + breathe), '#fffaf0');
  rect(canvas, 3, top + 5 + breathe, 2, 4, OUTLINE); rect(canvas, 12, top + 5 - breathe, 2, 4, OUTLINE);
  rect(canvas, 5, 11, 6, 2, room);
  eyes(canvas, pose, top + 2);
  if (pose === 'talk' && frame % 2) setPx(canvas, 10, top + 5, room);
  const steps = [[4, 10], [5, 10], [5, 9], [4, 9]];
  const [leftFoot, rightFoot] = pose === 'walk' ? steps[frame] : steps[0];
  rect(canvas, leftFoot, 15, 3, 1, OUTLINE); rect(canvas, rightFoot, 15, 3, 1, OUTLINE);
}

function drawAnimal(canvas, name, pose, frame, colorIndex) {
  ({ ghost, rabbit, penguin })[name](canvas, pose, frame, colorIndex);
}

module.exports = { designs, drawAnimal, OUTLINE };

// Makes the Microsoft Store tile images electron-builder packs into the appx (build/appx/)
// from the app icon. Usage: node scripts/make-appx-tiles.js   (needs ffmpeg)
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const ICON = path.join(ROOT, 'build', 'icon.png');
const OUT = path.join(ROOT, 'build', 'appx');

// name -> [width, height]; square tiles fill the frame, the wide one centres the icon.
const TILES = {
  StoreLogo: [50, 50],
  Square44x44Logo: [44, 44],
  SmallTile: [71, 71],
  Square150x150Logo: [150, 150],
  LargeTile: [310, 310],
  Wide310x150Logo: [310, 150],
};

fs.mkdirSync(OUT, { recursive: true });
for (const [name, [width, height]] of Object.entries(TILES)) {
  const side = Math.min(width, height);
  const filter = [
    `scale=${side}:${side}:flags=lanczos`,
    'format=rgba',
    `pad=${width}:${height}:${(width - side) / 2}:${(height - side) / 2}:color=0x00000000`,
  ].join(',');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', ICON, '-vf', filter, path.join(OUT, `${name}.png`)]);
  console.log(`${name}.png ${width}x${height}`);
}

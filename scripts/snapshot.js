// Renders the overlay and settings window offscreen and saves PNGs, for visual checks.
// Usage: npm run snapshot -- <out-dir>

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

const outDir = path.resolve(process.argv[process.argv.length - 1] || 'snapshots');
const RENDERER = path.join(__dirname, '..', 'src', 'renderer');
const PRELOAD = path.join(__dirname, '..', 'src');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const fakeState = {
  code: 'K7QX2M',
  name: '동동',
  friendCode: 'BBQ234',
  serverUrl: 'ws://localhost:8787',
  connected: true,
  away: false,
  notice: '놀러 갔어요!',
};

function offscreen(width, height, preload) {
  return new BrowserWindow({
    width,
    height,
    show: false,
    webPreferences: { offscreen: true, preload: path.join(PRELOAD, preload), contextIsolation: true, sandbox: true },
  });
}

async function save(win, name) {
  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, name), image.toPNG());
}

app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  ipcMain.handle('overlay:get-home', () => ({ name: '동동' }));
  ipcMain.handle('control:get-state', () => fakeState);
  ['overlay:set-ignore', 'overlay:guest-done', 'overlay:home-back', 'overlay:open-control'].forEach((c) => ipcMain.on(c, () => {}));

  const overlay = offscreen(1000, 380, 'preload-overlay.js');
  overlay.webContents.on('console-message', (details) => process.stdout.write(`[overlay] ${details.message}\n`));
  await overlay.loadFile(path.join(RENDERER, 'overlay.html'));
  await overlay.webContents.insertCSS('html, body { background: #8fb3c9 !important; }');
  overlay.webContents.send('guest:arrive', { from: 'BBQ234', fromName: '민지', message: '뭐해? 나 방금 퇴근함 ㅎㅎ 저녁 같이 먹을래?' });
  await wait(4_600);
  await save(overlay, 'overlay-guest.png');

  overlay.webContents.send('home:leave', { queued: false });
  await wait(900);
  await save(overlay, 'overlay-leaving.png');

  const control = offscreen(380, 700, 'preload-control.js');
  await control.loadFile(path.join(RENDERER, 'control.html'));
  await wait(400);
  await save(control, 'control.png');

  process.stdout.write(`snapshots saved to ${outDir}\n`);
  app.quit();
});

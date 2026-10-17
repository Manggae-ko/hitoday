// Renders the room strip, the settings window (lobby + in a room) and the download page
// offscreen, and saves PNGs for visual checks.
// Usage: npm run snapshot -- <out-dir>

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

const outDir = path.resolve(process.argv[process.argv.length - 1] || 'snapshots');
const RENDERER = path.join(__dirname, '..', 'src', 'renderer');
const PRELOAD = path.join(__dirname, '..', 'src');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const ME = 'K7QX2M';
const members = [
  { code: 'BBQ234', name: '민지', color: 0, online: true },
  { code: 'ZZT789', name: '준호', color: 1, online: false },
  { code: ME, name: '동동', color: 2, online: true },
  { code: 'HR5522', name: '하린', color: 3, online: true },
];
const roomState = {
  code: ME,
  name: '동동',
  room: { code: 'PARTY7', members },
  serverUrl: 'ws://localhost:8787',
  canEditServer: true,
  connected: true,
  notice: '',
  chat: [
    { mine: false, name: '민지', message: '오늘 회식 몇 시야?' },
    { mine: true, name: '동동', message: '7시래' },
    { mine: false, name: '하린', message: '나 좀 늦을 듯 ㅠ' },
    { mine: true, name: '동동', message: '오케 자리 맡아둘게' },
  ],
};
let controlState = roomState;

function offscreen(width, height, preload) {
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    webPreferences: { offscreen: true, preload: preload && path.join(PRELOAD, preload), contextIsolation: true, sandbox: true },
  });
  win.webContents.on('console-message', (d) => process.stdout.write(`[${preload}] ${d.message}\n`));
  return win;
}

async function save(win, name) {
  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, name), image.toPNG());
}

async function shootControl(state, name) {
  controlState = state;
  const win = offscreen(380, 740, 'preload-control.js');
  await win.loadFile(path.join(RENDERER, 'control.html'));
  await wait(400);
  await save(win, name);
}

app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  ipcMain.handle('overlay:ready', (e) => e.sender.send('room:members', { me: ME, members }));
  ipcMain.handle('control:get-state', () => controlState);
  ['overlay:set-ignore', 'overlay:open-control'].forEach((c) => ipcMain.on(c, () => {}));

  const overlay = offscreen(1000, 340, 'preload-overlay.js');
  await overlay.loadFile(path.join(RENDERER, 'overlay.html'));
  await overlay.webContents.insertCSS('html, body { background: #8fb3c9 !important; }');
  await wait(300);
  overlay.webContents.send('member:says', { from: 'BBQ234', message: '오늘 회식 몇 시야?' });
  overlay.webContents.send('member:says', { from: ME, message: '7시래' });
  await wait(600);
  await save(overlay, 'room-strip.png');

  // A new friend joins: they walk in from the left.
  overlay.webContents.send('room:members', { me: ME, members: [...members, { code: 'NEW222', name: '새친구', color: 4, online: true }] });
  await wait(1_200);
  await save(overlay, 'room-join.png');

  await shootControl(roomState, 'control-room.png');
  await shootControl({ ...roomState, room: null, chat: [] }, 'control-lobby.png');

  const page = path.join(__dirname, '..', 'web', 'index.html');
  for (const [w, h, name] of [[1200, 900, 'web-desktop.png'], [390, 1400, 'web-phone.png']]) {
    const win = offscreen(w, h);
    await win.loadFile(page);
    await wait(5_600);
    await save(win, name);
  }

  process.stdout.write(`snapshots saved to ${outDir}\n`);
  app.quit();
});

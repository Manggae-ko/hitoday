// Renders two people's screens and the settings window offscreen and saves PNGs.
// Scene: 동동 walked over to 민지's screen; they chat there. Each character is in one place.
// Usage: npm run snapshot -- <out-dir>

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

const outDir = path.resolve(process.argv[process.argv.length - 1] || 'snapshots');
const RENDERER = path.join(__dirname, '..', 'src', 'renderer');
const PRELOAD = path.join(__dirname, '..', 'src');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const homeNames = new Map(); // webContents id -> name for overlay:get-home

const fakeState = {
  code: 'K7QX2M',
  name: '동동',
  friendCode: 'BBQ234',
  serverUrl: 'ws://localhost:8787',
  connected: true,
  notice: '',
  chat: [
    { mine: true, name: '동동', message: '뭐해?' },
    { mine: false, name: '민지', message: '방금 퇴근함 ㅎㅎ' },
    { mine: true, name: '동동', message: '오 저녁 같이 먹을래? 성수 쪽 새로 생긴 데 있던데' },
    { mine: false, name: '민지', message: '콜 7시?' },
  ],
};

function offscreen(width, height, preload) {
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    webPreferences: { offscreen: true, preload: path.join(PRELOAD, preload), contextIsolation: true, sandbox: true },
  });
  win.webContents.on('console-message', (d) => process.stdout.write(`[${preload}] ${d.message}\n`));
  return win;
}

async function overlayFor(name, background) {
  const win = offscreen(800, 360, 'preload-overlay.js');
  homeNames.set(win.webContents.id, name);
  await win.loadFile(path.join(RENDERER, 'overlay.html'));
  await win.webContents.insertCSS(`html, body { background: ${background} !important; }`);
  await wait(200);
  return win;
}

async function save(win, name) {
  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, name), image.toPNG());
}

app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const CODES = { 동동: 'K7QX2M', 민지: 'BBQ234' };
  ipcMain.handle('overlay:get-home', (e) => {
    const name = homeNames.get(e.sender.id) || '말랑';
    return { name, code: CODES[name] || 'AAAAAA' };
  });
  ipcMain.handle('control:get-state', () => fakeState);
  ['overlay:set-ignore', 'overlay:open-control'].forEach((c) => ipcMain.on(c, () => {}));

  const dongdong = await overlayFor('동동', '#8fb3c9');
  const minji = await overlayFor('민지', '#b7c99a');

  // 동동 opens a visit: leaves his screen, arrives on 민지's.
  dongdong.webContents.send('me:go', { friendName: '민지' });
  dongdong.webContents.send('edge:line', { mine: true, name: '동동', message: '뭐해?' });
  minji.webContents.send('guest:says', { from: 'K7QX2M', fromName: '동동', message: '뭐해?' });
  await wait(4_500);

  // 민지 replies at home.
  minji.webContents.send('home:says', { message: '방금 퇴근함 ㅎㅎ' });
  dongdong.webContents.send('edge:line', { mine: false, name: '민지', message: '방금 퇴근함 ㅎㅎ' });
  await wait(600);

  await save(dongdong, 'screen-visitor.png');
  await save(minji, 'screen-host.png');

  const control = offscreen(380, 740, 'preload-control.js');
  await control.loadFile(path.join(RENDERER, 'control.html'));
  await wait(400);
  await save(control, 'control.png');

  // Download page, desktop and phone widths, captured mid-animation.
  const page = path.join(__dirname, '..', 'web', 'index.html');
  for (const [w, h, name] of [[1200, 900, 'web-desktop.png'], [390, 1400, 'web-phone.png']]) {
    const win = new BrowserWindow({ width: w, height: h, show: false, webPreferences: { offscreen: true } });
    await win.loadFile(page);
    await wait(5_600);
    await save(win, name);
  }

  process.stdout.write(`snapshots saved to ${outDir}\n`);
  app.quit();
});

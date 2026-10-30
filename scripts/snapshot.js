// Renders the room strip, the settings window (lobby + in a room + schedule) and the download page
// offscreen, and saves PNGs for visual checks.
// Usage: npm run snapshot -- <out-dir>

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { describeGame } = require('../src/main/game-text');
const { encodePng } = require('./png');
const { CHARACTERS } = require('../shared/characters');
const { STATUS_KINDS, STATUS_LABELS, SCHEDULE_WINDOW_DAYS } = require('../shared/protocol');
const { buildScheduleView, dateAfter } = require('../src/main/schedule-view');

const outDir = path.resolve(process.argv[process.argv.length - 1] || 'snapshots');
const RENDERER = path.join(__dirname, '..', 'src', 'renderer');
const PRELOAD = path.join(__dirname, '..', 'src');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const ME = 'K7QX2M';
const ME_NAME = '동동이는오늘도출근했어요'; // 12자: 이름표가 화면 오른쪽에서 잘리지 않는지 확인
const TODAY = '2026-10-30'; // 금요일: 주말은 10/31·11/1·11/7·11/8

/** 캡처 전 DOM 단언: 하나라도 틀리면 스냅샷 전체를 실패시킴 */
function expect(ok, what, detail) {
  if (ok) return;
  console.error(`snapshot check failed: ${what} (${JSON.stringify(detail)})`);
  process.exit(1);
}

// A tiny 16×16 "uploaded" character: a pixel cat face, to show custom images.
const customCat = encodePng(16, 16, (x, y) => {
  const inHead = (x - 7.5) ** 2 / 36 + (y - 9.5) ** 2 / 25 <= 1;
  const inEar = (y >= 2 && y <= 5) && (Math.abs(x - 3) <= (y - 2) / 1.5 || Math.abs(x - 12) <= (y - 2) / 1.5);
  const eye = y === 9 && (x === 5 || x === 10);
  const nose = y === 11 && (x === 7 || x === 8);
  if (eye || nose) return [43, 36, 32, 255];
  if (inHead || inEar) return [250, 176, 90, 255];
  return [0, 0, 0, 0];
});
const catLook = { url: `data:image/png;base64,${customCat.toString('base64')}`, single: true };

// 일정: 오프라인 준호 = 오늘 연차, 민지 = 금~월 출장, 나 = 오전반차(지금) + 다음 주 오후반차 메모 "병원"
const members = [
  {
    code: 'BBQ234', name: '민지', character: 'rabbit', color: 0, online: true,
    status: { kind: 'trip', label: '출장' },
    schedule: [{ from: TODAY, to: '2026-11-02', kind: 'trip' }],
  },
  {
    code: 'ZZT789', name: '준호', character: 'penguin', color: 1, online: false,
    status: { kind: 'leave', label: '연차' },
    schedule: [{ from: TODAY, to: TODAY, kind: 'leave' }, { from: '2026-11-09', to: '2026-11-10', kind: 'leave' }],
  },
  { code: 'PG0001', name: '수아', character: 'penguin', color: 5, online: true },
  { code: 'FX0001', name: '태오', character: 'ghost', color: 6, online: true, status: { kind: 'remote', label: '재택' } },
  { code: 'FR0001', name: '지민', character: 'rabbit', color: 7, online: true },
  {
    code: ME, name: ME_NAME, character: 'ghost', color: 2, online: true,
    status: { kind: 'half-am', label: '오전반차' },
    schedule: [{ from: TODAY, to: TODAY, kind: 'half-am' }, { from: '2026-11-04', to: '2026-11-04', kind: 'half-pm', note: '병원' }],
  },
  { code: 'HR5522', name: '하린', color: 3, online: true, avatar: catLook },
];
const roomState = {
  code: ME,
  name: ME_NAME,
  room: { code: 'PARTY7', members: members.map((m) => ({ ...m, look: m.avatar || null })) },
  serverUrl: 'ws://localhost:8787',
  canEditServer: true,
  look: null,
  color: 2,
  character: 'ghost',
  characters: CHARACTERS,
  connected: true,
  notice: '',
  chat: [
    { mine: false, from: 'BBQ234', name: '민지', message: '오늘 회식 몇 시야?' },
    { mine: true, from: ME, name: ME_NAME, message: '7시래' },
    { mine: false, from: 'HR5522', name: '하린', message: '나 좀 늦을 듯 ㅠ' },
    { mine: false, from: 'FX0001', name: '태오', message: '나도 늦음 ㅋㅋ 먼저 시켜' },
    { mine: true, from: ME, name: ME_NAME, message: '오케 자리 맡아둘게' },
  ],
};
let controlState = roomState;

// 일정 탭: 표는 앱과 같은 schedule-view 로 만든다
const scheduleState = {
  ...roomState,
  room: { ...roomState.room, today: TODAY },
  today: TODAY,
  scheduleLastDay: dateAfter(TODAY, SCHEDULE_WINDOW_DAYS - 1),
  statusKinds: STATUS_KINDS.map((kind) => ({ kind, label: STATUS_LABELS[kind] })),
  schedule: members.find((m) => m.code === ME).schedule,
  scheduleView: buildScheduleView(members, TODAY),
  schedulePending: false,
  scheduleMessage: '저장했어요',
};

// 일정 탭 캡처 전 단언(AC25): 14열·주말 4열·연차 칸·가로 스크롤·창 폭 380 이내
async function checkSchedule(win) {
  const got = await win.webContents.executeJavaScript(`(() => {
    const region = document.getElementById('sched-scroll');
    return {
      dates: document.querySelectorAll('thead th[data-date]').length,
      weekends: document.querySelectorAll('thead .is-weekend').length,
      leave: [...document.querySelectorAll('td [aria-hidden="true"]')].filter((n) => n.textContent === '연차').length,
      scrolls: region.scrollWidth > region.clientWidth,
      pageWidth: document.documentElement.scrollWidth,
    };
  })()`);
  expect(got.dates === 14, 'thead th[data-date] = 14', got);
  expect(got.weekends === 4, 'thead .is-weekend = 4', got);
  expect(got.leave >= 1, "td [aria-hidden=true] '연차' >= 1", got);
  expect(got.scrolls, 'schedule region scrolls sideways', got);
  expect(got.pageWidth <= 380, 'document width <= 380', got);
}

// room strip 캡처 전 단언: 오전반차 둘째 줄, 12자 이름인 내 이름표가 화면 안
async function checkStrip(win) {
  const got = await win.webContents.executeJavaScript(`(() => {
    const am = document.querySelector('.char[data-kind="half-am"] .tag');
    const mine = document.querySelector('.char.is-me .tag');
    return {
      after: am ? getComputedStyle(am, '::after').content : '',
      right: mine ? mine.getBoundingClientRect().right : Infinity,
      width: innerWidth,
    };
  })()`);
  expect(got.after.includes('오전반차'), ".tag::after content includes '오전반차'", got);
  expect(got.right <= got.width, 'my 12-char name tag stays on screen', got);
}

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

async function shootControl(state, name, tab = 'room') {
  controlState = state;
  const win = offscreen(380, 900, 'preload-control.js');
  await win.loadFile(path.join(RENDERER, 'control.html'));
  if (tab !== 'room') await win.webContents.executeJavaScript(`document.getElementById('tab-${tab}').click()`);
  await wait(600);
  if (tab === 'schedule') await checkSchedule(win);
  await save(win, name);
}

app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  ipcMain.handle('overlay:ready', (e) => e.sender.send('room:members', { me: ME, members }));
  ipcMain.handle('control:get-state', () => controlState);
  ['overlay:set-ignore', 'overlay:open-control'].forEach((c) => ipcMain.on(c, () => {}));

  const overlay = offscreen(1200, 420, 'preload-overlay.js');
  await overlay.loadFile(path.join(RENDERER, 'overlay.html'));
  await overlay.webContents.insertCSS('html, body { background: #8fb3c9 !important; }');
  await wait(300);
  overlay.webContents.send('member:says', { from: 'BBQ234', message: '오늘 회식 몇 시야?' });
  overlay.webContents.send('member:says', { from: ME, message: '7시래' });
  await wait(600);
  await checkStrip(overlay);
  await save(overlay, 'room-strip.png');

  // Drag my character (rightmost) to the middle with real mouse events, and move a friend.
  const sentMoves = [];
  ipcMain.removeAllListeners('overlay:move');
  ipcMain.on('overlay:move', (_e, move) => sentMoves.push(move));
  const mouse = (type, x, held) => overlay.webContents.sendInputEvent({
    type, x, y: 370, button: 'left', clickCount: 1, modifiers: held ? ['leftButtonDown'] : [],
  });
  mouse('mouseMove', 1110, false);
  mouse('mouseDown', 1110, true);
  for (let x = 1100; x >= 640; x -= 40) {
    mouse('mouseMove', x, true);
    await wait(60);
  }
  mouse('mouseUp', 640, false);
  overlay.webContents.send('member:moved', { code: 'BBQ234', x: 0.2 });
  await wait(1_800);
  await save(overlay, 'drag.png');
  process.stdout.write(`drag sent ${sentMoves.length} moves, last: ${JSON.stringify(sentMoves.at(-1))}\n`);

  // A new friend joins: they walk in from the left.
  overlay.webContents.send('room:members', { me: ME, members: [...members, { code: 'NEW222', name: '새친구', character: 'ghost', color: 4, online: true }] });
  await wait(1_200);
  await save(overlay, 'room-join.png');

  // Mini-games, with text built the same way the app builds it.
  const names = Object.fromEntries(members.map((m) => [m.code, m.name]));
  const game = (msg) => {
    const full = { players: ['BBQ234', ME, 'HR5522'], by: ME, ...msg };
    overlay.webContents.send('game', { ...full, ...describeGame(full, (c) => names[c] || '누군가'), me: ME });
  };
  game({ id: 1, game: 'lottery', phase: 'result', picked: 'HR5522', bounce: ['BBQ234', ME, 'HR5522', 'BBQ234', ME, 'HR5522'] });
  await wait(3_000);
  await save(overlay, 'game-lottery.png');

  game({ id: 2, game: 'rps', phase: 'pick', deadlineMs: 10_000 });
  await wait(500);
  await save(overlay, 'game-rps-pick.png');
  game({ id: 2, game: 'rps', phase: 'result', choices: { BBQ234: 'rock', [ME]: 'paper', HR5522: 'rock' }, winners: [ME] });
  await wait(500);
  await save(overlay, 'game-rps-result.png');

  game({ id: 3, game: 'reaction', phase: 'ready' });
  game({ id: 3, game: 'reaction', phase: 'go' });
  await wait(500);
  await save(overlay, 'game-reaction-go.png');
  game({ id: 3, game: 'reaction', phase: 'result', ranking: [{ code: 'HR5522', ms: 284 }, { code: ME, ms: 391 }], faults: ['BBQ234'] });
  await wait(500);
  await save(overlay, 'game-reaction-result.png');

  roomState.chat = [...roomState.chat, { system: true, message: '☕ 오늘 커피는 하린!' }];
  await shootControl(roomState, 'control-room.png');
  await shootControl({ ...roomState, room: null, chat: [] }, 'control-lobby.png');
  await shootControl({ ...roomState, hasSpot: true }, 'control-me.png', 'me');
  await shootControl(scheduleState, 'control-schedule.png', 'schedule');

  const page = path.join(__dirname, '..', 'web', 'index.html');
  for (const [w, h, name] of [[1200, 1500, 'web-desktop.png'], [390, 1400, 'web-phone.png']]) {
    const win = offscreen(w, h);
    await win.loadFile(page);
    await wait(5_600);
    await save(win, name);
  }

  process.stdout.write(`snapshots saved to ${outDir}\n`);
  app.quit();
});

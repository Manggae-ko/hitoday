const path = require('node:path');
const { app, ipcMain, clipboard } = require('electron');
const { loadProfile, saveProfile, applyChanges, withRoom } = require('./profile');
const { createTransport } = require('./transport');
const { createOverlayWindow, createControlWindow } = require('./windows');
const { createTray } = require('./tray');
const {
  cleanText, normalizeCode, isCode, MAX_MESSAGE_LENGTH, ROOM_HISTORY, GAMES, RPS_HANDS,
} = require('../../shared/protocol');
const { describeGame } = require('./game-text');

// NOLLEOWA_PROFILE=b lets two copies run side by side on one machine (handy for filming).
const profileName = process.env.NOLLEOWA_PROFILE;
if (profileName && /^[a-z0-9-]{1,16}$/i.test(profileName)) {
  app.setPath('userData', path.join(app.getPath('appData'), `nolleowa-${profileName}`));
}

const ERROR_TEXT = {
  'too-fast': '조금 천천히 보내 주세요.',
  'no-room': '그런 방이 없어요. 초대 코드를 다시 확인해 주세요.',
  'bad-room': '초대 코드는 영문·숫자 6자리예요.',
  'room-full': '방이 꽉 찼어요 (최대 12명).',
  'server-full': '서버가 바빠요. 잠시 후 다시 해 주세요.',
  'empty-message': '할 말을 써 주세요.',
  'game-running': '이미 게임 중이에요. 끝나고 다시 해요.',
  'need-two': '게임은 접속한 사람이 2명 이상일 때 할 수 있어요.',
};
// Late or duplicate moves are harmless; don't bother the user about them.
const QUIET_ERRORS = new Set(['no-game', 'not-player', 'bad-move']);
// The lottery result arrives instantly; the chat waits until the spotlight has landed.
const LOTTERY_REVEAL_MS = 4_500;

const state = { profile: null, connected: false, notice: '', room: null, chat: [], game: null };
let overlay = null;
let control = null;
let transport = null;

function publicState() {
  const { profile, connected, notice, room, chat, game } = state;
  return { ...profile, connected, notice, room, chat, game, canEditServer: !app.isPackaged };
}

function pushState(changes = {}) {
  Object.assign(state, changes);
  if (control && !control.isDestroyed()) control.webContents.send('control:state', publicState());
}

function toOverlay(channel, payload) {
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send(channel, payload);
}

function rememberRoom(roomCode) {
  if (state.profile.room === roomCode) return;
  state.profile = withRoom(state.profile, roomCode);
  saveProfile(app.getPath('userData'), state.profile);
}

const toChatLine = (line) => ({ mine: line.from === state.profile.code, name: line.fromName, message: line.message });

// Who's on screen: everyone in my room, or just me when I'm not in one.
function showMembers() {
  const { code, name } = state.profile;
  const members = state.room ? state.room.members : [{ code, name, online: true }];
  toOverlay('room:members', { me: code, members });
}

function handleServerMessage(msg) {
  if (msg.type === 'room') {
    rememberRoom(msg.room);
    pushState({ room: { code: msg.room, members: msg.members }, chat: msg.history.map(toChatLine) });
    showMembers();
  } else if (msg.type === 'said') {
    toOverlay('member:says', { from: msg.from, message: msg.message });
    pushState({ chat: [...state.chat, toChatLine(msg)].slice(-ROOM_HISTORY), notice: '' });
  } else if (msg.type === 'left-room') {
    rememberRoom('');
    pushState({ room: null, chat: [] });
    showMembers();
  } else if (msg.type === 'game') {
    handleGame(msg);
  } else if (msg.type === 'error' && !QUIET_ERRORS.has(msg.reason)) {
    pushState({ notice: ERROR_TEXT[msg.reason] || `문제가 생겼어요 (${msg.reason})` });
  }
}

function nameOf(code) {
  const member = state.room && state.room.members.find((m) => m.code === code);
  return member ? member.name : '누군가';
}

function handleGame(msg) {
  const text = describeGame(msg, nameOf);
  toOverlay('game', { ...msg, ...text, me: state.profile.code });
  const finished = msg.phase === 'result';
  pushState({ game: finished ? null : { game: msg.game, phase: msg.phase } });
  if (!finished || !text.outcome) return;
  const log = () => pushState({ chat: [...state.chat, { system: true, message: text.outcome }].slice(-ROOM_HISTORY) });
  if (msg.game === 'lottery') setTimeout(log, LOTTERY_REVEAL_MS);
  else log();
}

function openControl() {
  if (!control || control.isDestroyed()) control = createControlWindow();
  control.show();
  control.focus();
}

const sendOrFail = (payload) => (transport.send(payload) ? { ok: true } : { ok: false, error: '서버에 연결되어 있지 않아요.' });

function registerIpc() {
  ipcMain.on('overlay:set-ignore', (_e, ignore) => {
    overlay.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
  });
  ipcMain.handle('overlay:ready', () => showMembers());
  ipcMain.on('overlay:open-control', openControl);

  ipcMain.handle('control:get-state', publicState);
  ipcMain.handle('control:copy-room', () => state.room && clipboard.writeText(state.room.code));
  ipcMain.handle('control:create-room', () => sendOrFail({ type: 'create-room' }));
  ipcMain.handle('control:join-room', (_e, raw) => {
    const room = normalizeCode(raw);
    if (!isCode(room)) return { ok: false, error: ERROR_TEXT['bad-room'] };
    return sendOrFail({ type: 'join-room', room });
  });
  ipcMain.handle('control:leave-room', () => sendOrFail({ type: 'leave-room' }));
  ipcMain.handle('control:start-game', (_e, game) => {
    if (!GAMES.includes(game)) return { ok: false, error: '없는 게임이에요.' };
    if (!state.room) return { ok: false, error: '먼저 방에 들어가 주세요.' };
    return sendOrFail({ type: 'start-game', game });
  });
  ipcMain.on('overlay:game-move', (_e, move) => {
    if (move === 'tap' || RPS_HANDS.includes(move)) transport.send({ type: 'game-move', move });
  });
  ipcMain.handle('control:send', (_e, raw) => {
    const message = cleanText(raw, MAX_MESSAGE_LENGTH);
    if (!state.room) return { ok: false, error: '먼저 방에 들어가 주세요.' };
    if (!message) return { ok: false, error: ERROR_TEXT['empty-message'] };
    return sendOrFail({ type: 'say', message });
  });
  ipcMain.handle('control:save', (_e, changes) => {
    // Packaged builds always use the built-in server.
    const next = { ...(changes || {}), serverUrl: app.isPackaged ? state.profile.serverUrl : (changes || {}).serverUrl };
    const result = applyChanges(state.profile, next);
    if (result.error) return { ok: false, error: result.error };
    state.profile = result.profile;
    saveProfile(app.getPath('userData'), state.profile);
    transport.connect(state.profile.serverUrl); // re-hello so my new name reaches the room
    pushState({ notice: '저장했어요.' });
    showMembers();
    return { ok: true };
  });
}

function helloPayload() {
  const { code, name, room } = state.profile;
  return { code, name, room: room || undefined };
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide();
  // Installed copies start with the computer, so friends always see you around.
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });
  state.profile = loadProfile(app.getPath('userData'));
  registerIpc();
  overlay = createOverlayWindow();
  createTray({ onOpen: openControl, onQuit: () => app.quit() });
  transport = createTransport({
    getHello: helloPayload,
    onMessage: handleServerMessage,
    onStatus: ({ connected }) => pushState({ connected }),
  });
  transport.connect(state.profile.serverUrl);
  if (!state.profile.room) openControl();
});

app.on('before-quit', () => {
  if (control && !control.isDestroyed()) control.forceClose = true;
  if (transport) transport.stop();
});

// Tray app: stay alive when windows are hidden.
app.on('window-all-closed', () => {});

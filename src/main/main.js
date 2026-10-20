const path = require('node:path');
const {
  app, ipcMain, clipboard, globalShortcut, powerMonitor,
} = require('electron');
const {
  loadProfile, saveProfile, applyChanges, withRoom, withCharacter, withSpot, withNewIdentity,
} = require('./profile');
const { createTransport } = require('./transport');
const { createOverlayWindow, createControlWindow } = require('./windows');
const { createTray } = require('./tray');
const { startUpdater } = require('./updater');
const { createPresence } = require('./presence');

// Hides every character and bubble at once (and shows them again).
const HIDE_SHORTCUT = 'CommandOrControl+Shift+.';
const {
  cleanText, normalizeCode, isCode, spotOrNull, MAX_MESSAGE_LENGTH, ROOM_HISTORY, GAMES, RPS_HANDS,
} = require('../../shared/protocol');
const { describeGame } = require('./game-text');
const { checkAvatar } = require('../../shared/avatar');
const { colorFor } = require('../../shared/colors');
const { CHARACTERS, isCharacter } = require('../../shared/characters');
const {
  loadOwnAvatar, saveOwnAvatar, clearOwnAvatar, createAvatarCache, toLook,
} = require('./avatars');

// JAKDANG_PROFILE=b lets two copies run side by side on one machine (handy for filming).
const profileName = process.env.JAKDANG_PROFILE;
if (profileName && /^[a-z0-9-]{1,16}$/i.test(profileName)) {
  app.setPath('userData', path.join(app.getPath('appData'), `jakdang-${profileName}`));
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
  'not-png': 'PNG 파일만 올릴 수 있어요.',
  'bad-size': '32×32 한 장이나 128×128 시트만 올릴 수 있어요.',
  'too-big': '32KB 이하 이미지로 올려 주세요.',
};
// Late or duplicate moves are harmless; don't bother the user about them.
const QUIET_ERRORS = new Set(['no-game', 'not-player', 'bad-move']);
// The lottery result arrives instantly; the chat waits until the spotlight has landed.
const LOTTERY_REVEAL_MS = 4_500;
// The race result too: after the countdown (same as src/renderer/games.js) and the slowest runner.
const RACE_COUNTDOWN_MS = 2_000;

const state = { profile: null, connected: false, notice: '', room: null, chat: [], game: null, ownAvatar: null };
let overlay = null;
let control = null;
let transport = null;
let presence = null;
let hidden = false;
let tray = null;

/** The hide shortcut / tray item: every character and bubble disappears, or comes back. */
function setHidden(value) {
  hidden = value;
  if (overlay && !overlay.isDestroyed()) {
    if (hidden) overlay.hide();
    else overlay.showInactive();
  }
  if (tray) tray.setHidden(hidden);
}
let avatarCache = null;

function myColor() {
  const me = state.room && state.room.members.find((m) => m.code === state.profile.code);
  return colorFor(state.profile.code, me ? me.color : null);
}

/** How a member looks: their uploaded image (mine straight from disk), else the built-in mochi. */
function lookOf(member) {
  if (member.code === state.profile.code) {
    return state.ownAvatar ? toLook(state.ownAvatar.bytes, state.ownAvatar.kind) : null;
  }
  return avatarCache.lookFor(member.code, member.avatar);
}

function publicState() {
  const { profile, connected, notice, room, chat, game } = state;
  const { key, ...visible } = profile; // the device key never leaves the main process
  return {
    ...visible,
    connected,
    notice,
    // Members carry their color and look so the window can draw their thumbnails.
    room: room && {
      ...room,
      members: room.members.map((m) => ({ ...m, color: colorFor(m.code, m.color), look: lookOf(m) })),
    },
    chat,
    game,
    look: lookOf({ code: profile.code }),
    color: myColor(),
    characters: CHARACTERS,
    hasSpot: profile.x !== null,
    canEditServer: !app.isPackaged,
  };
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

const toChatLine = (line) => ({
  mine: line.from === state.profile.code, from: line.from, name: line.fromName, message: line.message,
});

// Who's on screen: everyone in my room, or just me when I'm not in one.
function showMembers() {
  const { code, name, character, x } = state.profile;
  const members = state.room ? state.room.members : [{ code, name, character, x, online: true }];
  const dressed = members.map((m) => ({ ...m, color: colorFor(m.code, m.color), avatar: lookOf(m) }));
  toOverlay('room:members', { me: code, members: dressed });
}

function sendOwnAvatar() {
  const own = state.ownAvatar;
  return transport.send({ type: 'set-avatar', png: own ? own.bytes.toString('base64') : null });
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
  } else if (msg.type === 'moved') {
    if (!state.room) return;
    const members = state.room.members.map((m) => (m.code === msg.code ? { ...m, x: msg.x } : m));
    state.room = { ...state.room, members };
    // My own drag is already on screen; only friends' moves need playing out.
    if (msg.code !== state.profile.code) toOverlay('member:moved', { code: msg.code, x: msg.x });
  } else if (msg.type === 'game') {
    handleGame(msg);
  } else if (msg.type === 'error' && msg.reason === 'bad-key') {
    // Someone else's device already owns this code (e.g. a copied profile): start fresh.
    state.profile = withNewIdentity(state.profile);
    saveProfile(app.getPath('userData'), state.profile);
    pushState({ room: null, chat: [], notice: '다른 기기에서 쓰던 코드라 새 코드를 만들었어요. 방에 다시 들어가 주세요.' });
    transport.connect(state.profile.serverUrl);
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
  else if (msg.game === 'race') setTimeout(log, RACE_COUNTDOWN_MS + Math.max(0, ...msg.race.map((r) => r.legs.at(-1))));
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
  ipcMain.handle('control:set-avatar', (_e, data) => {
    const bytes = data instanceof Uint8Array ? Buffer.from(data) : null;
    const checked = bytes ? checkAvatar(bytes) : { ok: false, error: 'not-png' };
    if (!checked.ok) return { ok: false, error: ERROR_TEXT[checked.error] };
    saveOwnAvatar(app.getPath('userData'), bytes);
    state.ownAvatar = { bytes, ...checked };
    sendOwnAvatar();
    showMembers();
    pushState({ notice: '캐릭터를 바꿨어요.' });
    return { ok: true };
  });
  ipcMain.handle('control:set-character', (_e, character) => {
    if (!isCharacter(character)) return { ok: false, error: '없는 캐릭터예요.' };
    state.profile = withCharacter(state.profile, character);
    saveProfile(app.getPath('userData'), state.profile);
    transport.connect(state.profile.serverUrl); // re-hello so the room sees the new character
    showMembers();
    pushState({ notice: '' });
    return { ok: true };
  });
  ipcMain.handle('control:clear-avatar', () => {
    clearOwnAvatar(app.getPath('userData'));
    state.ownAvatar = null;
    sendOwnAvatar();
    showMembers();
    pushState({ notice: '기본 캐릭터로 돌아왔어요.' });
    return { ok: true };
  });
  ipcMain.handle('control:start-game', (_e, game) => {
    if (!GAMES.includes(game)) return { ok: false, error: '없는 게임이에요.' };
    if (!state.room) return { ok: false, error: '먼저 방에 들어가 주세요.' };
    return sendOrFail({ type: 'start-game', game });
  });
  ipcMain.on('overlay:move', (_e, { x, final } = {}) => {
    const spot = spotOrNull(x);
    if (spot === null) return;
    transport.send({ type: 'move', x: spot });
    if (!final) return;
    state.profile = withSpot(state.profile, spot);
    saveProfile(app.getPath('userData'), state.profile);
  });
  ipcMain.handle('control:reset-spot', () => {
    state.profile = withSpot(state.profile, null);
    saveProfile(app.getPath('userData'), state.profile);
    transport.send({ type: 'move', x: null });
    if (state.room) {
      const members = state.room.members.map((m) => (m.code === state.profile.code ? { ...m, x: null } : m));
      state.room = { ...state.room, members };
    }
    showMembers();
    pushState({ notice: '자리를 원래대로 돌렸어요.' });
    return { ok: true };
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
  const { code, key, name, room, character, x } = state.profile;
  return { code, key, name, room: room || undefined, character, x };
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide();
  // Installed copies start with the computer, so friends always see you around.
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });
  state.profile = loadProfile(app.getPath('userData'));
  state.ownAvatar = loadOwnAvatar(app.getPath('userData'));
  avatarCache = createAvatarCache({
    getServerUrl: () => state.profile.serverUrl,
    onLoaded: () => { showMembers(); pushState(); }, // a friend's image arrived: redraw both windows
  });
  registerIpc();
  overlay = createOverlayWindow();
  const shortcutReady = globalShortcut.register(HIDE_SHORTCUT, () => setHidden(!hidden));
  if (!shortcutReady) console.warn(`hide shortcut ${HIDE_SHORTCUT} is taken by another app; the tray item still works`);
  tray = createTray({
    onOpen: openControl,
    onQuit: () => app.quit(),
    onToggleHidden: () => setHidden(!hidden),
    hideShortcutLabel: shortcutReady ? HIDE_SHORTCUT : null,
  });
  // Installed copies update themselves from GitHub Releases (not while developing).
  // Microsoft Store installs are updated by the Store instead.
  if (app.isPackaged && !process.windowsStore) {
    const { autoUpdater } = require('electron-updater');
    startUpdater({
      autoUpdater,
      log: (line) => console.warn(line),
      onReady: (version) => {
        tray.showUpdate(() => autoUpdater.quitAndInstall());
        pushState({ notice: `새 버전${version ? `(${version})` : ''}을 받았어요. 트레이 메뉴에서 바로 업데이트하거나, 다음에 켤 때 적용돼요.` });
      },
    });
  }
  transport = createTransport({
    getHello: helloPayload,
    onMessage: handleServerMessage,
    onStatus: ({ connected }) => {
      pushState({ connected });
      // The server keeps images in memory only, so re-send mine on every (re)connect.
      if (connected && state.ownAvatar) sendOwnAvatar();
      // It forgets "away" on reconnect too.
      if (connected && presence && presence.isAway()) transport.send({ type: 'presence', away: true });
    },
  });
  // Away = no mouse/keyboard for a while, or the screen locked. Only idle time is read.
  presence = createPresence({
    getIdleSeconds: () => powerMonitor.getSystemIdleTime(),
    onChange: (away) => transport.send({ type: 'presence', away }),
  });
  powerMonitor.on('lock-screen', () => presence.locked(true));
  powerMonitor.on('unlock-screen', () => presence.locked(false));
  transport.connect(state.profile.serverUrl);
  if (!state.profile.room) openControl();
});

app.on('will-quit', () => globalShortcut.unregisterAll());

app.on('before-quit', () => {
  if (control && !control.isDestroyed()) control.forceClose = true;
  if (transport) transport.stop();
});

// Tray app: stay alive when windows are hidden.
app.on('window-all-closed', () => {});

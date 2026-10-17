const path = require('node:path');
const { app, ipcMain, clipboard } = require('electron');
const { loadProfile, saveProfile, applyChanges } = require('./profile');
const { createTransport } = require('./transport');
const { createOverlayWindow, createControlWindow } = require('./windows');
const { createTray } = require('./tray');
const { cleanText, MAX_MESSAGE_LENGTH } = require('../../shared/protocol');
const { IDLE_MS, initialConversation, onSent, onReceived, onIdle } = require('./conversation');

// NOLLEOWA_PROFILE=b lets two copies run side by side on one machine (handy for filming).
const profileName = process.env.NOLLEOWA_PROFILE;
if (profileName && /^[a-z0-9-]{1,16}$/i.test(profileName)) {
  app.setPath('userData', path.join(app.getPath('appData'), `nolleowa-${profileName}`));
}

const CHAT_LOG_LIMIT = 30;
const ERROR_TEXT = {
  'too-fast': '조금 천천히 보내 주세요.',
  'not-friends': '친구도 내 코드를 등록해야 얘기할 수 있어요.',
  'empty-message': '할 말을 써 주세요.',
};

const state = {
  profile: null,
  connected: false,
  notice: '',
  chat: [],
  conv: initialConversation,
  idleTimer: null,
  friendName: '',
};
let overlay = null;
let control = null;
let transport = null;

function publicState() {
  const { profile, connected, notice, chat } = state;
  return { ...profile, connected, notice, chat };
}

function pushState(changes = {}) {
  Object.assign(state, changes);
  if (control && !control.isDestroyed()) control.webContents.send('control:state', publicState());
}

function addChat(entry) {
  pushState({ chat: [...state.chat, { ...entry, at: Date.now() }].slice(-CHAT_LOG_LIMIT), notice: '' });
}

function toOverlay(channel, payload) {
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send(channel, payload);
}

function helloPayload() {
  const { code, name, friendCode } = state.profile;
  return { code, name, friends: friendCode ? [friendCode] : [] };
}

function me() {
  const { code, name } = state.profile;
  return { code, name, friendName: state.friendName || '친구' };
}

// Run the conversation step: keep its new state, play its overlay commands,
// and restart the quiet-spell timer that sends the visitor home.
function step(result) {
  state.conv = result.conv;
  result.commands.forEach(({ channel, payload }) => toOverlay(channel, payload));
  clearTimeout(state.idleTimer);
  if (state.conv.where) {
    state.idleTimer = setTimeout(() => step(onIdle(state.conv, state.profile.friendCode)), IDLE_MS);
  }
}

function handleServerMessage(msg) {
  if (msg.type === 'visit') {
    if (msg.from !== state.profile.friendCode) return; // only my friend may talk to me
    state.friendName = msg.fromName;
    step(onReceived(state.conv, msg, me(), Date.now()));
    addChat({ mine: false, name: msg.fromName, message: msg.message });
  } else if (msg.type === 'visit-sent') {
    step(onSent(state.conv, msg, me(), Date.now()));
    addChat({ mine: true, name: state.profile.name, message: msg.message });
    if (msg.queued) pushState({ notice: '친구가 지금 꺼져 있어요. 켜면 쪽지로 보여요.' });
  } else if (msg.type === 'error') {
    pushState({ notice: ERROR_TEXT[msg.reason] || `문제가 생겼어요 (${msg.reason})` });
  }
}

function openControl() {
  if (!control || control.isDestroyed()) control = createControlWindow();
  control.show();
  control.focus();
}

function registerIpc() {
  ipcMain.on('overlay:set-ignore', (_e, ignore) => {
    overlay.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
  });
  ipcMain.handle('overlay:get-home', () => ({ name: state.profile.name, code: state.profile.code }));
  ipcMain.on('overlay:open-control', openControl);

  ipcMain.handle('control:get-state', publicState);
  ipcMain.handle('control:copy-code', () => clipboard.writeText(state.profile.code));
  ipcMain.handle('control:save', (_e, changes) => {
    const result = applyChanges(state.profile, changes || {});
    if (result.error) return { ok: false, error: result.error };
    const serverChanged = result.profile.serverUrl !== state.profile.serverUrl;
    const oldFriend = state.profile.friendCode;
    if (result.profile.friendCode !== oldFriend) {
      step(onIdle(state.conv, oldFriend)); // a new friend: everyone goes home first
      state.friendName = '';
    }
    state.profile = result.profile;
    saveProfile(app.getPath('userData'), state.profile);
    toOverlay('home:rename', { name: state.profile.name });
    transport.connect(state.profile.serverUrl); // re-hello so the friend list updates
    pushState({ notice: serverChanged ? '새 서버에 연결하는 중…' : '저장했어요.' });
    return { ok: true };
  });
  ipcMain.handle('control:send', (_e, rawMessage) => {
    const message = cleanText(rawMessage, MAX_MESSAGE_LENGTH);
    if (!state.profile.friendCode) return { ok: false, error: '먼저 친구 코드를 등록해 주세요.' };
    if (!message) return { ok: false, error: '할 말을 써 주세요.' };
    const opens = state.conv.where === null;
    if (!transport.send({ type: 'visit', to: state.profile.friendCode, message, opens })) {
      return { ok: false, error: '서버에 연결되어 있지 않아요.' };
    }
    return { ok: true };
  });
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide();
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
  if (!state.profile.friendCode) openControl();
});

app.on('before-quit', () => {
  if (control && !control.isDestroyed()) control.forceClose = true;
  if (transport) transport.stop();
});

// Tray app: stay alive when windows are hidden.
app.on('window-all-closed', () => {});

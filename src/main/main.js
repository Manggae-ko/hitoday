const path = require('node:path');
const { app, ipcMain, clipboard } = require('electron');
const { loadProfile, saveProfile, applyChanges } = require('./profile');
const { createTransport } = require('./transport');
const { createOverlayWindow, createControlWindow } = require('./windows');
const { createTray } = require('./tray');
const { cleanText, isCode, MAX_MESSAGE_LENGTH } = require('../../shared/protocol');

// NOLLEOWA_PROFILE=b lets two copies run side by side on one machine (handy for filming).
const profileName = process.env.NOLLEOWA_PROFILE;
if (profileName && /^[a-z0-9-]{1,16}$/i.test(profileName)) {
  app.setPath('userData', path.join(app.getPath('appData'), `nolleowa-${profileName}`));
}

const ERROR_TEXT = {
  'too-fast': '조금 있다가 다시 놀러 가요.',
  'not-friends': '친구도 내 코드를 등록해야 놀러 갈 수 있어요.',
  'empty-message': '쪽지를 써 주세요.',
};

const state = { profile: null, connected: false, away: false, notice: '' };
let overlay = null;
let control = null;
let transport = null;

function publicState() {
  const { profile, connected, away, notice } = state;
  return { ...profile, connected, away, notice };
}

function pushState(changes = {}) {
  Object.assign(state, changes);
  if (control && !control.isDestroyed()) control.webContents.send('control:state', publicState());
}

function toOverlay(channel, payload) {
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send(channel, payload);
}

function helloPayload() {
  const { code, name, friendCode } = state.profile;
  return { code, name, friends: friendCode ? [friendCode] : [] };
}

function handleServerMessage(msg) {
  if (msg.type === 'visit') {
    if (msg.from !== state.profile.friendCode) return; // only my friend may visit
    toOverlay('guest:arrive', msg);
  } else if (msg.type === 'visit-sent') {
    toOverlay('home:leave', { queued: msg.queued });
    pushState({
      away: true,
      notice: msg.queued ? '친구가 지금 없어요. 쪽지만 두고 올게요.' : '놀러 갔어요!',
    });
  } else if (msg.type === 'returned') {
    if (msg.from === state.profile.friendCode) toOverlay('home:return', { greeted: true });
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
  ipcMain.handle('overlay:get-home', () => ({ name: state.profile.name }));
  ipcMain.on('overlay:open-control', openControl);
  ipcMain.on('overlay:guest-done', (_e, from) => {
    if (isCode(from)) transport.send({ type: 'returned', to: from });
  });
  ipcMain.on('overlay:home-back', () => pushState({ away: false }));

  ipcMain.handle('control:get-state', publicState);
  ipcMain.handle('control:copy-code', () => clipboard.writeText(state.profile.code));
  ipcMain.handle('control:save', (_e, changes) => {
    const result = applyChanges(state.profile, changes || {});
    if (result.error) return { ok: false, error: result.error };
    const serverChanged = result.profile.serverUrl !== state.profile.serverUrl;
    state.profile = result.profile;
    saveProfile(app.getPath('userData'), state.profile);
    toOverlay('home:rename', { name: state.profile.name });
    transport.connect(state.profile.serverUrl); // re-hello so the friend list updates
    pushState({ notice: serverChanged ? '새 서버에 연결하는 중…' : '저장했어요.' });
    return { ok: true };
  });
  ipcMain.handle('control:visit', (_e, rawMessage) => {
    const message = cleanText(rawMessage, MAX_MESSAGE_LENGTH);
    if (!state.profile.friendCode) return { ok: false, error: '먼저 친구 코드를 등록해 주세요.' };
    if (!message) return { ok: false, error: '쪽지를 써 주세요.' };
    if (state.away) return { ok: false, error: '아직 놀러 가 있어요. 돌아오면 다시 가요.' };
    if (!transport.send({ type: 'visit', to: state.profile.friendCode, message })) {
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

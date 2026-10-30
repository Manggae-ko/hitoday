// Settings window: two tabs (방 / 내 캐릭터). Everything shown comes from the main
// process state; user text always goes in through textContent.

const api = window.hitoday;
const $ = (id) => document.getElementById(id);

const MAX_AVATAR_BYTES = 32 * 1024;
const MAX_MESSAGE = 80;

const el = {
  status: $('status'),
  tabRoom: $('tab-room'),
  tabMe: $('tab-me'),
  panelRoom: $('panel-room'),
  panelMe: $('panel-me'),
  lobby: $('lobby'),
  room: $('room'),
  create: $('create'),
  joinForm: $('join-form'),
  invite: $('invite'),
  roomCode: $('room-code'),
  copy: $('copy'),
  members: $('members'),
  gameButtons: [...document.querySelectorAll('.arcade')],
  log: $('chat-log'),
  sendForm: $('send-form'),
  message: $('message'),
  go: $('go'),
  counter: $('counter'),
  leave: $('leave'),
  preview: $('preview'),
  previewImg: $('preview-img'),
  settingsForm: $('settings-form'),
  name: $('name'),
  picker: $('picker'),
  avatarFile: $('avatar-file'),
  avatarReset: $('avatar-reset'),
  spotReset: $('spot-reset'),
  serverBox: $('server-box'),
  server: $('server'),
  serverSave: $('server-save'),
  notice: $('notice'),
};

let latest = null;
let formFilled = false;
let shownChat = '';
let shownMembers = '';
let shownPicker = '';

// --- small builders -------------------------------------------------------------

function node(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

const sheetFor = (character, color) => `sprites/${character || 'ghost'}-${color || 0}.png`;

/** A sprite thumbnail: the member's uploaded image, or their built-in character sheet. */
function sprite({ look, character, color }, className = '') {
  const wrap = node('span', `sprite ${className}`.trim());
  const img = node('img');
  img.alt = '';
  img.src = look ? look.url : sheetFor(character, color);
  if (look && look.single) wrap.classList.add('is-single');
  wrap.append(img);
  return wrap;
}

function showNotice(text, tone = 'info') {
  el.notice.textContent = text || '';
  el.notice.dataset.tone = tone;
}

async function run(action) {
  const result = await action();
  if (result && result.ok === false) showNotice(result.error, 'warn');
  return result;
}

// --- tabs --------------------------------------------------------------------

function selectTab(which) {
  const room = which === 'room';
  el.tabRoom.setAttribute('aria-selected', String(room));
  el.tabMe.setAttribute('aria-selected', String(!room));
  el.panelRoom.hidden = !room;
  el.panelMe.hidden = room;
}
el.tabRoom.addEventListener('click', () => selectTab('room'));
el.tabMe.addEventListener('click', () => selectTab('me'));
[el.tabRoom, el.tabMe].forEach((tab) => tab.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  const next = tab === el.tabRoom ? el.tabMe : el.tabRoom;
  next.focus();
  next.click();
}));

// --- room ----------------------------------------------------------------------

function renderMembers(members, myCode) {
  const key = JSON.stringify(members.map((m) => [m.code, m.name, m.online, m.away, m.character, m.color, m.look && m.look.url.length]));
  if (key === shownMembers) return;
  shownMembers = key;
  el.members.replaceChildren(...members.map((m) => {
    const classes = ['member', m.online ? 'is-online' : '', m.away ? 'is-away' : '', m.code === myCode ? 'is-me' : ''];
    const li = node('li', classes.join(' ').trim());
    li.title = m.away ? '자리비움' : m.online ? '접속 중' : '앱 꺼짐';
    li.append(sprite(m), node('span', '', m.code === myCode ? `${m.name} (나)` : m.name), node('span', 'dot'));
    return li;
  }));
}

function renderChat(chat, membersByCode) {
  const key = JSON.stringify(chat) + Object.keys(membersByCode).length;
  if (key === shownChat) return;
  shownChat = key;
  if (chat.length === 0) {
    el.log.replaceChildren(node('li', 'chat-empty', '아직 조용해요. 먼저 말 걸어 보세요!'));
    return;
  }
  el.log.replaceChildren(...chat.map((line) => {
    if (line.system) return node('li', 'chat-system', line.message);
    const li = node('li', line.mine ? 'chat-line mine' : 'chat-line');
    const body = node('div', 'body');
    body.append(node('span', 'who', line.name), node('span', 'text', line.message));
    if (!line.mine) li.append(sprite(membersByCode[line.from] || { character: 'ghost', color: 0 }));
    li.append(body);
    return li;
  }));
  el.log.scrollTop = el.log.scrollHeight;
}

function renderRoom(state) {
  const inRoom = Boolean(state.room);
  el.lobby.hidden = inRoom;
  el.room.hidden = !inRoom;
  el.create.disabled = !state.connected;
  if (!inRoom) return;
  const { members } = state.room;
  el.roomCode.textContent = state.room.code;
  renderMembers(members, state.code);
  renderChat(state.chat || [], Object.fromEntries(members.map((m) => [m.code, m])));
  const onlineCount = members.filter((m) => m.online).length;
  const canPlay = state.connected && !state.game && onlineCount >= 2;
  el.gameButtons.forEach((button) => {
    button.disabled = !canPlay;
    button.title = onlineCount < 2 ? '접속한 사람이 2명 이상이어야 해요' : '';
  });
  el.go.disabled = !state.connected;
}

// --- my character ------------------------------------------------------------

function renderPicker({ characters = [], character, color, look }) {
  const key = `${character}|${color}|${Boolean(look)}|${characters.length}`;
  if (key === shownPicker) return;
  shownPicker = key;
  el.picker.classList.toggle('is-overridden', Boolean(look));
  el.picker.replaceChildren(...characters.map(({ id, name }) => {
    const button = node('button', 'pick');
    button.type = 'button';
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(id === character));
    button.setAttribute('aria-label', name);
    button.append(sprite({ character: id, color }), node('span', 'pick-name', name));
    button.addEventListener('click', () => run(() => api.setCharacter(id)));
    return button;
  }));
}

function renderMe(state) {
  const src = state.look ? state.look.url : sheetFor(state.character, state.color);
  if (el.previewImg.getAttribute('src') !== src) el.previewImg.src = src;
  el.preview.classList.toggle('is-single', Boolean(state.look && state.look.single));
  el.avatarReset.hidden = !state.look;
  el.spotReset.hidden = !state.hasSpot;
  renderPicker(state);
}

// --- render -------------------------------------------------------------------

function render(state) {
  latest = state;
  el.status.textContent = state.connected ? '연결됨' : '연결 중';
  el.status.dataset.connected = String(state.connected);
  renderRoom(state);
  renderMe(state);
  if (!formFilled) {
    el.name.value = state.name;
    el.server.value = state.serverUrl;
    el.serverBox.hidden = !state.canEditServer;
    formFilled = true;
  }
  showNotice(state.notice);
}

// --- actions ------------------------------------------------------------------

el.create.addEventListener('click', () => run(api.createRoom));

el.invite.addEventListener('input', () => {
  el.invite.value = el.invite.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});
el.joinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  run(() => api.joinRoom(el.invite.value));
});

el.copy.addEventListener('click', async () => {
  await api.copyRoom();
  el.copy.textContent = '복사됨!';
  setTimeout(() => {
    el.copy.textContent = '복사';
  }, 1200);
});

const updateCounter = () => {
  el.counter.textContent = `${Array.from(el.message.value).length} / ${MAX_MESSAGE}`;
};
el.message.addEventListener('input', updateCounter);

el.sendForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = await run(() => api.send(el.message.value));
  if (!result.ok) return;
  el.message.value = '';
  updateCounter();
  el.message.focus();
});

el.leave.addEventListener('click', () => run(api.leaveRoom));

el.gameButtons.forEach((button) => {
  button.addEventListener('click', () => run(() => api.startGame(button.dataset.game)));
});

el.settingsForm.addEventListener('submit', (event) => {
  event.preventDefault();
  run(() => api.save({ name: el.name.value, serverUrl: latest ? latest.serverUrl : el.server.value }));
});
el.serverSave.addEventListener('click', () => run(() => api.save({ name: el.name.value, serverUrl: el.server.value })));

el.avatarFile.addEventListener('change', async () => {
  const file = el.avatarFile.files[0];
  el.avatarFile.value = '';
  if (!file) return;
  if (file.size > MAX_AVATAR_BYTES) {
    showNotice('32KB 이하 이미지로 올려 주세요.', 'warn');
    return;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  run(() => api.setAvatar(bytes)); // the main process checks size and format again
});
el.avatarReset.addEventListener('click', () => run(api.clearAvatar));
el.spotReset.addEventListener('click', () => run(api.resetSpot));

api.onState(render);
api.getState().then((state) => {
  render(state);
  (state.room ? el.message : el.create).focus();
});

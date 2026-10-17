const api = window.nolleowa;
const $ = (id) => document.getElementById(id);

const el = {
  status: $('status'),
  lobby: $('lobby'),
  room: $('room'),
  create: $('create'),
  joinForm: $('join-form'),
  invite: $('invite'),
  roomCode: $('room-code'),
  copy: $('copy'),
  members: $('members'),
  log: $('chat-log'),
  sendForm: $('send-form'),
  message: $('message'),
  go: $('go'),
  counter: $('counter'),
  leave: $('leave'),
  settingsForm: $('settings-form'),
  name: $('name'),
  serverBox: $('server-box'),
  server: $('server'),
  notice: $('notice'),
  gameButtons: [...document.querySelectorAll('.game-btn')],
};

let formFilled = false;
let shownChat = '';

function showNotice(text, tone = 'info') {
  el.notice.textContent = text || '';
  el.notice.dataset.tone = tone;
}

function textItem(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function renderMembers(members, myCode) {
  el.members.replaceChildren(...members.map((m) => {
    const li = textItem('li', m.online ? 'member is-online' : 'member', m.code === myCode ? `${m.name} (나)` : m.name);
    li.title = m.online ? '접속 중' : '앱 꺼짐';
    return li;
  }));
}

function renderChat(chat) {
  const key = JSON.stringify(chat);
  if (key === shownChat) return;
  shownChat = key;
  if (chat.length === 0) {
    el.log.replaceChildren(textItem('li', 'chat-empty', '아직 조용해요. 먼저 말 걸어 보세요!'));
    return;
  }
  el.log.replaceChildren(...chat.map(({ mine, name, message, system }) => {
    if (system) return textItem('li', 'chat-system', message);
    const li = document.createElement('li');
    li.className = mine ? 'chat-line mine' : 'chat-line';
    li.append(textItem('span', 'who', name), textItem('span', 'text', message));
    return li;
  }));
  el.log.scrollTop = el.log.scrollHeight;
}

function render(state) {
  el.status.textContent = state.connected ? '연결됨' : '연결 끊김 · 다시 시도 중';
  el.status.dataset.connected = String(state.connected);
  const inRoom = Boolean(state.room);
  el.lobby.hidden = inRoom;
  el.room.hidden = !inRoom;
  el.create.disabled = !state.connected;
  el.go.disabled = !state.connected;
  if (inRoom) {
    el.roomCode.textContent = state.room.code;
    renderMembers(state.room.members, state.code);
    renderChat(state.chat || []);
    const onlineCount = state.room.members.filter((m) => m.online).length;
    const canPlay = state.connected && !state.game && onlineCount >= 2;
    el.gameButtons.forEach((button) => {
      button.disabled = !canPlay;
      button.title = onlineCount < 2 ? '접속한 사람이 2명 이상이어야 해요' : '';
    });
  }
  if (!formFilled) {
    el.name.value = state.name;
    el.server.value = state.serverUrl;
    el.serverBox.hidden = !state.canEditServer;
    formFilled = true;
  }
  showNotice(state.notice);
}

async function run(action) {
  const result = await action();
  if (result && result.ok === false) showNotice(result.error, 'warn');
  return result;
}

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
  el.copy.textContent = '복사됨';
  setTimeout(() => {
    el.copy.textContent = '복사';
  }, 1200);
});

const updateCounter = () => {
  el.counter.textContent = `${Array.from(el.message.value).length} / 80 · Enter로 보내기`;
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
  run(() => api.save({ name: el.name.value, serverUrl: el.server.value }));
});

api.onState(render);
api.getState().then((state) => {
  render(state);
  (state.room ? el.message : el.create).focus();
});

const api = window.nolleowa;
const $ = (id) => document.getElementById(id);

const el = {
  status: $('status'),
  code: $('my-code'),
  copy: $('copy'),
  log: $('chat-log'),
  message: $('message'),
  counter: $('counter'),
  go: $('go'),
  name: $('name'),
  friend: $('friend'),
  server: $('server'),
  notice: $('notice'),
  sendForm: $('send-form'),
  settingsForm: $('settings-form'),
};

let formFilled = false;
let shownChatLength = -1;

function showNotice(text, tone = 'info') {
  el.notice.textContent = text || '';
  el.notice.dataset.tone = tone;
}

function chatItem({ mine, name, message }) {
  const li = document.createElement('li');
  li.className = mine ? 'chat-line mine' : 'chat-line';
  const who = document.createElement('span');
  who.className = 'who';
  who.textContent = name;
  const text = document.createElement('span');
  text.className = 'text';
  text.textContent = message;
  li.append(who, text);
  return li;
}

function renderChat(chat) {
  if (chat.length === shownChatLength) return;
  shownChatLength = chat.length;
  if (chat.length === 0) return;
  el.log.replaceChildren(...chat.map(chatItem));
  el.log.scrollTop = el.log.scrollHeight;
}

function render(state) {
  el.code.textContent = state.code;
  el.status.textContent = state.connected ? '연결됨' : '연결 끊김 · 다시 시도 중';
  el.status.dataset.connected = String(state.connected);
  el.go.disabled = !state.connected || !state.friendCode;
  if (!formFilled) {
    el.name.value = state.name;
    el.friend.value = state.friendCode;
    el.server.value = state.serverUrl;
    formFilled = true;
  }
  renderChat(state.chat || []);
  showNotice(state.notice);
}

el.copy.addEventListener('click', async () => {
  await api.copyCode();
  el.copy.textContent = '복사됨';
  setTimeout(() => {
    el.copy.textContent = '복사';
  }, 1200);
});

const updateCounter = () => {
  el.counter.textContent = `${Array.from(el.message.value).length} / 80 · Enter로 보내기`;
};
el.message.addEventListener('input', updateCounter);

el.friend.addEventListener('input', () => {
  el.friend.value = el.friend.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

el.sendForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = await api.send(el.message.value);
  if (!result.ok) return showNotice(result.error, 'warn');
  el.message.value = '';
  updateCounter();
  el.message.focus();
  return undefined;
});

el.settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = await api.save({
    name: el.name.value,
    friendCode: el.friend.value,
    serverUrl: el.server.value,
  });
  if (!result.ok) showNotice(result.error, 'warn');
});

api.onState(render);
api.getState().then((state) => {
  render(state);
  if (state.friendCode) el.message.focus();
});

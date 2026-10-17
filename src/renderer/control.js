const api = window.nolleowa;
const $ = (id) => document.getElementById(id);

const el = {
  status: $('status'),
  code: $('my-code'),
  copy: $('copy'),
  message: $('message'),
  counter: $('counter'),
  go: $('go'),
  name: $('name'),
  friend: $('friend'),
  server: $('server'),
  notice: $('notice'),
  visitForm: $('visit-form'),
  settingsForm: $('settings-form'),
};

let formFilled = false;

function showNotice(text, tone = 'info') {
  el.notice.textContent = text || '';
  el.notice.dataset.tone = tone;
}

function render(state) {
  el.code.textContent = state.code;
  el.status.textContent = state.connected ? '연결됨' : '연결 끊김 · 다시 시도 중';
  el.status.dataset.connected = String(state.connected);
  el.go.disabled = !state.connected || !state.friendCode || state.away;
  el.go.textContent = state.away ? '놀러 가 있는 중…' : '놀러 가기 →';
  if (!formFilled) {
    el.name.value = state.name;
    el.friend.value = state.friendCode;
    el.server.value = state.serverUrl;
    formFilled = true;
  }
  if (state.notice) showNotice(state.notice);
}

el.copy.addEventListener('click', async () => {
  await api.copyCode();
  el.copy.textContent = '복사됨';
  setTimeout(() => {
    el.copy.textContent = '복사';
  }, 1200);
});

el.message.addEventListener('input', () => {
  el.counter.textContent = `${Array.from(el.message.value).length} / 80`;
});

el.friend.addEventListener('input', () => {
  el.friend.value = el.friend.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

el.visitForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = await api.visit(el.message.value);
  if (!result.ok) return showNotice(result.error, 'warn');
  el.message.value = '';
  el.counter.textContent = '0 / 80';
  return undefined;
});

el.message.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    el.visitForm.requestSubmit();
  }
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
api.getState().then(render);

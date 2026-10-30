// Settings window: three tabs (방 / 내 캐릭터 / 일정). Everything shown comes from the main
// process state; user text always goes in through textContent.

const api = window.hitoday;
const $ = (id) => document.getElementById(id);

const MAX_AVATAR_BYTES = 32 * 1024;
const MAX_MESSAGE = 80;
const MAX_SCHEDULE = 30; // shared/protocol.js MAX_SCHEDULE_ENTRIES 와 같음
// setSchedule 이 거절됐을 때 #schedule-msg 문구
const SCHEDULE_REFUSED = {
  pending: '저장 중이에요. 잠시만 기다려 주세요.',
  'bad-schedule': '날짜와 메모를 확인해 주세요.',
  offline: '서버에 연결되어 있지 않아요.',
  unknown: '방에 들어가면 일정을 편집할 수 있어요',
};
// main 의 저장 확정 문구(schedule-saved 반영)와 같아야 함
const SCHEDULE_SAVED = '저장했어요';

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
  schedForm: $('schedule-form'),
  schedFrom: $('sched-from'),
  schedTo: $('sched-to'),
  schedKind: $('sched-kind'),
  schedNote: $('sched-note'),
  schedAdd: $('sched-add'),
  schedFull: $('sched-full'),
  schedList: $('sched-list'),
  schedMsg: $('schedule-msg'),
  schedOutside: $('sched-outside'),
  schedScroll: $('sched-scroll'),
  schedHead: $('sched-head'),
  schedBody: $('sched-body'),
};

let latest = null;
let formFilled = false;
let shownChat = '';
let shownMembers = '';
let shownPicker = '';
let shownSchedule = '';
let shownKinds = '';
let focusAfterDelete = null; // 삭제 후 포커스를 옮길 목록 위치
// 추가 제출 때의 입력값: 저장 확정 후 입력이 그대로면 폼을 비움. seenPending = main 이 대기에 들어간 걸 봤는지
let submitted = null;

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

const TABS = ['room', 'me', 'schedule'].map((tab) => ({ tab, button: $(`tab-${tab}`), panel: $(`panel-${tab}`) }));

// 선택된 탭만 tabindex=0 (roving tabindex)
function selectTab(which) {
  TABS.forEach(({ tab, button, panel }) => {
    const selected = tab === which;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    panel.hidden = !selected;
  });
}
TABS.forEach(({ tab, button }, index) => {
  button.addEventListener('click', () => selectTab(tab));
  button.addEventListener('keydown', (event) => {
    const last = TABS.length - 1;
    const next = {
      ArrowLeft: index === 0 ? last : index - 1, ArrowRight: index === last ? 0 : index + 1, Home: 0, End: last,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    TABS[next].button.focus();
    TABS[next].button.click();
  });
});

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

// --- schedule -------------------------------------------------------------------
// 날짜·칸 계산은 main(schedule-view.js)이 한다. 여기서는 받은 그대로 그리기만.

const shortDate = (date) => date.slice(5).replace('-', '/');

function entryText(entry, kinds) {
  const found = kinds.find((k) => k.kind === entry.kind);
  const range = entry.from === entry.to ? shortDate(entry.from) : `${shortDate(entry.from)}~${shortDate(entry.to)}`;
  const label = found ? found.label : entry.kind;
  return `${range} ${label}${entry.note ? ` · ${entry.note}` : ''}`;
}

function fillKinds(kinds) {
  const key = JSON.stringify(kinds);
  if (key === shownKinds) return;
  shownKinds = key;
  const current = el.schedKind.value;
  el.schedKind.replaceChildren(...kinds.map(({ kind, label }) => {
    const option = node('option', '', label);
    option.value = kind;
    return option;
  }));
  if (kinds.some((k) => k.kind === current)) el.schedKind.value = current;
  el.schedNote.required = el.schedKind.value === 'note';
}

function renderScheduleList(schedule, kinds, locked) {
  if (schedule.length === 0) {
    el.schedList.replaceChildren(node('li', 'sched-empty', '아직 일정이 없어요.'));
    return;
  }
  el.schedList.replaceChildren(...schedule.map((entry, index) => {
    const text = entryText(entry, kinds);
    const li = node('li', 'sched-item');
    const remove = node('button', 'btn btn-small', '삭제');
    remove.type = 'button';
    remove.disabled = locked;
    remove.setAttribute('aria-label', `${text} 삭제`);
    remove.addEventListener('click', () => removeEntry(index));
    li.append(node('span', 'what', text), remove);
    return li;
  }));
}

function renderScheduleTable(view, members) {
  el.schedOutside.hidden = Boolean(view);
  el.schedScroll.hidden = !view;
  if (!view) return;
  const corner = node('td', 'corner'); // 모서리 칸: scope 없는 td
  el.schedHead.replaceChildren(corner, ...view.days.map((day) => {
    const th = node('th', day.weekend ? 'is-weekend' : '');
    th.scope = 'col';
    th.dataset.date = day.date;
    if (day.isToday) th.setAttribute('aria-current', 'date');
    const num = node('span', 'day-num', day.label.split('/')[1]);
    const dow = node('span', 'day-dow', day.dow);
    num.setAttribute('aria-hidden', 'true');
    dow.setAttribute('aria-hidden', 'true');
    th.append(num, dow, node('span', 'sr-only', `${day.label} ${day.dow}요일${day.isToday ? ' 오늘' : ''}`));
    return th;
  }));
  const byCode = Object.fromEntries(members.map((m) => [m.code, m]));
  el.schedBody.replaceChildren(...view.rows.map((row) => {
    const tr = node('tr');
    const th = node('th');
    th.scope = 'row';
    const who = node('span', 'who');
    if (byCode[row.code]) who.append(sprite(byCode[row.code]));
    const name = node('span', 'name', row.name);
    name.title = row.name;
    who.append(name);
    th.append(who);
    tr.append(th, ...row.cells.map((cell, i) => {
      const { weekend, isToday } = view.days[i];
      const td = node('td', [weekend ? 'is-weekend-cell' : '', isToday ? 'is-today' : ''].join(' ').trim());
      if (!cell) return td;
      td.dataset.kind = cell.kind;
      td.title = cell.full;
      const mark = node('span', 'mark', cell.short);
      mark.setAttribute('aria-hidden', 'true');
      td.append(mark, node('span', 'sr-only', cell.full));
      return td;
    }));
    return tr;
  }));
}

const formValues = () => [el.schedFrom.value, el.schedTo.value, el.schedKind.value, el.schedNote.value];

// 저장이 확정(대기 해제 + '저장했어요')되고 입력이 제출 때 그대로일 때만 폼을 비움
function settleSubmitted(state) {
  if (!submitted) return;
  if (state.schedulePending) {
    submitted.seenPending = true;
    return;
  }
  if (!submitted.seenPending) return;
  const same = JSON.stringify(formValues()) === JSON.stringify(submitted.values);
  if (same && state.scheduleMessage === SCHEDULE_SAVED) {
    el.schedTo.value = '';
    el.schedNote.value = '';
  }
  submitted = null;
}

// 표 썸네일이 바뀌는 멤버 필드(캐릭터·색·업로드 그림)
const memberLooks = (room) => (room ? room.members.map((m) => [m.code, m.character, m.color, m.look ? m.look.url.length : 0]) : []);

function renderSchedule(state) {
  settleSubmitted(state);
  const key = JSON.stringify([
    state.schedule, state.scheduleView, state.schedulePending, state.scheduleMessage, state.today,
    state.scheduleLastDay, state.scheduleKnown, memberLooks(state.room),
  ]);
  if (key === shownSchedule) return;
  shownSchedule = key;
  const schedule = state.schedule || [];
  const kinds = state.statusKinds || [];
  const pending = Boolean(state.schedulePending);
  const locked = pending || !state.scheduleKnown; // 서버의 내 일정을 모르면 전량 교체 금지
  fillKinds(kinds);
  // 입력값은 덮어쓰지 않고 범위만 갱신
  el.schedFrom.min = state.today || '';
  el.schedFrom.max = state.scheduleLastDay || '';
  if (!el.schedFrom.value) el.schedFrom.value = state.today || '';
  el.schedTo.min = el.schedFrom.value || state.today || '';
  el.schedTo.max = state.scheduleLastDay || '';
  const full = schedule.length >= MAX_SCHEDULE;
  el.schedAdd.disabled = locked || full;
  el.schedFull.hidden = !full;
  const message = state.scheduleKnown ? state.scheduleMessage : SCHEDULE_REFUSED.unknown;
  el.schedMsg.textContent = pending ? '저장 중…' : message || '';
  renderScheduleList(schedule, kinds, locked);
  renderScheduleTable(state.scheduleView, state.room ? state.room.members : []);
  if (focusAfterDelete !== null && !pending) {
    const next = el.schedList.children[focusAfterDelete];
    const button = next && next.querySelector('button');
    (button || el.schedAdd).focus();
    focusAfterDelete = null;
  }
}

// 일정은 전량 교체로 저장. 거절 사유는 #schedule-msg 에만 표시(#notice 미사용)
async function saveSchedule(entries) {
  const result = await api.setSchedule(entries);
  if (!result.ok) el.schedMsg.textContent = SCHEDULE_REFUSED[result.reason] || SCHEDULE_REFUSED['bad-schedule'];
  return result;
}

function removeEntry(index) {
  if (!latest) return;
  focusAfterDelete = index;
  saveSchedule(latest.schedule.filter((_, i) => i !== index)).then((result) => {
    if (!result.ok) focusAfterDelete = null;
  });
}

// --- render -------------------------------------------------------------------

function render(state) {
  latest = state;
  el.status.textContent = state.connected ? '연결됨' : '연결 중';
  el.status.dataset.connected = String(state.connected);
  renderRoom(state);
  renderMe(state);
  renderSchedule(state);
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
el.schedFrom.addEventListener('input', () => {
  el.schedTo.min = el.schedFrom.value || (latest ? latest.today : '');
});
el.schedKind.addEventListener('change', () => {
  el.schedNote.required = el.schedKind.value === 'note'; // 메모 종류는 메모가 꼭 있어야 함
});
el.schedForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!latest) return;
  const from = el.schedFrom.value;
  const note = el.schedNote.value.trim();
  const entry = { from, to: el.schedTo.value || from, kind: el.schedKind.value, ...(note ? { note } : {}) };
  // IPC 응답보다 대기 상태가 먼저 올 수 있어 보내기 전에 보관
  submitted = { values: formValues(), seenPending: false };
  const result = await saveSchedule([...latest.schedule, entry]);
  if (!result.ok) submitted = null;
});

el.avatarReset.addEventListener('click', () => run(api.clearAvatar));
el.spotReset.addEventListener('click', () => run(api.resetSpot));

api.onState(render);
api.getState().then((state) => {
  render(state);
  (state.room ? el.message : el.create).focus();
});

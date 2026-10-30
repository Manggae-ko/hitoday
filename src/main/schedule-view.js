// 방 일정표 계산: 오늘부터 14일 × 멤버. renderer 는 이 결과를 그리기만 한다.
// electron 을 require 하지 않는 순수 모듈(app.test·snapshot 공용).

const { STATUS_LABELS, STATUS_PRIORITY } = require('../../shared/protocol');

const VIEW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
// 표 칸에 들어가는 짧은 글자(메모는 앞 2자)
const SHORT = {
  leave: '연차', 'half-am': '오전', 'half-pm': '오후', out: '외근', remote: '재택', trip: '출장', lunch: '따점',
};

// 'YYYY-MM-DD' 에서 n일 뒤의 날짜 정보 (Date.UTC 기반이라 시간대와 무관)
function dayAfter(today, n) {
  const [year, month, day] = today.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day) + n * DAY_MS);
  const weekday = date.getUTCDay();
  return {
    date: date.toISOString().slice(0, 10),
    label: `${date.getUTCMonth() + 1}/${date.getUTCDate()}`,
    dow: DOW[weekday],
    weekend: weekday === 0 || weekday === 6,
    isToday: n === 0,
  };
}

// 그 날짜를 포함하는 항목 중 STATUS_PRIORITY 최우선(동순위는 정렬된 배열의 앞 항목)
function cellFor(schedule, date) {
  const covering = schedule.filter((entry) => entry.from <= date && date <= entry.to);
  if (covering.length === 0) return null;
  const [entry] = covering.sort((a, b) => STATUS_PRIORITY.indexOf(a.kind) - STATUS_PRIORITY.indexOf(b.kind));
  const short = entry.kind === 'note' ? Array.from(entry.note || '').slice(0, 2).join('') : SHORT[entry.kind];
  const full = `${STATUS_LABELS[entry.kind]}${entry.note ? ` · ${entry.note}` : ''}`;
  return { kind: entry.kind, short, full };
}

/** members: 파싱된 방 멤버(schedule 포함), today: 'YYYY-MM-DD' → { days ×14, rows } */
function buildScheduleView(members, today) {
  const days = Array.from({ length: VIEW_DAYS }, (_, n) => dayAfter(today, n));
  const rows = (members || []).map((member) => {
    const schedule = Array.isArray(member.schedule) ? member.schedule : [];
    return { code: member.code, name: member.name, cells: days.map((day) => cellFor(schedule, day.date)) };
  });
  return { days, rows };
}

module.exports = { buildScheduleView, VIEW_DAYS };

// The operator's stats page: server-rendered HTML, no scripts. Only numbers and dates go in.

const LABELS = {
  page_view: '다운로드 페이지 방문',
  download_mac: '맥 다운로드',
  download_win: '윈도우 다운로드',
  new_device: '새 설치(처음 접속)',
  connect: '앱 접속',
  room_created: '새 방',
  message: '메시지',
  game_lottery: '커피 뽑기',
  game_rps: '가위바위보',
  game_reaction: '반응속도',
  game_race: '달리기 경주',
  peak_online: '최대 동시 접속',
};

const num = (n) => Number(n || 0).toLocaleString('ko-KR');

function tile(label, value, hint = '') {
  return `<div class="tile"><span class="tile-label">${label}</span><span class="tile-value">${num(value)}</span>${hint ? `<span class="tile-hint">${hint}</span>` : ''}</div>`;
}

/** A row of bars for one metric across the recent days (oldest on the left). */
function sparkline(days, key) {
  const series = [...days].reverse();
  const max = Math.max(1, ...series.map((d) => d[key] || 0));
  const bars = series.map((d) => {
    const height = Math.round(((d[key] || 0) / max) * 100);
    return `<span class="bar" style="height:${Math.max(height, 2)}%" title="${d.date}: ${num(d[key])}"></span>`;
  }).join('');
  return `<div class="spark" aria-hidden="true">${bars}</div>`;
}

function renderStatsPage(report) {
  const { live, today, days, totals, keptDays } = report;
  const games = (d) => (d.game_lottery || 0) + (d.game_rps || 0) + (d.game_reaction || 0) + (d.game_race || 0);
  const downloads = (d) => (d.download_mac || 0) + (d.download_win || 0);
  const rows = days.map((d) => `
      <tr>
        <td>${d.date}</td><td>${num(d.page_view)}</td><td>${num(downloads(d))}</td><td>${num(d.new_device)}</td>
        <td>${num(d.connect)}</td><td>${num(d.peak_online)}</td><td>${num(d.message)}</td><td>${num(games(d))}</td>
      </tr>`).join('');
  const totalRows = Object.entries(LABELS).map(([key, label]) => `<tr><td>${label}</td><td>${num(totals[key])}</td></tr>`).join('');

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>오늘뭐해? 통계</title>
<style>
  :root { --bg: #eef1ff; --card: #fff; --ink: #1b1f3b; --soft: #545b7c; --line: #1b1f3b; --accent: #ffd23f; --mint: #a8f0dc; }
  @media (prefers-color-scheme: dark) { :root { --bg: #131733; --card: #1d2246; --ink: #eef1ff; --soft: #a9b0d4; --line: #eef1ff; --mint: #2f7f6c; } }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 20px 48px; font-family: "Apple SD Gothic Neo", "Pretendard", "Malgun Gothic", system-ui, sans-serif;
         color: var(--ink); background: var(--bg); word-break: keep-all; }
  main { max-width: 980px; margin: 0 auto; display: grid; gap: 22px; }
  h1 { margin: 0; font-size: 1.6rem; font-weight: 900; letter-spacing: -0.03em; }
  h2 { margin: 0 0 10px; font-size: 1rem; color: var(--soft); }
  .live { display: inline-flex; align-items: center; gap: 6px; font-size: 0.85rem; color: var(--soft); }
  .live::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: #2f9a63; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
  .tile { display: grid; gap: 2px; padding: 14px 16px; background: var(--card); border: 2px solid var(--line); border-radius: 14px; box-shadow: 3px 3px 0 var(--line); }
  .tile:first-child { background: var(--accent); color: #1b1f3b; }
  .tile-label { font-size: 0.8rem; font-weight: 700; opacity: 0.75; }
  .tile-value { font-size: 1.9rem; font-weight: 900; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
  .tile-hint { font-size: 0.75rem; opacity: 0.7; }
  .charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
  .chart { padding: 12px 14px; background: var(--card); border: 2px solid var(--line); border-radius: 14px; }
  .chart h3 { margin: 0 0 8px; font-size: 0.85rem; }
  .spark { display: flex; align-items: flex-end; gap: 3px; height: 64px; }
  .bar { flex: 1; min-width: 4px; background: var(--mint); border: 1.5px solid var(--line); border-radius: 3px 3px 0 0; }
  table { width: 100%; border-collapse: collapse; background: var(--card); border: 2px solid var(--line); border-radius: 14px; overflow: hidden; font-variant-numeric: tabular-nums; }
  th, td { padding: 8px 10px; text-align: right; border-bottom: 1px solid color-mix(in oklab, var(--line) 15%, transparent); font-size: 0.85rem; }
  th:first-child, td:first-child { text-align: left; }
  th { font-size: 0.75rem; color: var(--soft); background: color-mix(in oklab, var(--accent) 20%, var(--card)); }
  .scroll { overflow-x: auto; }
  footer { font-size: 0.75rem; color: var(--soft); }
</style>
</head>
<body>
<main>
  <header>
    <h1>오늘뭐해? 통계</h1>
    <span class="live">지금 기준 · 하루는 한국 시간 0시에 바뀌어요</span>
  </header>

  <section class="tiles" aria-label="지금과 오늘">
    ${tile('지금 접속 중', live.online)}
    ${tile('열린 방', live.rooms)}
    ${tile('오늘 방문', today.page_view, '다운로드 페이지')}
    ${tile('오늘 다운로드', downloads(today), `맥 ${num(today.download_mac)} · 윈도우 ${num(today.download_win)}`)}
    ${tile('오늘 새 설치', today.new_device)}
    ${tile('오늘 최대 동시 접속', today.peak_online)}
    ${tile('오늘 메시지', today.message)}
    ${tile('오늘 게임', games(today))}
  </section>

  <section aria-label="최근 ${days.length}일 추이">
    <h2>최근 ${days.length}일</h2>
    <div class="charts">
      <div class="chart"><h3>방문</h3>${sparkline(days, 'page_view')}</div>
      <div class="chart"><h3>새 설치</h3>${sparkline(days, 'new_device')}</div>
      <div class="chart"><h3>최대 동시 접속</h3>${sparkline(days, 'peak_online')}</div>
      <div class="chart"><h3>메시지</h3>${sparkline(days, 'message')}</div>
    </div>
  </section>

  <section class="scroll" aria-label="날짜별">
    <h2>날짜별</h2>
    <table>
      <thead><tr><th>날짜</th><th>방문</th><th>다운로드</th><th>새 설치</th><th>접속</th><th>최대 동시</th><th>메시지</th><th>게임</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>

  <section aria-label="누적">
    <h2>누적 (최근 ${keptDays}일 보관분)</h2>
    <table><tbody>${totalRows}</tbody></table>
  </section>

  <footer>이름·코드·메시지 내용·IP는 기록하지 않고 숫자만 세요. JSON: /stats.json</footer>
</main>
</body>
</html>`;
}

module.exports = { renderStatsPage };

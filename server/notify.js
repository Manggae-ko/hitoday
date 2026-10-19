// Sends short notes to the operator's chat (a Discord webhook): someone new showed up,
// a room was made, the server started or is stopping. Off when no address is set.
// A line goes out right away when nothing was sent in the last minute; lines that
// follow within that minute are sent together, so a busy hour isn't spam.

const MAX_CONTENT = 1900; // Discord allows 2000 characters per message
const DEFAULT_BATCH_MS = 60_000;

/**
 * @param {{ url?: string, fetch?: typeof fetch, batchMs?: number, log?: (line: string) => void }} options
 */
function createNotifier({
  url = '',
  fetch = globalThis.fetch,
  batchMs = DEFAULT_BATCH_MS,
  log = () => {},
  clock = Date.now,
} = {}) {
  const enabled = typeof url === 'string' && url.startsWith('https://');
  let waiting = [];
  let timer = null;
  let lastSentAt = -Infinity;

  function contentOf(lines) {
    const kept = [];
    let length = 0;
    for (const line of lines) {
      const more = `외 ${lines.length - kept.length}건`;
      if (length + line.length + 1 + more.length + 1 > MAX_CONTENT) {
        return [...kept, more].join('\n');
      }
      kept.push(line);
      length += line.length + 1;
    }
    return kept.join('\n');
  }

  async function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!enabled || waiting.length === 0) return;
    const lines = waiting;
    waiting = [];
    lastSentAt = clock();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: contentOf(lines), allowed_mentions: { parse: [] } }),
      });
      if (!res.ok) log(`notify failed: HTTP ${res.status}`);
    } catch (err) {
      log(`notify failed: ${err.message}`);
    }
  }

  /**
   * Send a line: right away if nothing went out in the last `batchMs` (or `now: true`),
   * otherwise together with the others once that window ends.
   */
  function notify(line, { now = false } = {}) {
    if (!enabled) return;
    waiting = [...waiting, String(line)];
    const quietFor = clock() - lastSentAt;
    if (now || (!timer && quietFor >= batchMs)) {
      flush();
      return;
    }
    if (!timer) {
      timer = setTimeout(flush, batchMs - quietFor);
      if (timer.unref) timer.unref();
    }
  }

  function stop() {
    if (timer) clearTimeout(timer);
    timer = null;
    waiting = [];
  }

  return { enabled, notify, flush, stop };
}

module.exports = { createNotifier, MAX_CONTENT };

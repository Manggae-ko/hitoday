// Room relay: like a group chat. Everyone in a room sees everyone's character,
// who's online, and what they say. It never sees anyone's screen.

const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');
const { parseClientMessage, makeCode, MAX_ROOM_MEMBERS, ROOM_HISTORY } = require('../shared/protocol');
const { createWebHandler } = require('./web');
const { createGameHost } = require('./game-host');
const { createDeviceKeys } = require('./device-keys');
const { createStats } = require('./stats');
const { createNotifier } = require('./notify');

const MIN_SAY_INTERVAL_MS = 800; // fast enough to chat, slow enough to stop spam
const MAX_PAYLOAD_BYTES = 64 * 1024; // room for one base64 character image
const MAX_ROOMS = 10_000;
const MAX_AVATARS = 5_000; // 32KB each at most → ~160MB worst case
const MIN_AVATAR_INTERVAL_MS = 2_000;
const MIN_MOVE_INTERVAL_MS = 100;
// Two running copies of the app share one code and would kick each other off forever.
// After a few swaps in a short time, a newcomer is held open (no welcome) instead:
// apps only retry after a close, so a held socket ends the loop even for old versions.
const SWAP_WINDOW_MS = 30_000;
const SWAPS_BEFORE_HOLD = 3;
const HOLD_MS = 5 * 60_000;

/** A name as plain text in a chat message (no bold, links or mentions). */
const plain = (name) => String(name || '이름 없음').replace(/[`*_~|>@\[\]()#\\]/g, '');

function send(ws, payload) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function createRelay({
  port = 8787,
  now = Date.now,
  log = () => {},
  repo,
  randomInt = (n) => crypto.randomInt(n),
  gameTimings,
  dataDir, // where device-key hashes and daily stats are kept; omit to keep them in memory only
  gaId, // Google Analytics id for the download page (defaults to GA_MEASUREMENT_ID)
  statsToken, // password for /stats (defaults to STATS_TOKEN)
  notify = () => {}, // tells the operator about new people and rooms (see notify.js)
} = {}) {
  const online = new Map(); // user code -> ws
  const rooms = new Map(); // room code -> { members: Map(user code -> { name, joinedAt }), history: [] }
  const roomOf = new Map(); // user code -> room code
  const lastSayAt = new Map(); // user code -> timestamp
  const avatars = new Map(); // user code -> { bytes, kind, version } (apps re-send theirs on connect)
  const lastAvatarAt = new Map(); // user code -> timestamp
  const lastMoveAt = new Map(); // user code -> timestamp
  const pendingMoves = new Map(); // user code -> timer for a held-back move
  const away = new Set(); // user codes whose computer has been idle or locked
  const swaps = new Map(); // user code -> times a newer copy replaced the online one

  const deviceKeys = createDeviceKeys({ file: dataDir && path.join(dataDir, 'device-keys.json'), log });
  const stats = createStats({
    file: dataDir && path.join(dataDir, 'stats.json'),
    now,
    log,
    live: () => ({ online: online.size, rooms: rooms.size }),
  });
  const httpServer = http.createServer(createWebHandler({ repo, avatars, stats, gaId, statsToken }));
  const wss = new WebSocketServer({ server: httpServer, maxPayload: MAX_PAYLOAD_BYTES });

  function roomSnapshot(roomCode) {
    const room = rooms.get(roomCode);
    const members = [...room.members.entries()]
      .sort((a, b) => a[1].joinedAt - b[1].joinedAt)
      .map(([code, m]) => {
        const avatar = avatars.get(code);
        return {
          code,
          name: m.name,
          character: m.character,
          x: m.x ?? null,
          color: m.color,
          online: online.has(code),
          away: online.has(code) && away.has(code),
          avatar: avatar ? avatar.version : null,
          avatarKind: avatar ? avatar.kind : null,
        };
      });
    return { type: 'room', room: roomCode, members, history: room.history };
  }

  function broadcast(roomCode, payload) {
    const room = rooms.get(roomCode);
    if (!room) return;
    room.members.forEach((_m, code) => send(online.get(code), payload));
  }

  const broadcastState = (roomCode) => rooms.has(roomCode) && broadcast(roomCode, roomSnapshot(roomCode));
  const games = createGameHost({ broadcast, now, randomInt, timings: gameTimings });

  const onlineMembers = (roomCode) => roomSnapshot(roomCode).members.filter((m) => m.online).map((m) => m.code);

  function newRoomCode() {
    let code;
    do code = makeCode((n) => crypto.randomInt(n));
    while (rooms.has(code));
    return code;
  }

  function leaveRoom(user) {
    const roomCode = roomOf.get(user);
    if (!roomCode) return;
    roomOf.delete(user);
    const room = rooms.get(roomCode);
    if (!room) return;
    room.members.delete(user);
    if (room.members.size > 0) return broadcastState(roomCode);
    games.stop(roomCode);
    return rooms.delete(roomCode);
  }

  /** Puts a user in a room. Returns an error reason, or null on success. */
  function enterRoom(user, { name, character, x = null }, roomCode, { create }) {
    if (roomOf.get(user) === roomCode && rooms.has(roomCode)) {
      Object.assign(rooms.get(roomCode).members.get(user), { name, character, x });
      broadcastState(roomCode);
      return null;
    }
    if (!rooms.has(roomCode)) {
      if (!create) return 'no-room';
      if (rooms.size >= MAX_ROOMS) return 'server-full';
      rooms.set(roomCode, { members: new Map(), history: [] });
    }
    const room = rooms.get(roomCode);
    if (room.members.size >= MAX_ROOM_MEMBERS) return 'room-full';
    leaveRoom(user);
    // Each member gets the lowest free color, so nobody in a room shares one.
    const taken = new Set([...room.members.values()].map((m) => m.color));
    let color = 0;
    while (taken.has(color)) color += 1;
    room.members.set(user, { name, character, x, joinedAt: now(), color });
    roomOf.set(user, roomCode);
    broadcastState(roomCode);
    return null;
  }

  function handleHello(ws, msg) {
    // Only the device that first used this code may sign in as it.
    const verdict = deviceKeys.check(msg.code, msg.key);
    if (verdict === 'bad-key' || verdict === 'server-full') {
      send(ws, { type: 'error', reason: verdict });
      ws.close(4001, verdict);
      return;
    }
    if (verdict === 'claimed') {
      stats.record('new_device');
      notify(`🐥 새 사용자가 처음 접속했어요: ${plain(msg.name)}`);
    }
    const previous = online.get(msg.code);
    if (previous && previous !== ws) {
      const recent = (swaps.get(msg.code) || []).filter((at) => now() - at < SWAP_WINDOW_MS);
      if (recent.length >= SWAPS_BEFORE_HOLD) {
        swaps.set(msg.code, recent);
        ws.held = setTimeout(() => ws.close(4002, 'duplicate'), HOLD_MS);
        return;
      }
      swaps.set(msg.code, [...recent, now()]);
      previous.close(4000, 'replaced');
    }
    stats.record('connect');
    ws.user = { code: msg.code, name: msg.name, character: msg.character, x: msg.x };
    away.delete(msg.code); // the app tells us again if it's still idle
    online.set(msg.code, ws);
    stats.notePeak(online.size);
    send(ws, { type: 'welcome', code: msg.code });
    // Rejoin (or rebuild after a server restart) the room this app was in.
    const roomCode = roomOf.get(msg.code) || msg.room;
    if (roomCode && enterRoom(msg.code, ws.user, roomCode, { create: true }) === null) return;
    send(ws, { type: 'left-room' });
  }

  function handleSay(ws, { message }) {
    const { code, name } = ws.user;
    const roomCode = roomOf.get(code);
    if (!roomCode) return send(ws, { type: 'error', reason: 'no-room' });
    if (now() - (lastSayAt.get(code) || 0) < MIN_SAY_INTERVAL_MS) return send(ws, { type: 'error', reason: 'too-fast' });
    lastSayAt.set(code, now());
    const line = { from: code, fromName: name, message, at: now() };
    const room = rooms.get(roomCode);
    room.history = [...room.history, line].slice(-ROOM_HISTORY);
    stats.record('message');
    return broadcast(roomCode, { type: 'said', ...line });
  }

  /**
   * Moving my character: tell the room at most ~10 times a second. Moves that come
   * in faster are held back and the latest one goes out when the wait is over,
   * so where I finally let go always reaches everyone.
   */
  function handleMove(ws, { x }) {
    const { code } = ws.user;
    const roomCode = roomOf.get(code);
    if (!roomCode) return;
    ws.user = { ...ws.user, x };
    rooms.get(roomCode).members.get(code).x = x;
    const announce = () => {
      pendingMoves.delete(code);
      lastMoveAt.set(code, now());
      const member = rooms.has(roomCode) && rooms.get(roomCode).members.get(code);
      if (member) broadcast(roomCode, { type: 'moved', code, x: member.x });
    };
    const wait = MIN_MOVE_INTERVAL_MS - (now() - (lastMoveAt.get(code) || 0));
    if (wait <= 0) return announce();
    if (!pendingMoves.has(code)) pendingMoves.set(code, setTimeout(announce, wait));
  }

  const HANDLERS = {
    'create-room': (ws) => {
      const reason = enterRoom(ws.user.code, ws.user, newRoomCode(), { create: true });
      if (reason) return send(ws, { type: 'error', reason });
      stats.record('room_created');
      return notify(`🏠 새 방이 생겼어요 (만든 사람: ${plain(ws.user.name)})`);
    },
    'join-room': (ws, msg) => {
      const reason = enterRoom(ws.user.code, ws.user, msg.room, { create: false });
      if (reason) return send(ws, { type: 'error', reason });
      const count = rooms.get(roomOf.get(ws.user.code)).members.size;
      return notify(`👥 ${plain(ws.user.name)}님이 방에 들어왔어요 (지금 ${count}명)`);
    },
    'leave-room': (ws) => {
      leaveRoom(ws.user.code);
      send(ws, { type: 'left-room' });
    },
    say: handleSay,
    move: handleMove,
    presence: (ws, msg) => {
      const { code } = ws.user;
      if (away.has(code) === msg.away) return;
      if (msg.away) away.add(code);
      else away.delete(code);
      const roomCode = roomOf.get(code);
      if (roomCode) broadcastState(roomCode);
    },
    'set-avatar': (ws, msg) => {
      const { code } = ws.user;
      if (now() - (lastAvatarAt.get(code) || 0) < MIN_AVATAR_INTERVAL_MS) return send(ws, { type: 'error', reason: 'too-fast' });
      if (msg.bytes && !avatars.has(code) && avatars.size >= MAX_AVATARS) return send(ws, { type: 'error', reason: 'server-full' });
      lastAvatarAt.set(code, now());
      if (msg.bytes) avatars.set(code, { bytes: msg.bytes, kind: msg.kind, version: msg.version });
      else avatars.delete(code);
      const roomCode = roomOf.get(code);
      if (roomCode) return broadcastState(roomCode);
      return send(ws, { type: 'avatar-saved' });
    },
    'start-game': (ws, msg) => {
      const roomCode = roomOf.get(ws.user.code);
      const reason = roomCode ? games.start(roomCode, msg.game, ws.user.code, onlineMembers(roomCode)) : 'no-room';
      if (reason) send(ws, { type: 'error', reason });
      else stats.record(`game_${msg.game}`);
    },
    'game-move': (ws, msg) => {
      const roomCode = roomOf.get(ws.user.code);
      const reason = roomCode ? games.move(roomCode, ws.user.code, msg.move) : 'no-room';
      if (reason) send(ws, { type: 'error', reason });
    },
  };

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      const parsed = parseClientMessage(String(raw));
      if (!parsed.ok) return send(ws, { type: 'error', reason: parsed.error });
      const msg = parsed.value;
      if (ws.held) return undefined; // a held duplicate copy: say nothing, so it stays put
      if (msg.type === 'hello') return handleHello(ws, msg);
      if (!ws.user) return send(ws, { type: 'error', reason: 'say-hello-first' });
      return HANDLERS[msg.type](ws, msg);
    });
    ws.on('close', () => {
      clearTimeout(ws.held);
      if (!ws.user || online.get(ws.user.code) !== ws) return;
      online.delete(ws.user.code);
      away.delete(ws.user.code);
      const roomCode = roomOf.get(ws.user.code);
      if (roomCode) broadcastState(roomCode); // show them as asleep
    });
    ws.on('error', (err) => log(`socket error: ${err.message}`));
  });

  const ready = new Promise((resolve) => httpServer.listen(port, resolve));

  return {
    ready,
    port: () => httpServer.address().port,
    close: () => new Promise((resolve) => {
      games.stopAll();
      deviceKeys.flush();
      stats.stop();
      pendingMoves.forEach((timer) => clearTimeout(timer));
      wss.clients.forEach((c) => c.terminate());
      wss.close(() => httpServer.close(resolve));
    }),
  };
}

module.exports = { createRelay, MIN_SAY_INTERVAL_MS };

if (require.main === module) {
  const port = Number(process.env.PORT) || 8787;
  const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  const log = (line) => process.stdout.write(`${line}\n`);
  const notifier = createNotifier({ url: process.env.NOTIFY_WEBHOOK_URL, log });
  const relay = createRelay({ port, dataDir, log, notify: notifier.notify });
  const version = process.env.GIT_COMMIT || 'unknown';
  // Save device keys before Docker stops the container, and say we're going.
  ['SIGTERM', 'SIGINT'].forEach((signal) => process.on(signal, async () => {
    notifier.notify(`⏹ 서버가 꺼져요 (업데이트나 재시작, 버전 ${version})`);
    await notifier.flush();
    await relay.close();
    process.exit(0);
  }));
  relay.ready.then(() => {
    log(`작당모의 relay listening on :${port}`);
    notifier.notify(`🔄 서버가 켜졌어요 (버전 ${version})`, { now: true });
  });
}

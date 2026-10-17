// Room relay: like a group chat. Everyone in a room sees everyone's character,
// who's online, and what they say. It never sees anyone's screen.

const http = require('node:http');
const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');
const { parseClientMessage, makeCode, MAX_ROOM_MEMBERS, ROOM_HISTORY } = require('../shared/protocol');
const { createWebHandler } = require('./web');
const { createGameHost } = require('./game-host');

const MIN_SAY_INTERVAL_MS = 800; // fast enough to chat, slow enough to stop spam
const MAX_PAYLOAD_BYTES = 64 * 1024; // room for one base64 character image
const MAX_ROOMS = 10_000;
const MAX_AVATARS = 5_000; // 32KB each at most → ~160MB worst case
const MIN_AVATAR_INTERVAL_MS = 2_000;

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
} = {}) {
  const online = new Map(); // user code -> ws
  const rooms = new Map(); // room code -> { members: Map(user code -> { name, joinedAt }), history: [] }
  const roomOf = new Map(); // user code -> room code
  const lastSayAt = new Map(); // user code -> timestamp
  const avatars = new Map(); // user code -> { bytes, kind, version } (apps re-send theirs on connect)
  const lastAvatarAt = new Map(); // user code -> timestamp

  const httpServer = http.createServer(createWebHandler({ repo, avatars }));
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
          color: m.color,
          online: online.has(code),
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
  function enterRoom(user, { name, character }, roomCode, { create }) {
    if (roomOf.get(user) === roomCode && rooms.has(roomCode)) {
      Object.assign(rooms.get(roomCode).members.get(user), { name, character });
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
    room.members.set(user, { name, character, joinedAt: now(), color });
    roomOf.set(user, roomCode);
    broadcastState(roomCode);
    return null;
  }

  function handleHello(ws, msg) {
    const previous = online.get(msg.code);
    if (previous && previous !== ws) previous.close(4000, 'replaced');
    ws.user = { code: msg.code, name: msg.name, character: msg.character };
    online.set(msg.code, ws);
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
    return broadcast(roomCode, { type: 'said', ...line });
  }

  const HANDLERS = {
    'create-room': (ws) => {
      const reason = enterRoom(ws.user.code, ws.user, newRoomCode(), { create: true });
      if (reason) send(ws, { type: 'error', reason });
    },
    'join-room': (ws, msg) => {
      const reason = enterRoom(ws.user.code, ws.user, msg.room, { create: false });
      if (reason) send(ws, { type: 'error', reason });
    },
    'leave-room': (ws) => {
      leaveRoom(ws.user.code);
      send(ws, { type: 'left-room' });
    },
    say: handleSay,
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
      if (msg.type === 'hello') return handleHello(ws, msg);
      if (!ws.user) return send(ws, { type: 'error', reason: 'say-hello-first' });
      return HANDLERS[msg.type](ws, msg);
    });
    ws.on('close', () => {
      if (!ws.user || online.get(ws.user.code) !== ws) return;
      online.delete(ws.user.code);
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
      wss.clients.forEach((c) => c.terminate());
      wss.close(() => httpServer.close(resolve));
    }),
  };
}

module.exports = { createRelay, MIN_SAY_INTERVAL_MS };

if (require.main === module) {
  const port = Number(process.env.PORT) || 8787;
  const relay = createRelay({ port, log: (line) => process.stdout.write(`${line}\n`) });
  relay.ready.then(() => process.stdout.write(`작당모의 relay listening on :${port}\n`));
}

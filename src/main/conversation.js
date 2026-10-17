// Where is the conversation happening? Each character exists in exactly one place.
//   where: null     → everyone is home
//   where: 'there'  → my character is visiting my friend's screen
//   where: 'here'   → my friend's character is visiting my screen
// The first line of a quiet spell "opens" a visit: the sender walks over.
// Pure functions: each returns the next state plus overlay commands to run.

const IDLE_MS = 60_000;
// If both sides open a visit within this window, the lower code is the visitor.
const RACE_WINDOW_MS = 5_000;

const initialConversation = Object.freeze({ where: null, openedAt: 0 });

const cmd = (channel, payload = {}) => ({ channel, payload });

/** I sent a line and the relay confirmed it (echo). */
function onSent(conv, { message, opens, queued }, me, now) {
  if (queued) {
    // Friend's app is off: walk over, leave the note, come back.
    const commands = conv.where === 'there' ? [cmd('me:return-now')] : [];
    return { conv: initialConversation, commands: [...commands, cmd('me:drop-note', { message })] };
  }
  if (conv.where === 'here') return { conv, commands: [cmd('home:says', { message })] };
  const line = cmd('edge:line', { mine: true, name: me.name, message });
  if (conv.where === 'there') return { conv, commands: [line] };
  if (!opens) return { conv, commands: [cmd('home:says', { message })] };
  return {
    conv: { where: 'there', openedAt: now },
    commands: [cmd('me:go', { friendName: me.friendName }), line],
  };
}

/** A line arrived from my friend. */
function onReceived(conv, msg, me, now) {
  if (msg.late) {
    return { conv, commands: [cmd('home:note', { fromName: msg.fromName, message: msg.message })] };
  }
  const guestLine = cmd('guest:says', { from: msg.from, fromName: msg.fromName, message: msg.message });
  if (conv.where === 'there') {
    const raced = msg.opens && now - conv.openedAt < RACE_WINDOW_MS;
    const iStayVisitor = raced ? me.code < msg.from : !msg.opens;
    if (iStayVisitor) {
      return { conv, commands: [cmd('edge:line', { mine: false, name: msg.fromName, message: msg.message })] };
    }
    // They walked over to me: my character hurries home to greet them.
    return { conv: { where: 'here', openedAt: now }, commands: [cmd('me:return-now'), guestLine] };
  }
  return { conv: { where: 'here', openedAt: conv.where ? conv.openedAt : now }, commands: [guestLine] };
}

/** Nobody spoke for IDLE_MS: the visitor goes home. */
function onIdle(conv, friendCode) {
  if (conv.where === 'there') return { conv: initialConversation, commands: [cmd('me:return')] };
  if (conv.where === 'here') return { conv: initialConversation, commands: [cmd('guest:leave', { from: friendCode })] };
  return { conv, commands: [] };
}

module.exports = { IDLE_MS, RACE_WINDOW_MS, initialConversation, onSent, onReceived, onIdle };

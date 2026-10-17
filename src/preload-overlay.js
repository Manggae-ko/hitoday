const { contextBridge, ipcRenderer } = require('electron');

// Stage directions the main process may send to the overlay.
const COMMANDS = ['room:members', 'member:says', 'game'];
const MOVES = ['rock', 'paper', 'scissors', 'tap'];

contextBridge.exposeInMainWorld('nolleowa', {
  ready: () => ipcRenderer.invoke('overlay:ready'),
  onCommand: (callback) => {
    COMMANDS.forEach((channel) => ipcRenderer.on(channel, (_e, payload) => callback(channel, payload || {})));
  },
  setIgnoreMouse: (ignore) => ipcRenderer.send('overlay:set-ignore', Boolean(ignore)),
  openControl: () => ipcRenderer.send('overlay:open-control'),
  gameMove: (move) => MOVES.includes(move) && ipcRenderer.send('overlay:game-move', move),
});

const { contextBridge, ipcRenderer } = require('electron');

// Stage directions the main process may send to the overlay.
const COMMANDS = [
  'me:go',
  'me:return',
  'me:return-now',
  'me:drop-note',
  'edge:line',
  'home:says',
  'home:note',
  'home:rename',
  'guest:says',
  'guest:leave',
];

contextBridge.exposeInMainWorld('nolleowa', {
  getHome: () => ipcRenderer.invoke('overlay:get-home'),
  onCommand: (callback) => {
    COMMANDS.forEach((channel) => ipcRenderer.on(channel, (_e, payload) => callback(channel, payload || {})));
  },
  setIgnoreMouse: (ignore) => ipcRenderer.send('overlay:set-ignore', Boolean(ignore)),
  openControl: () => ipcRenderer.send('overlay:open-control'),
});

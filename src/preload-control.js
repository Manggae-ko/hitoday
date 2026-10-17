const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jakdang', {
  getState: () => ipcRenderer.invoke('control:get-state'),
  onState: (callback) => ipcRenderer.on('control:state', (_e, state) => callback(state)),
  createRoom: () => ipcRenderer.invoke('control:create-room'),
  joinRoom: (code) => ipcRenderer.invoke('control:join-room', String(code)),
  leaveRoom: () => ipcRenderer.invoke('control:leave-room'),
  startGame: (game) => ipcRenderer.invoke('control:start-game', String(game)),
  setAvatar: (bytes) => ipcRenderer.invoke('control:set-avatar', bytes instanceof Uint8Array ? bytes : null),
  clearAvatar: () => ipcRenderer.invoke('control:clear-avatar'),
  setCharacter: (id) => ipcRenderer.invoke('control:set-character', String(id)),
  copyRoom: () => ipcRenderer.invoke('control:copy-room'),
  send: (message) => ipcRenderer.invoke('control:send', String(message)),
  save: (changes) => ipcRenderer.invoke('control:save', changes),
});

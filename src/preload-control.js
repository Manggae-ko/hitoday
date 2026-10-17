const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nolleowa', {
  getState: () => ipcRenderer.invoke('control:get-state'),
  onState: (callback) => ipcRenderer.on('control:state', (_e, state) => callback(state)),
  createRoom: () => ipcRenderer.invoke('control:create-room'),
  joinRoom: (code) => ipcRenderer.invoke('control:join-room', String(code)),
  leaveRoom: () => ipcRenderer.invoke('control:leave-room'),
  copyRoom: () => ipcRenderer.invoke('control:copy-room'),
  send: (message) => ipcRenderer.invoke('control:send', String(message)),
  save: (changes) => ipcRenderer.invoke('control:save', changes),
});

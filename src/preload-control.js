const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nolleowa', {
  getState: () => ipcRenderer.invoke('control:get-state'),
  onState: (callback) => ipcRenderer.on('control:state', (_e, state) => callback(state)),
  copyCode: () => ipcRenderer.invoke('control:copy-code'),
  save: (changes) => ipcRenderer.invoke('control:save', changes),
  visit: (message) => ipcRenderer.invoke('control:visit', String(message)),
});

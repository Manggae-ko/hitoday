const { contextBridge, ipcRenderer } = require('electron');

const listen = (channel) => (callback) => ipcRenderer.on(channel, (_e, payload) => callback(payload));

contextBridge.exposeInMainWorld('nolleowa', {
  getHome: () => ipcRenderer.invoke('overlay:get-home'),
  onGuestArrive: listen('guest:arrive'),
  onHomeLeave: listen('home:leave'),
  onHomeReturn: listen('home:return'),
  onHomeRename: listen('home:rename'),
  setIgnoreMouse: (ignore) => ipcRenderer.send('overlay:set-ignore', Boolean(ignore)),
  openControl: () => ipcRenderer.send('overlay:open-control'),
  guestDone: (from) => ipcRenderer.send('overlay:guest-done', String(from)),
  homeBack: () => ipcRenderer.send('overlay:home-back'),
});

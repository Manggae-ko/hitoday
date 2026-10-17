const { contextBridge, ipcRenderer } = require('electron');

const listen = (channel) => (callback) => ipcRenderer.on(channel, (_e, payload) => callback(payload));

contextBridge.exposeInMainWorld('nolleowa', {
  getHome: () => ipcRenderer.invoke('overlay:get-home'),
  onGuestSays: listen('guest:says'),
  onHomeSays: listen('home:says'),
  onHomeRename: listen('home:rename'),
  setIgnoreMouse: (ignore) => ipcRenderer.send('overlay:set-ignore', Boolean(ignore)),
  openControl: () => ipcRenderer.send('overlay:open-control'),
});

// The transparent overlay the characters live on, and the small settings window.

const path = require('node:path');
const { BrowserWindow, screen } = require('electron');

const RENDERER_DIR = path.join(__dirname, '..', 'renderer');

function lockDown(win) {
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

const secureWebPreferences = (preload) => ({
  preload: path.join(__dirname, '..', preload),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
});

function createOverlayWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    ...workArea,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    focusable: false,
    hasShadow: false,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: secureWebPreferences('preload-overlay.js'),
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Clicks pass through to the desktop except where a character is (see overlay.js).
  win.setIgnoreMouseEvents(true, { forward: true });
  lockDown(win);
  win.loadFile(path.join(RENDERER_DIR, 'overlay.html'));

  const fitToScreen = () => win.setBounds(screen.getPrimaryDisplay().workArea);
  screen.on('display-metrics-changed', fitToScreen);
  screen.on('display-added', fitToScreen);
  screen.on('display-removed', fitToScreen);
  return win;
}

function createControlWindow() {
  const win = new BrowserWindow({
    width: 380,
    height: 700,
    resizable: false,
    show: false,
    title: '놀러와',
    autoHideMenuBar: true,
    backgroundColor: '#f6f1e7',
    webPreferences: secureWebPreferences('preload-control.js'),
  });
  // Closing just hides it; the characters keep living on the desktop.
  win.on('close', (event) => {
    if (!win.forceClose) {
      event.preventDefault();
      win.hide();
    }
  });
  lockDown(win);
  win.loadFile(path.join(RENDERER_DIR, 'control.html'));
  return win;
}

module.exports = { createOverlayWindow, createControlWindow };

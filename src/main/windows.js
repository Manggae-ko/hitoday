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

// NOLLEOWA_REGION=left|right gives each demo copy half the screen,
// so two copies on one Mac look like two monitors side by side.
function overlayBounds() {
  const { workArea } = screen.getPrimaryDisplay();
  const half = Math.floor(workArea.width / 2);
  const region = process.env.NOLLEOWA_REGION;
  if (region === 'left') return { ...workArea, width: half };
  if (region === 'right') return { ...workArea, x: workArea.x + half, width: workArea.width - half };
  return workArea;
}

function createOverlayWindow() {
  const win = new BrowserWindow({
    ...overlayBounds(),
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

  const fitToScreen = () => win.setBounds(overlayBounds());
  screen.on('display-metrics-changed', fitToScreen);
  screen.on('display-added', fitToScreen);
  screen.on('display-removed', fitToScreen);
  return win;
}

function createControlWindow() {
  const region = overlayBounds();
  const width = 380;
  const height = 740;
  const win = new BrowserWindow({
    width,
    height,
    // Open over the middle of this copy's half (or the whole screen).
    x: Math.round(region.x + (region.width - width) / 2),
    y: Math.round(region.y + Math.max(0, (region.height - height) / 3)),
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

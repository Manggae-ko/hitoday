const path = require('node:path');
const { Tray, Menu, nativeImage } = require('electron');

const ICON = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png';

/**
 * The menu-bar / system-tray icon. `showUpdate(onInstall)` adds an
 * "update and restart" item once a new version has been downloaded.
 */
function createTray({ onOpen, onQuit }) {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'assets', ICON));
  const tray = new Tray(icon);
  tray.setToolTip('작당모의');

  const setMenu = (onInstall) => tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '작당모의 열기', click: onOpen },
      ...(onInstall ? [{ label: '새 버전으로 업데이트하고 다시 시작', click: onInstall }] : []),
      { type: 'separator' },
      { label: '종료', click: onQuit },
    ]),
  );
  setMenu(null);
  if (process.platform !== 'darwin') tray.on('click', onOpen);
  return { tray, showUpdate: (onInstall) => setMenu(onInstall) };
}

module.exports = { createTray };

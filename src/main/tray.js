const path = require('node:path');
const { Tray, Menu, nativeImage } = require('electron');

const ICON = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png';

function createTray({ onOpen, onQuit }) {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'assets', ICON));
  const tray = new Tray(icon);
  tray.setToolTip('놀러와');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '놀러 가기 / 설정', click: onOpen },
      { type: 'separator' },
      { label: '종료', click: onQuit },
    ]),
  );
  if (process.platform !== 'darwin') tray.on('click', onOpen);
  return tray;
}

module.exports = { createTray };

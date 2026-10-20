const path = require('node:path');
const { Tray, Menu, nativeImage } = require('electron');

const ICON = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png';

/**
 * The menu-bar / system-tray icon.
 * - `setHidden(hidden)` switches the "hide for a moment" item's label.
 * - `showUpdate(onInstall)` adds an "update and restart" item once a new version is downloaded.
 */
function createTray({ onOpen, onQuit, onToggleHidden, hideShortcutLabel }) {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'assets', ICON));
  const tray = new Tray(icon);
  tray.setToolTip('작당모의');
  let state = { hidden: false, onInstall: null };

  const render = () => tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '작당모의 열기', click: onOpen },
      {
        label: state.hidden ? '캐릭터 다시 보이기' : '캐릭터 잠깐 숨기기',
        accelerator: hideShortcutLabel || undefined,
        click: onToggleHidden,
      },
      ...(state.onInstall ? [{ label: '새 버전으로 업데이트하고 다시 시작', click: state.onInstall }] : []),
      { type: 'separator' },
      { label: '종료', click: onQuit },
    ]),
  );
  render();
  if (process.platform !== 'darwin') tray.on('click', onOpen);
  return {
    tray,
    setHidden: (hidden) => {
      state = { ...state, hidden };
      render();
    },
    showUpdate: (onInstall) => {
      state = { ...state, onInstall };
      render();
    },
  };
}

module.exports = { createTray };

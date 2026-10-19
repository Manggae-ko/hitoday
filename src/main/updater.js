// Keeps installed copies up to date from GitHub Releases: checks at start and every few
// hours, downloads quietly, and installs when the app quits (or right away from the tray).

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * @param {{
 *   autoUpdater: import('electron-updater').AppUpdater,
 *   onReady: (version: string) => void,
 *   log?: (line: string) => void,
 *   setInterval?: typeof setInterval,
 * }} options
 */
function startUpdater({ autoUpdater, onReady, log = () => {}, setInterval = global.setInterval }) {
  let announced = false;

  autoUpdater.on('update-downloaded', (info) => {
    if (announced) return;
    announced = true;
    onReady(info && info.version ? String(info.version) : '');
  });
  autoUpdater.on('error', (err) => log(`update failed: ${err && err.message}`));

  const check = () => {
    Promise.resolve()
      .then(() => autoUpdater.checkForUpdates())
      .catch((err) => log(`update check failed: ${err && err.message}`));
  };
  check();
  const timer = setInterval(check, CHECK_EVERY_MS);
  if (timer && timer.unref) timer.unref();
  return { check };
}

module.exports = { startUpdater, CHECK_EVERY_MS };

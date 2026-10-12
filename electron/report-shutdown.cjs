// Bounded handshake: give the renderer time to journal its final sample before
// closing the host. A hung renderer must never keep the optimizer running.
function flushReportBeforeQuit(window, ipcMain, timeoutMs = 2000) {
  if (!window || window.isDestroyed()) return Promise.resolve();
  return new Promise(resolve => {
    let timer;
    const done = () => { clearTimeout(timer); ipcMain.removeListener('reports:shutdown-ready', onReady); resolve(); };
    const onReady = event => { if (event.sender === window.webContents) done(); };
    ipcMain.on('reports:shutdown-ready', onReady);
    timer = setTimeout(done, timeoutMs);
    try { window.webContents.send('reports:prepare-shutdown'); } catch { done(); }
  });
}
module.exports = { flushReportBeforeQuit };

// Isolated real-Electron lifecycle smoke. Does not register startup, access real
// account sessions, open the optimizer service, or submit a sign-in request.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const { createStartupSettings } = require('../electron/startup.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'synapsex-startup-smoke-'));
app.setPath('userData', directory);
let spawned = 0, windows = 0;
childProcess.spawn = () => { spawned++; throw new Error('Background mode must not launch a host or collector'); };
app.on('browser-window-created', () => { windows++; });
process.argv.push('--synapsex-startup');
require('../electron/main.cjs');
let result = 1;
app.once('will-quit', () => {
  console.log(JSON.stringify({ test:'background-startup', result:result === 0 ? 'passed' : 'failed', windows, spawned, realAccountsAccessed:false, startupRegistryWrites:0, isolatedUserData:directory }));
  process.exitCode = result;
});
app.whenReady().then(() => setTimeout(() => {
  try {
    assert.equal(BrowserWindow.getAllWindows().length, 0);
    assert.equal(spawned, 0); assert.equal(windows, 0);
    assert.equal(createStartupSettings({app}).read().supported, false);
    result = 0;
  } catch (e) { console.error(e.message); }
  app.quit();
}, 1500));
setTimeout(() => { console.error('Lifecycle smoke timed out'); app.exit(1); }, 15000).unref();

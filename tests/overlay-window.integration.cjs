// Runs the production Electron overlay with the built UI and mock telemetry only.
// No game, registry, power-plan or FPS collector operations.
const { app, BrowserWindow, ipcMain, dialog, screen, powerMonitor } = require('electron');
const {attachOverlayGuardian}=require('../electron/overlay-guardian.cjs');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'electron/main.cjs'), 'utf8');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let server; let context;
app.on('window-all-closed', () => {});
const results = [];
const reportFile = path.join(__dirname, 'overlay-window-result.json');
const watchdog = setTimeout(() => { fs.writeFileSync(reportFile, JSON.stringify({ok:false, error:'test timeout', results}, null, 2)); app.exit(1); }, 20000);
app.whenReady().then(async () => {
  server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) { res.writeHead(503); res.end('Test telemetry intentionally offline'); return; }
    const name = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, 'dist', name === '/' ? 'index.html' : '.' + name);
    if (!file.startsWith(path.join(root, 'dist') + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  context = vm.createContext({ BrowserWindow, ipcMain, dialog, path, app, fs, screen, powerMonitor, attachOverlayGuardian, __dirname: path.join(root, 'electron'),
    mainWindow: null, overlayWindow: null, overlayGuardian: null, overlayCloseRequested: false, shuttingDown: false, monitorController:null,
    overlayConfiguration: { layout: 'horizontal', scale: 'medium' },
    hostEndpoint: { port: server.address().port, token: 'test-only' },
    getFpsState: () => ({ running: false, available: false, fps: null, onePercentLow: null, status: 'stopped', source: 'TEST' }),
    startFpsCollector: () => { throw Error('Collector must never run in this test'); }, stopFpsCollector: () => {},
  });
  vm.runInContext(source.slice(source.indexOf('function normalizeOverlayConfiguration'), source.indexOf('function getFreePort')), context);
  vm.runInContext(source.slice(source.indexOf('function registerWindowControls'), source.indexOf('async function createWindow()')), context);
  vm.runInContext('registerWindowControls()', context);
  for (const layout of ['horizontal', 'grid']) {
    context.overlayConfiguration = { layout, scale: 'medium' };
    await vm.runInContext('createOverlayWindow()', context);
    const win = context.overlayWindow;
    await win.webContents.executeJavaScript(`localStorage.setItem('synapsex.monitor.overlay', JSON.stringify({layout:'${layout}'})); location.reload()`);
    await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    let geometry;
    for (let attempt = 0; attempt < 50; attempt++) {
      geometry = await win.webContents.executeJavaScript(`(() => {
        const b=document.querySelector('.overlay-close'), s=document.querySelector('.overlay-surface'), h=document.querySelector('.overlay-drag-handle');
        if(!b||!s||!h)return null;
        const r=b.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height,drag:getComputedStyle(s).webkitAppRegion,handle:getComputedStyle(h).webkitAppRegion};
      })()`);
      if (geometry) break; await delay(100);
    }
    assert.ok(geometry, 'Overlay renders');
    assert.equal(geometry.w, 26); assert.equal(geometry.h, 26);
    assert.equal(geometry.drag, 'no-drag'); assert.equal(geometry.handle, 'drag');
    assert.equal(win.isMinimizable(), false); assert.equal(win.isMaximizable(), false);
    const click = async (x, y) => {
      win.webContents.sendInputEvent({type:'mouseDown',x,y,button:'left',clickCount:1});
      win.webContents.sendInputEvent({type:'mouseUp',x,y,button:'left',clickCount:1});
      await delay(150);
    };
    await click(200, layout === 'grid' ? 110 : 25);
    assert.equal(win.isDestroyed(), false, 'Clicking metric must retain overlay');
    await click(5, 5);
    assert.equal(win.isDestroyed(), false, 'Clicking padding must retain overlay');
    win.close(); assert.equal(win.isDestroyed(), false, 'Unrequested native close must be blocked');
    const closed = new Promise(resolve => win.once('closed', resolve));
    await click(Math.round(geometry.x + 13), Math.round(geometry.y + 13));
    await Promise.race([closed, delay(3000).then(() => { if (!win.isDestroyed()) throw Error('X did not close overlay'); })]);
    assert.equal(context.overlayWindow, null);
    results.push({layout, geometry, clicks:'metric and padding retained; X closed', nativeClose:'guarded'});
    console.log('PASS ' + layout + ': metric/padding clicks retained, native close guarded, X closed; 26x26 hitbox');
  }
}).then(() => { clearTimeout(watchdog); fs.writeFileSync(reportFile, JSON.stringify({ok:true,results}, null, 2)); server.close(); app.exit(0); }).catch(error => {
  clearTimeout(watchdog); fs.writeFileSync(reportFile, JSON.stringify({ok:false,error:String(error),results}, null, 2));
  console.error(error); if(context?.overlayWindow&&!context.overlayWindow.isDestroyed())context.overlayWindow.destroy();
  if(server)server.close(); app.exit(1);
});

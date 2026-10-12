const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const source = fs.readFileSync(require.resolve('../electron/main.cjs'), 'utf8');

test('X intercepts close through preference controller but real shutdown bypasses prompt',()=>{
 const mainWindow=new EventEmitter();let prevented=0,requested=0;
 const context={mainWindow,shuttingDown:false,windowBehavior:{requestClose:window=>{assert.equal(window,mainWindow);requested++;}}};
 vm.runInNewContext(source.match(/mainWindow\.on\("close",[^\n]+/)[0],context);
 mainWindow.emit('close',{preventDefault:()=>prevented++});assert.equal(prevented,1);assert.equal(requested,1);
 context.shuttingDown=true;mainWindow.emit('close',{preventDefault:()=>prevented++});assert.equal(prevented,1);assert.equal(requested,1);
});
test('actually destroying the main window requests whole-app quit even with an overlay', () => {
  const mainWindow = new EventEmitter(); let quits = 0;
  vm.runInNewContext(source.match(/mainWindow\.on\("closed",[^\n]+/)[0], { mainWindow, app: { quit: () => quits++ } });
  mainWindow.emit('closed'); assert.equal(quits, 1);
});
test('quit destroys overlay and waits for collector cleanup before releasing application', async () => {
  const app = new EventEmitter(); let quits = 0; app.quit = () => quits++;
  let done; let cleaned = false; let destroyed = false; let hostStopped = false; let trayStopped = false;
  const wait = new Promise(resolve => { done = resolve; });
  let licenseStopped = false, accountStopped = false, monitorStopped=false;
  const context = { app, closePrompt:{stop:()=>{}}, windowBehavior:{stop:()=>{}}, mainWindow:null, ipcMain:new EventEmitter(), require:()=>require('../electron/report-shutdown.cjs'), fpsExpiry:{stop:()=>{}}, product:{stop:()=>{}}, softwareAccount: {stop:()=>{accountStopped=true;}}, licensing: { stop: () => { licenseStopped = true; } }, startupBackground: { stop: () => { trayStopped = true; } }, shuttingDown: false, shutdownComplete: false, overlayWindow: { isDestroyed: () => false, destroy: () => { destroyed = true; } },
    monitorController:{stop:()=>{monitorStopped=true;}}, getFpsCollector: () => ({ shutdown: () => { cleaned = true; return wait; } }), communitySignin: { shutdown: () => wait }, requestHostShutdown: async () => { hostStopped = true; }, hostProcess: null, hostEndpoint: {}, Promise };
  let finishLights,lightsStopped=false;
  context.windowEffects={leave:()=>new Promise(resolve=>finishLights=resolve),stop:()=>{lightsStopped=true;}};
  let sensorStopped=false;context.sensorPrompt={stop:()=>{sensorStopped=true;}};
  vm.runInNewContext(source.slice(source.indexOf('app.on("before-quit"')), context);
  let prevented = false; app.emit('before-quit', { preventDefault: () => { prevented = true; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sensorStopped,true);
  assert.ok(prevented && destroyed && cleaned && hostStopped && trayStopped && licenseStopped && accountStopped && monitorStopped); assert.equal(quits, 0);
  let repeatPrevented = false; app.emit('before-quit', { preventDefault: () => { repeatPrevented = true; } }); assert.ok(repeatPrevented);
  done(); await new Promise(resolve => setImmediate(resolve)); assert.equal(quits, 0);
  finishLights();await new Promise(resolve=>setImmediate(resolve));assert.equal(quits,1);assert.equal(lightsStopped,true);
});

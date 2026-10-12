const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createStartupSettings, createStartupBackground, STARTUP_ARG, STARTUP_NAME } = require('../electron/startup.cjs');

function settingsFixture(overrides = {}) {
  let current = { openAtLogin:false, executableWillLaunchAtLogin:false, launchItems:[] };
  const writes = [], reads = [];
  const app = { isPackaged:true,
    getLoginItemSettings(options) { reads.push(options); return current; },
    setLoginItemSettings(value) { writes.push(value); current = { openAtLogin:value.openAtLogin, executableWillLaunchAtLogin:value.enabled,
      launchItems:value.openAtLogin ? [{name:STARTUP_NAME, scope:'user', enabled:value.enabled}] : [] }; },
  };
  const settings = createStartupSettings({ app, platform:'win32', env:{PORTABLE_EXECUTABLE_FILE:'D:\\我的软件\\SynapseX 0.32.5.exe'}, execPath:'C:\\Temp\\unpacked\\app.exe', exists:()=>true, ...overrides });
  return { settings, writes, reads, app, setCurrent:value => { current = value; } };
}
test('startup is opt-in; reading never registers a launch item', () => {
  const f = settingsFixture(); assert.equal(f.settings.read().enabled, false); assert.equal(f.writes.length, 0);
});
test('portable startup uses the real launcher, preserves spaces and reads back exact arguments', () => {
  const f = settingsFixture(); assert.equal(f.settings.save({enabled:true}).enabled, true);
  assert.deepEqual(f.writes[0], {path:'D:\\我的软件\\SynapseX 0.32.5.exe', args:[STARTUP_ARG], name:STARTUP_NAME, openAtLogin:true, enabled:true});
  assert.deepEqual(f.reads[0], {path:f.writes[0].path, args:[STARTUP_ARG]});
  assert.equal(f.settings.save({enabled:false}).registered, false);
});
test('Windows-disabled startup is reported without silently re-enabling it', () => {
  const f = settingsFixture(); f.setCurrent({openAtLogin:true, executableWillLaunchAtLogin:false, launchItems:[{name:STARTUP_NAME,scope:'user',enabled:false}]});
  const value = f.settings.read(); assert.equal(value.enabled, false); assert.equal(value.blocked, true); assert.equal(f.writes.length,0);
});
test('development, non-Windows and missing binaries cannot register', () => {
  for (const options of [{app:{isPackaged:false}}, {platform:'darwin'}, {exists:()=>false}]) {
    const f = settingsFixture(options); assert.equal(f.settings.read().supported,false); assert.throws(()=>f.settings.save({enabled:true}));
  }
});
test('startup saves reject malformed IPC input and failed Windows readback', () => {
  const f = settingsFixture(); assert.throws(()=>f.settings.save({enabled:'true'})); assert.equal(f.writes.length,0);
  f.app.setLoginItemSettings = () => {}; assert.throws(()=>f.settings.save({enabled:true}), /核验/);
});
test('unpacked executable is supported; a relative portable path is rejected', () => {
  const f = settingsFixture({env:{}}); f.settings.save({enabled:true}); assert.equal(f.writes[0].path,'C:\\Temp\\unpacked\\app.exe');
  assert.equal(settingsFixture({env:{PORTABLE_EXECUTABLE_FILE:'app.exe'}}).settings.read().supported,false);
});

function backgroundFixture({autoSign=true, enabled=true, fail=false, online=true} = {}) {
  let tray, runs=0, opens=0, exits=0, timerCallback, cleared=false;
  const result = {autoSign,accounts:[{enabled,status:'pending'}]};
  class Tray extends EventEmitter {
    constructor() { super(); tray=this; }
    setToolTip(value) { this.tip=value; }
    setContextMenu(value) { this.menu=value; }
    destroy() { this.destroyed=true; }
  }
  const background = createStartupBackground({Tray,Menu:{buildFromTemplate:items=>items},icon:'test.png',
    signin:{accounts:()=>result,startup:async()=>{runs++;if(fail)throw new Error('offline');result.accounts[0].status='signed';}},
    openWorkspace:()=>{opens++;},quit:()=>{exits++;},isOnline:()=>online,
    setTimer:callback=>{timerCallback=callback;return 1;},clearTimer:()=>{cleared=true;},
  });
  return {background,result,get tray(){return tray;},get runs(){return runs;},get opens(){return opens;},get exits(){return exits;},get cleared(){return cleared;},tick:()=>timerCallback?.()};
}
test('background startup submits only through the existing signer and exposes tray actions', async () => {
  const f=backgroundFixture(); await f.background.start(); await f.background.start();
  assert.equal(f.runs,1); assert.equal(f.opens,0); assert.match(f.tray.tip,/1 \/ 1/);
  f.tray.emit('double-click'); f.tray.menu[2].click(); f.tray.menu[3].click();
  assert.equal(f.opens,2); assert.equal(f.exits,1); f.background.stop(); assert.equal(f.tray.destroyed,true);
});
test('startup does not query or sign when auto-sign is off or no accounts participate', async () => {
  for (const options of [{autoSign:false},{enabled:false}]) { const f=backgroundFixture(options); await f.background.start(); assert.equal(f.runs,0); f.background.stop(); }
});
test('quitting while waiting for network cancels without starting the signer', async () => {
  const f=backgroundFixture({online:false}); const work=f.background.start();
  assert.match(f.tray.tip,/等待网络/); f.background.stop(); await work;
  assert.equal(f.runs,0); assert.equal(f.cleared,true); assert.equal(f.tray.destroyed,true);
});
test('network wait is bounded and a failure is visible instead of reported successful', async () => {
  const f=backgroundFixture({online:false,fail:true}); const work=f.background.start();
  for(let i=0;i<30;i++){f.tick();await Promise.resolve();}
  await work; assert.equal(f.runs,1); assert.match(f.tray.tip,/未完成/); f.background.stop();
});
test('storage errors and incomplete account results remain actionable', async () => {
  const f=backgroundFixture(); f.result.storageError='broken'; await f.background.start();
  assert.match(f.tray.tip,/记录异常/); f.background.stop();
});

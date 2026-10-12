const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(require.resolve('../electron/main.cjs'), 'utf8');

function fixture() {
  const windows = [], handlers = new Map();
  class Window extends EventEmitter {
    constructor(options) {
      super();this.options=options;this.destroyed=false;this.reasons=[];
      this.webContents={setWindowOpenHandler(){}};windows.push(this);
    }
    isDestroyed(){return this.destroyed;}
    setAlwaysOnTop(){}
    setIgnoreMouseEvents(){}
    loadURL(){return Promise.resolve();}
    close(){
      let prevented=false;this.emit('close',{preventDefault(){prevented=true;}});
      if(!prevented){this.destroyed=true;this.emit('closed');}
    }
  }
  const context=vm.createContext({BrowserWindow:Window,ipcMain:{on(){},handle:(name,fn)=>handlers.set(name,fn)},
    path,fs:{existsSync:()=>false,appendFileSync(){}},app:{getPath:()=>'/test-only'},
    __dirname:'/test-only',mainWindow:null,overlayWindow:null,overlayGuardian:null,overlayPositions:null,monitorController:null,
    createOverlayPositionStore:()=>({resolve:dimensions=>({...dimensions,x:490,y:8}),attach(){}}),
    overlayCloseRequested:false,shuttingDown:false,hostEndpoint:{port:1234,token:'fixture'},
    overlayConfiguration:{layout:'horizontal',scale:'medium'},
    screen:{getPrimaryDisplay:()=>({workArea:{width:1920,height:1080}})},powerMonitor:{},
    attachOverlayGuardian:(win,deps)=>{win.wanted=deps.wanted;return {recover:reason=>win.reasons.push(reason)};},
  });
  vm.runInContext(source.slice(source.indexOf('function normalizeOverlayConfiguration'),source.indexOf('function getFreePort')),context);
  vm.runInContext(source.slice(source.indexOf('function registerWindowControls'),source.indexOf('async function createWindow()')),context);
  vm.runInContext('registerWindowControls()',context);
  return {context,windows,open:()=>vm.runInContext('createOverlayWindow()',context),close:()=>handlers.get('monitor:close-overlay')()};
}

test('opening existing HUD uses recovery and does not create duplicate windows',async()=>{
  const f=fixture();await f.open();const win=f.windows[0];win.emit('ready-to-show');
  await f.open();assert.equal(f.windows.length,1);assert.deepEqual(win.reasons,['ready','manual-open']);
  assert.equal(win.options.focusable,false);assert.equal(win.options.webPreferences.backgroundThrottling,false);
  assert.equal(win.options.x,490);assert.equal(win.options.y,8);
});

test('native close is guarded; explicit close works; old ready event cannot show replacement',async()=>{
  const f=fixture();await f.open();const old=f.windows[0];old.close();assert.equal(old.destroyed,false);
  f.close();assert.equal(old.destroyed,true);assert.equal(f.context.overlayWindow,null);assert.equal(old.wanted(),false);
  await f.open();const next=f.windows[1];old.emit('ready-to-show');assert.deepEqual(next.reasons,[]);
  next.emit('ready-to-show');assert.deepEqual(next.reasons,['ready']);
});

test('shutdown suppresses ready callback, recovery intent and new HUD creation',async()=>{
  const f=fixture();await f.open();f.context.shuttingDown=true;
  const win=f.windows[0];win.emit('ready-to-show');assert.deepEqual(win.reasons,[]);assert.equal(win.wanted(),false);
  await f.open();assert.equal(f.windows.length,1);
});

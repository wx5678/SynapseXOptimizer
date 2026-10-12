const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {EventEmitter} = require('node:events');
const source = fs.readFileSync(require.resolve('../electron/main.cjs'),'utf8');

function fixture(startup = true) {
  const app = new EventEmitter(), ipcMain = new EventEmitter();
  const ipc = new Map(); ipcMain.handle=(name,fn)=>ipc.set(name,fn);
  let quits=0, backgrounds=0, stopped=0, collectors=0, spawns=0, starts=0, ready, bgDeps;
  app.requestSingleInstanceLock=()=>true; app.whenReady=()=>({then:fn=>{ready=fn;}});
  app.quit=()=>{quits++;}; app.getPath=()=>'/isolated';
  const mocks = {
    './window-effects.cjs':require('../electron/window-effects.cjs'),
    './window-behavior.cjs':require('../electron/window-behavior.cjs'),
    './close-prompt.cjs':require('../electron/close-prompt.cjs'),
    './sensor-prompt.cjs':require('../electron/sensor-prompt.cjs'),
    './report-outbox.cjs':require('../electron/report-outbox.cjs'),
    './report-shutdown.cjs':require('../electron/report-shutdown.cjs'),
    './monitor-controller.cjs':require('../electron/monitor-controller.cjs'),
    './quick-apply.cjs':require('../electron/quick-apply.cjs'),
    './overlay-guardian.cjs':require('../electron/overlay-guardian.cjs'),
    './overlay-position.cjs':require('../electron/overlay-position.cjs'),
    './admin-access.cjs':require('../electron/admin-access.cjs'),
    './fps-expiry.cjs':{createFpsExpiry:()=>({start(){},stop(){},state:()=>({})})},
    './product-client.cjs':{createProductClient:()=>({refresh:async()=>{},start:()=>{},stop:()=>{},state:()=>({required:false}),requireAccess:()=>{}})},
    './vip-policy.cjs':require('../electron/vip-policy.cjs'),
    './jiuyin-fps-unlock.cjs':require('../electron/jiuyin-fps-unlock.cjs'),
    electron:{app,ipcMain,dialog:{showErrorBox:()=>{},showMessageBox:async()=>({response:0})},net:{isOnline:()=>true}},
    './sensor-installer.cjs':require('../electron/sensor-installer.cjs'),
    './appearance.cjs':{createAppearanceStore:()=>({})},'./game-paths.cjs':{createGamePathStore:()=>({})},
    './licensing.cjs':{createLicensing:()=>({start:()=>{},stop:()=>{},state:()=>({configured:false})})},
    './software-account.cjs':{createSoftwareAccount:()=>({start:()=>{},stop:()=>{},state:()=>({configured:false})})},
    './fps-collector.cjs':{createFpsCollector:()=>{collectors++;return {shutdown:async()=>{}};}},
    './community-accounts.cjs':{createCommunityAccounts:()=>({startup:()=>{starts++;},shutdown:async()=>{}})},
    './startup.cjs':{STARTUP_ARG:'--synapsex-startup',createStartupSettings:()=>({read:()=>({enabled:false}),save:v=>v}),
      createStartupBackground:deps=>{bgDeps=deps;return {start:async()=>{backgrounds++;},stop:()=>{stopped++;}};}},
    child_process:{spawn:()=>{spawns++;throw new Error('Unexpected elevated service');}},
  };
  const context = vm.createContext({require:name=>mocks[name]||require(name),process:{argv:startup?['exe','--synapsex-startup']:['exe']},__dirname:path.dirname(require.resolve('../electron/main.cjs')),console,setTimeout,clearTimeout,Promise});
  vm.runInContext(source,context);
  return {app,ipc,context,run:()=>ready(),get bg(){return bgDeps;},counts:()=>({quits,backgrounds,stopped,collectors,spawns,starts})};
}
test('main startup mode creates no workbench, elevated process or FPS collector',async()=>{
  const f=fixture(); await f.run();
  assert.deepEqual(f.counts(),{quits:0,backgrounds:1,stopped:0,collectors:0,spawns:0,starts:0});
  f.app.emit('window-all-closed'); assert.equal(f.counts().quits,0);
  assert.throws(()=>f.ipc.get('startup:save')({sender:{}},{enabled:true}),/Unsupported/);
});
test('manual second launch opens the workbench without quitting the background instance',async()=>{
  const f=fixture(); await f.run();
  vm.runInContext('globalThis.opens = 0; createWindow = async () => { globalThis.opens++; };',f.context);
  f.app.emit('second-instance',{},['exe','--synapsex-startup']); assert.equal(f.context.opens,0);
  f.app.emit('second-instance',{},['exe']); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.context.opens,1); assert.equal(f.counts().quits,0); assert.equal(f.counts().starts,1);
});
test('normal launch retains the workbench path and does not create a tray',async()=>{
  const f=fixture(false);
  vm.runInContext('globalThis.opens=0; createWindow = async () => {globalThis.opens++;};',f.context);
  await f.run(); assert.equal(f.context.opens,1); assert.equal(f.counts().backgrounds,0);
  f.app.emit('window-all-closed'); assert.equal(f.counts().quits,1);
});

test('driver installation rejects foreign frames and cancellation performs no install',async()=>{
 const f=fixture();await f.run();
 const install=f.ipc.get('monitor:sensor-install');
 assert.throws(()=>install({sender:{},senderFrame:{}}),/不支持/);
 const sender=new EventEmitter();sender.mainFrame={};sender.isDestroyed=()=>false;
 let request;sender.send=(name,value)=>{if(name==='sensor-prompt:request')request=value;};f.context.testSensorSender=sender;
 const event=vm.runInContext("mainWindow={webContents:testSensorSender}; ({sender:mainWindow.webContents,senderFrame:mainWindow.webContents.mainFrame})",f.context);
 assert.throws(()=>install({...event,senderFrame:{}}),/不支持/);
 f.ipc.get('sensor-prompt:ready')(event,true);
 const pending=install(event);assert(request);f.ipc.get('sensor-prompt:ack')(event,request.id);
 f.ipc.get('sensor-prompt:respond')(event,{id:request.id,accepted:false});
 const result=await pending;assert.equal(result.status,'cancelled');assert.equal(f.counts().spawns,0);
 for(const name of ['sensor-prompt:ready','sensor-prompt:ack','sensor-prompt:respond']) {
   assert.throws(()=>f.ipc.get(name)({sender:{},senderFrame:{}},{}),/Unsupported/);
   assert.throws(()=>f.ipc.get(name)({...event,senderFrame:{}},{}),/Unsupported/);
 }
});

test('window behavior settings and explicit quit reject foreign senders and frames',async()=>{
 const f=fixture();await f.run();
 for(const name of ['window-behavior:read','window-behavior:save','window:quit','window-close:ready','window-close:ack','window-close:respond']) {
   assert.throws(()=>f.ipc.get(name)({sender:{},senderFrame:{}},{closeAction:'tray'}),/Unsupported/);
 }
 const event=vm.runInContext("mainWindow={webContents:{mainFrame:{}}}; ({sender:mainWindow.webContents,senderFrame:mainWindow.webContents.mainFrame})",f.context);
 for(const name of ['window-behavior:read','window-behavior:save','window:quit','window-close:ready','window-close:ack','window-close:respond'])assert.throws(()=>f.ipc.get(name)({...event,senderFrame:{}},{closeAction:'tray'}),/Unsupported/);
 f.ipc.get('window:quit')(event);assert.equal(f.counts().quits,1);
});

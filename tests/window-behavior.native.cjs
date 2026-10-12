// Isolated real Electron window + Windows notification-area tray. No optimizer
// host, accounts, game files, startup registry writes or update downloads.
const {app,BrowserWindow,Tray,Menu}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createWindowBehavior}=require('../electron/window-behavior.cjs');
const directory=process.argv[2];
assert(directory && path.dirname(fs.realpathSync(directory)) === fs.realpathSync(os.tmpdir()) && path.basename(directory).startsWith('synapsex-tray-native-'));
app.setPath('userData',directory);
let controller,window,quits=0,checks=0,prompts=0,menu;
const timeout=setTimeout(()=>{console.error('native tray timeout');app.exit(1);},20000);
app.whenReady().then(async()=>{
  try {
    window=new BrowserWindow({show:false,width:300,height:150,webPreferences:{sandbox:true}});
    await window.loadURL('data:text/html,<title>Isolated tray test</title>');
    const options={directory,Tray,Menu:{buildFromTemplate:items=>{menu=Menu.buildFromTemplate(items);return menu;}},icon:path.resolve(__dirname,'../build/icon.png'),
      openWorkspace:()=>window.show(),checkUpdates:()=>checks++,quit:()=>quits++,isQuitting:()=>false,
      dialog:{showMessageBox:async()=>{prompts++;return {response:0,checkboxChecked:true};},showErrorBox:(_title,message)=>{throw Error(message);}}};
    controller=createWindowBehavior(options);
    const source=fs.readFileSync(path.join(__dirname,'../electron/main.cjs'),'utf8');
    vm.runInNewContext(source.match(/mainWindow\.on\("close",[^\n]+/)[0],{mainWindow:window,shuttingDown:false,windowBehavior:controller});
    window.showInactive();window.close();await new Promise(resolve=>setTimeout(resolve,100));
    assert.equal(window.isDestroyed(),false);assert.equal(window.isVisible(),false);assert.equal(prompts,1);assert.equal(quits,0);
    menu.items.find(item=>item.label==='打开工作台').click();assert.equal(window.isVisible(),true);
    menu.items.find(item=>item.label==='检查更新').click();assert.equal(checks,1);
    window.close();await new Promise(resolve=>setTimeout(resolve,100));assert.equal(prompts,1);assert.equal(window.isVisible(),false);
    menu.items.find(item=>item.label==='退出 SynapseX').click();assert.equal(quits,1);
    const restarted=createWindowBehavior(options);assert.equal(restarted.read().closeAction,'tray');restarted.stop();
    console.log('PASS: real close event hides without destroy; native tray restores window, checks updates, explicitly quits; remembered choice survives restart');
  } finally {
    clearTimeout(timeout);controller?.stop();window?.destroy();
    // Chromium keeps userData files open until process exit. The parent runner
    // validates and removes this temporary directory after the child has exited.
  }
  app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});

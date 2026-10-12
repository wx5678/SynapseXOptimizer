const {app,BrowserWindow,ipcMain,Tray,Menu}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {createWindowBehavior}=require('../electron/window-behavior.cjs');
const {createClosePrompt}=require('../electron/close-prompt.cjs');
const [directory,artifacts]=process.argv.slice(2);
const url=process.env.SYNAPSEX_CLOSE_UI_URL;
assert(directory&&path.dirname(fs.realpathSync(directory))===fs.realpathSync(os.tmpdir())&&path.basename(directory).startsWith('synapsex-close-ui-'));
assert.equal(new URL(url).hostname,'127.0.0.1');app.setPath('userData',directory);
let window,behavior,broker,quits=0,hidden=0,ready=false;const errors=[];
const timeout=setTimeout(()=>app.exit(1),25000);
const wait=async predicate=>{for(let i=0;i<100;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,50));}throw Error('UI condition timed out');};
app.whenReady().then(async()=>{
 try {
  const dialog={showMessageBox:async()=>{throw Error('Unexpected native fallback');},showErrorBox:(_title,message)=>errors.push(message)};
  broker=createClosePrompt({dialog});
  window=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{preload:path.resolve(__dirname,'../electron/preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  const owner=event=>{assert.equal(event.sender,window.webContents);assert.equal(event.senderFrame,window.webContents.mainFrame);};
  ipcMain.handle('window-close:ready',(event,value)=>{owner(event);broker.setReady(event.sender,value);ready=value;});
  ipcMain.handle('window-close:ack',(event,id)=>{owner(event);return broker.acknowledge(event.sender,id);});
  ipcMain.handle('window-close:respond',(event,value)=>{owner(event);return broker.respond(event.sender,value);});
  behavior=createWindowBehavior({directory,dialog,Tray,Menu,icon:path.resolve(__dirname,'../build/icon.png'),openWorkspace:()=>{},checkUpdates:()=>{},quit:()=>quits++,isQuitting:()=>false,confirmClose:(w,o)=>broker.ask(w,o)});
  const target={webContents:window.webContents,isDestroyed:()=>window.isDestroyed(),hide:()=>{hidden++;window.hide();}};
  const js=code=>window.webContents.executeJavaScript(code,true);
  for(const skin of ['dark','light']) {
   ready=false;await window.loadURL(url+'?skin='+skin);await wait(()=>ready);
   await js("document.querySelector('#preview-focus').focus()");
   const request=behavior.requestClose(target);
   await wait(()=>js("!!document.querySelector('.close-window-dialog[open]')"));
   await js("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
   await new Promise(resolve=>setTimeout(resolve,100));
   const rect=await js("(()=>{const d=document.querySelector('.close-window-dialog');const b=d.getBoundingClientRect();return {x:Math.floor(b.x)-8,y:Math.floor(b.y)-8,width:Math.ceil(b.width)+16,height:Math.ceil(b.height)+16,overflow:d.scrollWidth>d.clientWidth};})()");
   assert.equal(rect.overflow,false);delete rect.overflow;
   fs.mkdirSync(artifacts,{recursive:true});fs.writeFileSync(path.join(artifacts,`close-dialog-${skin}.png`),(await window.webContents.capturePage(rect)).toPNG());
   if(skin==='dark') {
     window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
     await request;await wait(()=>js("!document.querySelector('.close-window-dialog[open]')"));
     assert.equal(hidden,0);assert.equal(quits,0);assert.equal(behavior.read().closeAction,'ask');
     assert.equal(await js("document.activeElement.id"),'preview-focus');
   } else {
     await js("document.querySelector('.close-window-preference input').click();document.querySelector('.close-window-dialog footer .prism-button-primary').click()");
     await request;await wait(()=>js("!document.querySelector('.close-window-dialog[open]')"));assert.equal(hidden,1);assert.equal(behavior.read().closeAction,'tray');
   }
  }
  await behavior.requestClose(target);assert.equal(hidden,2);
  behavior.save({closeAction:'ask'});const last=behavior.requestClose(target);await wait(()=>js("!!document.querySelector('.close-window-dialog[open]')"));
  await js("document.querySelector('input[value=quit]').click();document.querySelector('.close-window-preference input').click()");
  assert.equal(await js("document.querySelector('.close-window-dialog footer .prism-button-primary').textContent"),'退出软件');
  await js("document.querySelector('.close-window-dialog footer .prism-button-primary').click()");await last;
  assert.equal(quits,1);assert.equal(behavior.read().closeAction,'quit');assert.deepEqual(errors,[]);
  console.log('PASS: real preload/IPC + React dialog, dark/light layout, Escape cancel/focus restore, remember tray, explicit quit; screenshots captured');
 } finally {clearTimeout(timeout);broker?.stop();behavior?.stop();window?.destroy();}
 app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});

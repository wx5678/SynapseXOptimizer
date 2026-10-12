const {app,BrowserWindow,ipcMain}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createWindowEffects}=require('../electron/window-effects.cjs');
app.setPath('userData',process.argv[2]);const url=process.env.SYNAPSEX_LIGHTS_UI_URL;assert.equal(new URL(url).hostname,'127.0.0.1');
let window,fx,ready=false;const timer=setTimeout(()=>app.exit(1),35000);
const wait=async fn=>{for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI timeout');};
app.whenReady().then(async()=>{try{
 window=new BrowserWindow({show:false,width:1000,height:680,webPreferences:{preload:path.resolve(__dirname,'../electron/preload.cjs'),sandbox:true,contextIsolation:true,backgroundThrottling:false,offscreen:true}});
 const target={webContents:window.webContents,isDestroyed:()=>window.isDestroyed(),isVisible:()=>true,isMinimized:()=>false};
 // Allow deliberate paused frame capture; production 650ms fallback is unit tested.
 fx=createWindowEffects({setTimer:fn=>setTimeout(fn,5000)});let acknowledgements=0;
 const owner=event=>{assert.equal(event.sender,window.webContents);assert.equal(event.senderFrame,window.webContents.mainFrame);};
 ipcMain.handle('window-effects:ready',(event,value)=>{owner(event);ready=value;fx.setReady(target,value);});
 ipcMain.handle('window-effects:complete',(event,id)=>{owner(event);const accepted=fx.complete(event.sender,id);if(accepted)acknowledgements++;return accepted;});
 ipcMain.handle('appearance:save',()=>({}));
 const js=code=>window.webContents.executeJavaScript(code,true),active=()=>js(`document.querySelector('.window-light-effect').matches(':popover-open')`);
 const load=async query=>{ready=false;await window.loadURL(url+query);await wait(()=>ready);await new Promise(r=>setTimeout(r,350));};
 const artifacts=path.resolve(__dirname,'../design-evidence/window-lights-0.39.26');fs.mkdirSync(artifacts,{recursive:true});
 for(const skin of ['dark','light']){
  await load('?skin='+skin);await wait(async()=>!await active());
  await js(`document.querySelector('#focus-target').focus()`);fx.enter(target);await wait(active);
  await js(`document.querySelector('.window-light-effect').getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=75;})`);
  await new Promise(r=>setTimeout(r,100));
  assert.equal(await js(`document.querySelector('.window-light-effect').getAnimations({subtree:true}).length`),4);
  assert.equal(await js(`document.activeElement.id`),'focus-target');
  fs.writeFileSync(path.join(artifacts,`${skin}-enter-75ms.png`),(await window.webContents.capturePage()).toPNG());
  await js(`document.querySelector('.window-light-effect').getAnimations({subtree:true}).forEach(a=>a.finish())`);await wait(async()=>!await active());
  const acknowledgedBefore=acknowledgements,exit=fx.leave(target,'quit');await wait(active);
  await js(`document.querySelector('.window-light-effect').getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=110;})`);
  await new Promise(r=>setTimeout(r,100));
  fs.writeFileSync(path.join(artifacts,`${skin}-exit-110ms.png`),(await window.webContents.capturePage()).toPNG());
  await js(`document.querySelector('.window-light-effect').getAnimations({subtree:true}).forEach(a=>a.finish())`);assert.equal(await exit,true);
  assert.equal(acknowledgements,acknowledgedBefore+1);
  assert.equal(await active(),true); // Keep dark until native hide/exit; no bright flash.
  fx.enter(target);await wait(async()=>!await active());
  const tray=fx.leave(target,'tray');await wait(active);fx.cancelHide(target);assert.equal(await tray,false);await wait(async()=>!await active());
 }
 for(const mode of ['off','game','reduced']){
  await load('?'+mode+'=1');const exit=fx.leave(target,'quit');
  if(mode==='reduced'){await wait(active);assert.equal(await js(`document.querySelector('.window-light-effect').getAnimations({subtree:true}).length`),1);}
  assert.equal(await exit,true);if(mode!=='reduced')assert.equal(await active(),false);
 }
 await load('');await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);const keyboard=fx.leave(target,'quit');assert.equal(await keyboard,true);assert.equal(await active(),false);
 console.log('PASS: lights real preload/IPC, dark/light entry and exit, no focus theft or exit flash, tray reversal, disabled/game/keyboard bypass, reduced-motion fade; screenshots captured');
}finally{clearTimeout(timer);fx?.stop();window?.destroy();}app.exit(0);}).catch(e=>{console.error(e);app.exit(1);});

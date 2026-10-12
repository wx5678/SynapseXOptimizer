const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {createSensorPrompt}=require('../electron/sensor-prompt.cjs');
const [dir,artifacts]=process.argv.slice(2),url=process.env.SYNAPSEX_SENSOR_UI_URL;
assert.equal(path.dirname(fs.realpathSync(dir)),fs.realpathSync(os.tmpdir()));assert(path.basename(dir).startsWith('synapsex-sensor-ui-'));assert.equal(new URL(url).hostname,'127.0.0.1');app.setPath('userData',dir);
const timeout=setTimeout(()=>app.exit(1),25000);let window,broker,ready=false;
const wait=async predicate=>{for(let n=0;n<100;n++){if(await predicate())return;await new Promise(r=>setTimeout(r,40));}throw Error('UI timeout');};
app.whenReady().then(async()=>{
 try{
  broker=createSensorPrompt();window=new BrowserWindow({show:false,width:1000,height:820,webPreferences:{offscreen:true,preload:path.resolve(__dirname,'../electron/preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  const owner=e=>{assert.equal(e.sender,window.webContents);assert.equal(e.senderFrame,window.webContents.mainFrame);};
  ipcMain.handle('sensor-prompt:ready',(e,v)=>{owner(e);broker.setReady(e.sender,v);ready=v;});
  ipcMain.handle('sensor-prompt:ack',(e,id)=>{owner(e);return broker.acknowledge(e.sender,id);});
  ipcMain.handle('sensor-prompt:respond',(e,v)=>{owner(e);return broker.respond(e.sender,v);});
  const js=code=>window.webContents.executeJavaScript(code,true);
  for(const skin of ['dark','light']){
   ready=false;await window.loadURL(url+'?skin='+skin);await wait(()=>ready);
   await js("document.querySelector('#preview-focus').focus()");const p=broker.ask(window);
   await wait(()=>js("!!document.querySelector('.sensor-install-dialog[open]')"));await new Promise(r=>setTimeout(r,150));
   assert.equal(await js("document.activeElement.textContent"),'暂不安装');
   assert.equal(await js("document.querySelector('.sensor-install-package strong').textContent"),'PawnIO 2.2.0');
   assert.equal(await js("document.querySelector('.sensor-install-dialog').scrollWidth>document.querySelector('.sensor-install-dialog').clientWidth"),false);
   fs.mkdirSync(artifacts,{recursive:true});fs.writeFileSync(path.join(artifacts,`sensor-${skin}.png`),(await window.webContents.capturePage()).toPNG());
   if(skin==='dark'){window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});}
   else await js("document.querySelector('.close-window-dismiss').click()");
   assert.equal(await p,false);await wait(()=>js("!document.querySelector('dialog[open]')"));assert.equal(await js("document.activeElement.id"),'preview-focus');
  }
  window.setSize(480,640);const p=broker.ask(window);await wait(()=>js("!!document.querySelector('dialog[open]')"));
  assert.equal(await js("document.querySelector('dialog').scrollWidth>document.querySelector('dialog').clientWidth"),false);
  await js("document.querySelector('dialog footer .prism-button-primary').click();document.querySelector('dialog footer .prism-button-primary').click()");assert.equal(await p,true);
  const cancelled=broker.ask(window);await wait(()=>js("!!document.querySelector('dialog[open]')"));await js("document.querySelector('dialog footer .prism-button-secondary').click()");assert.equal(await cancelled,false);
  console.log('PASS: dark/light screenshots, narrow layout, cancel focus, Escape/X/cancel and explicit consent; no installer invoked');
 }finally{clearTimeout(timeout);broker?.stop();window?.destroy();}app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});

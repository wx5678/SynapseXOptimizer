const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const library=require('../host/nvidia-library/catalog.json');
const [dir,artifacts]=process.argv.slice(2),url=process.env.SYNAPSEX_NIP_UI_URL;
assert.equal(path.dirname(fs.realpathSync(dir)),fs.realpathSync(os.tmpdir()));assert(path.basename(dir).startsWith('synapsex-nip-ui-'));assert.equal(new URL(url).hostname,'127.0.0.1');app.setPath('userData',dir);
const timeout=setTimeout(()=>app.exit(1),30000);let window,applied=0,restored=0,picked=0,failPreview=false;
const wait=async predicate=>{for(let n=0;n<120;n++){if(await predicate())return;await new Promise(r=>setTimeout(r,40));}throw Error('UI timeout');};
app.whenReady().then(async()=>{
 try{
  window=new BrowserWindow({show:false,width:1260,height:1040,webPreferences:{offscreen:true,preload:path.resolve(__dirname,'../electron/preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  const owner=e=>{assert.equal(e.sender,window.webContents);assert.equal(e.senderFrame,window.webContents.mainFrame);};
  ipcMain.handle('dialog:select-nvidia-nip',e=>{owner(e);picked++;return 'D:\\配置\\自选.nip';});
  ipcMain.handle('host:request',(e,r)=>{
   owner(e);const b=JSON.parse(r.body||'{}');
   if(r.path.endsWith('/library'))return {items:library.items,backups:applied?[{id:'nip-mock-backup',createdAt:'2026-09-22 15:00:00'}]:[]};
   if(r.path.endsWith('/preview')){
    if(failPreview)throw Error('NVIDIA 驱动接口暂不可用，请重新读取');
    assert(b.id||b.filePath);const item=library.items.find(x=>x.id===b.id)||{id:'local-file',name:'自选.nip'};
    const names=['Power management mode','Shader cache','Preferred OpenGL GPU','Unknown legacy parameter'];
    return {token:'mock-preview',name:item.name,scope:'全局 · Base Profile',hash:item.id,total:4,changed:1,skipped:2,rows:names.map((name,i)=>({before:{id:i+1,name:'',type:'Dword',value:'0',supported:i!==3,local:true,nativeType:0},target:{id:i+1,name,type:'Dword',value:i===1?'0':'1',supported:true,local:true,nativeType:0},changed:i===0,reason:i===2?'来源电脑的 GPU 绑定标识，禁止跨电脑导入':i===3?'当前驱动不可读取此项，跳过':''}))};
   }
   if(r.path.endsWith('/apply')){assert.equal(b.confirmation,'APPLY');assert.equal(b.acceptGlobal,true);assert.equal(b.token,'mock-preview');applied++;return {ok:true,changed:1,skipped:2,backupId:'nip-mock-backup',name:'mock'};}
   if(r.path.endsWith('/restore')){assert.equal(b.confirmation,'RESTORE');assert.equal(b.backupId,'nip-mock-backup');restored++;return {ok:true,changed:1,backupId:b.backupId,name:'mock'};}
   throw Error('Unexpected route '+r.path);
  });
  const js=code=>window.webContents.executeJavaScript(code,true);
  const click=async text=>{await wait(()=>js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});return b&&!b.disabled;})()`));return js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});b.focus();b.click();})()`);};
  const choose=index=>js(`(()=>{const s=document.querySelector('select');s.value=s.options[${index}].value;s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  for(const skin of ['dark','light']){
   await window.loadURL(url+'?skin='+skin);await wait(()=>js("document.querySelector('select')?.options.length===9"));
   await choose(1);await click('读取并预览差异');await wait(()=>js("!!document.querySelector('input[type=checkbox]')"));
   assert.equal(await js("document.querySelector('section .prism-button-primary').disabled"),true);
   await js("document.querySelector('input[type=checkbox]').click()");await wait(()=>js("!document.querySelector('section .prism-button-primary').disabled"));
   await new Promise(r=>setTimeout(r,100));fs.mkdirSync(artifacts,{recursive:true});fs.writeFileSync(path.join(artifacts,`nip-${skin}.png`),(await window.webContents.capturePage()).toPNG());
   const before=applied;await click('备份并导入差异');await wait(()=>js("!!document.querySelector('[role=alertdialog]')"));await click('取消');await wait(()=>js("!document.querySelector('[role=alertdialog]')"));assert.equal(applied,before);
   await click('备份并导入差异');await wait(()=>js("!!document.querySelector('[role=alertdialog]')"));await click('备份并继续');await wait(()=>applied===before+1);await wait(()=>js("document.body.innerText.includes('已应用 1 项')"));
   const priorRestored=restored;await click('恢复所选备份');await wait(()=>js("!!document.querySelector('[role=alertdialog]')"));await click('备份并继续');await wait(()=>restored===priorRestored+1);await wait(()=>js("document.body.innerText.includes('已恢复')"));
   await click('选择 .nip 文件');await wait(()=>js("document.body.innerText.includes('自选.nip')"));assert.equal(await js("document.querySelector('select').value"),'');
   await click('读取并预览差异');await wait(()=>js("!!document.querySelector('input[type=checkbox]')"));assert.equal(await js("document.querySelector('input[type=checkbox]').checked"),false);
   await choose(2);await wait(()=>js("!document.querySelector('input[type=checkbox]')"));
   failPreview=true;await click('读取并预览差异');await wait(()=>js("document.querySelector('[role=alert]')?.textContent.includes('驱动接口暂不可用')"));failPreview=false;
  }
  window.setSize(500,960);await window.loadURL(url+'?skin=light');await wait(()=>js("document.querySelector('select')?.options.length===9"));await choose(1);await click('读取并预览差异');await wait(()=>js("!!document.querySelector('input[type=checkbox]')"));
  assert.equal(await js("document.documentElement.scrollWidth>document.documentElement.clientWidth"),false);
  fs.writeFileSync(path.join(artifacts,'nip-narrow.png'),(await window.webContents.capturePage()).toPNG());
  assert.equal(applied,2);assert.equal(restored,2);assert.equal(picked,2);
  console.log('PASS: 8 choices, real preload IPC, file selection, preview, consent/cancel/confirm, apply/restore mock, stale selection reset, driver error and themes/narrow layout; real driver writes=0');
 }finally{clearTimeout(timeout);window?.destroy();}app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});

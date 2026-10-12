// Isolated Electron smoke: public endpoints + official login load only. Never sign.
const {app,BrowserWindow,session,safeStorage}=require('electron');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createCommunitySignin}=require('../electron/community-signin.cjs');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'synapsex-signin-smoke-'));
app.setPath('userData',directory);
let loaded;
const loginLoaded=new Promise(resolve=>{loaded=resolve;});
class HiddenWindow extends BrowserWindow {
  constructor(options) {
    super({...options,show:false});
    this.webContents.on('did-finish-load',()=>{const url=this.webContents.getURL(); if(url.startsWith('https://sso.woniu.com/')) loaded({title:this.getTitle(),urlHost:new URL(url).hostname});});
    this.webContents.on('did-fail-load',(_event,code,_desc,_url,main)=>{if(main&&code!==-3)loaded({error:code});});
  }
}
app.whenReady().then(async()=>{
  let service;
  try {
    service=createCommunitySignin({app,BrowserWindow:HiddenWindow,session,safeStorage,getMainWindow:()=>undefined});
    const status=await service.state();
    const options=await service.catalog();
    if(status.loggedIn) throw new Error('Unexpected logged-in test profile');
    if(!options.groups.length||!options.servers.length) throw new Error('Empty official catalog');
    const sample='synthetic-encryption-test';
    const encryption= safeStorage.isEncryptionAvailable() && safeStorage.decryptString(safeStorage.encryptString(sample))===sample;
    await service.openLogin();
    const page=await Promise.race([loginLoaded,new Promise(resolve=>setTimeout(()=>resolve({error:'load timeout'}),30000))]);
    console.log(JSON.stringify({notLoggedIn:!status.loggedIn,groups:options.groups.length,servers:options.servers.length,encryption,officialLogin:page,signRequests:0}));
    if(page.error || !encryption) process.exitCode=1;
  } catch(e) {console.error(e.message);process.exitCode=1;}
  finally {await service?.shutdown();app.exit(process.exitCode||0);}
});

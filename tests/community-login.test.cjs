const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {EventEmitter}=require('node:events');
const {createCommunitySignin,LOGIN}=require('../electron/community-signin.cjs');
const {loginStatusPage}=require('../electron/community-login-page.cjs');
test('login name is received only from the main official login frame, after submit and successful verification',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'synapsex-login-test-'));
 const ipcMain=new EventEmitter(),cookies=new EventEmitter();let hook,win,logged=false,cleared=0;
 cookies.get=async()=>[];cookies.set=async()=>{};cookies.flushStore=async()=>{};
 const ses={cookies,on(){},setPermissionRequestHandler(){},setPermissionCheckHandler(){},webRequest:{onBeforeRequest(_filter,handler){hook=handler;}},clearStorageData:async()=>{cleared++;},flushStorageData(){},fetch:async()=>({ok:true,text:async()=>JSON.stringify({msgcode:logged?'1':'4028',list:[]})})};
 class Window extends EventEmitter {
   constructor(options){super();this.options=options;this.webContents=new EventEmitter();this.webContents.mainFrame={url:LOGIN};this.webContents.setWindowOpenHandler=()=>{};this.webContents.getURL=()=>this.url;this.webContents.executeJavaScript=async()=>false;win=this;}
   async loadURL(url){this.url=url;}
   isDestroyed(){return !!this.destroyed;}
   destroy(){this.destroyed=true;this.emit('closed');}
 }
 const s=createCommunitySignin({app:{getPath:()=>directory},BrowserWindow:Window,session:{fromPartition:()=>ses},ipcMain,safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()},getMainWindow:()=>null,onLoginVerified:async()=>{throw new Error('test sync failure');}});
 try {
   await s.openLogin();assert.equal(cleared,1);assert.equal(win.url,LOGIN);
   const good={sender:win.webContents,senderFrame:win.webContents.mainFrame};
   ipcMain.emit('community:login-name',{sender:{},senderFrame:good.senderFrame},'bad');
   hook({url:LOGIN,method:'POST',resourceType:'mainFrame'},()=>{});
   logged=true;assert.equal((await s.state({fromLoginWindow:true})).accountName,'');
   ipcMain.emit('community:login-name',good,'real_account');
   logged=false;hook({url:LOGIN,method:'POST',resourceType:'mainFrame'},()=>{});
   assert.equal((await s.state({fromLoginWindow:true})).accountName,'');
   // Non-blank MFA page on the same SSO host must retain the submitted name.
   await win.webContents.listeners('did-finish-load')[0]();
   logged=true;assert.equal((await s.state({fromLoginWindow:true})).accountName,'real_account');
   win.webContents.emit('did-fail-load',{},-2,'test failure','',true);
   assert.equal(s.loginError(),''); // Late page errors cannot replace confirmed login.
   assert.equal((await s.state({fromLoginWindow:true})).windowError,'');assert.equal(s.loginError(),'');
   win.url='https://9yin.woniu.com/m/static/act/202205/siginIn/';
   await win.webContents.listeners('did-finish-load')[0]();
   assert.match(decodeURIComponent(win.url),/官方已确认登录，账号列表同步尚未完成/);
   assert.equal(s.loginError(),'');
   await s.openLogin();assert.equal(cleared,2);assert.equal((await s.state()).accountName,'');
 }finally{await s.shutdown();assert.equal(ipcMain.listenerCount('community:login-name'),0);fs.rmSync(directory,{recursive:true,force:true});}
});
test('login failures have readable local feedback and escaped text, not a blank page',()=>{
 const html=decodeURIComponent(loginStatusPage('error','<script>unsafe</script>',LOGIN).split(',').slice(1).join(','));
 assert.match(html,/重新加载官方登录/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>unsafe/);
 assert.match(decodeURIComponent(loginStatusPage('success','完成',LOGIN)),/官方登录已完成/);
});
test('global reminder is outside menu-scrolled content and uses one shared local snapshot poll',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../src/App.tsx'),'utf8');
 assert.equal((app.match(/<GlobalSigninReminder/g)||[]).length,1);
 assert.match(app,/<div className="global-signin-dock">\s*<GlobalSigninReminder/);
 assert.doesNotMatch(app.match(/const navigationGroups = \[[\s\S]*?\];/)[0],/"signin"/);
 assert.match(app,/navigation\s*\.filter\(\(item\) => item.id !== "signin"\)/);
 assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../src/components/WorkbenchDashboard.tsx'),'utf8'),/CommunitySigninSummary/);
 const store=fs.readFileSync(path.join(__dirname,'../src/lib/communityAccounts.ts'),'utf8');
 assert.equal((store.match(/setInterval/g)||[]).length,1);
 assert.match(store,/useSyncExternalStore/);assert.doesNotMatch(store,/refreshAccounts\(/);
});

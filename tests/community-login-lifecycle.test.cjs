const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{EventEmitter}=require('node:events');
const {createCommunitySignin,LOGIN}=require('../electron/community-signin.cjs');
const ACTIVITY='https://9yin.woniu.com/m/static/act/202205/siginIn/';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'synapsex-login-lifecycle-'));
 const cookies=new EventEmitter();cookies.get=async()=>[];cookies.flushStore=async()=>{};
 const control={code:'1',calls:0,synced:0,windows:[],gate:null,domFail:false,initialAbort:false};
 const ses={cookies,on(){},setPermissionRequestHandler(){},setPermissionCheckHandler(){},flushStorageData(){},clearStorageData:async()=>{},clearCache:async()=>{},webRequest:{onBeforeRequest(){}},fetch:async()=>{
  control.calls++;const code=control.code;if(control.gate)await control.gate.promise;
  return {ok:true,text:async()=>JSON.stringify({msgcode:code,list:[]})};
 }};
 class Window extends EventEmitter{
  constructor(){super();control.windows.push(this);this.loads=[];this.webContents=new EventEmitter();this.webContents.getURL=()=>this.url;this.webContents.mainFrame={url:LOGIN};this.webContents.setWindowOpenHandler=()=>{};this.webContents.executeJavaScript=async()=>{if(control.domFail)throw Error('DOM navigation race');return false;};}
  async loadURL(url){this.url=url;this.loads.push(url);if(url===LOGIN&&control.initialAbort)throw Object.assign(Error('redirect aborted'),{code:'ERR_ABORTED'});}
  isDestroyed(){return !!this.destroyed;}
  destroy(){this.destroyed=true;this.emit('closed');}
  finish(){return this.webContents.listeners('did-finish-load')[0]();}
 }
 const service=createCommunitySignin({app:{getPath:()=>dir},session:{fromPartition:()=>ses},BrowserWindow:Window,safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s)},activityScheduler:fn=>fn(),getMainWindow:()=>null,onLoginVerified:async()=>{control.synced++;}});
 return {control,service,open:async()=>{await service.openLogin();return control.windows.at(-1);},cleanup:async()=>{control.gate?.resolve();await service.shutdown();fs.rmSync(dir,{recursive:true,force:true});}};
}
test('duplicate completion events verify once, sync once, close once; late failures stay silent',async()=>{
 const f=fixture();try{
  const w=await f.open();w.url=ACTIVITY;f.control.gate=deferred();
  const a=w.finish(),b=w.finish();assert.equal(a,b);f.control.gate.resolve();await Promise.all([a,b]);
  assert.equal(f.control.calls,1);assert.equal(f.control.synced,1);assert.equal(w.isDestroyed(),true);assert.equal(f.service.loginIsOpen(),false);
  const loads=w.loads.length;w.webContents.emit('did-fail-load',{},-2,'late',ACTIVITY,true);await w.finish();
  assert.equal(w.loads.length,loads);assert.equal(f.service.loginError(),'');assert.equal(f.control.windows.length,1);
 }finally{await f.cleanup();}
});
test('throttled confirmation is pending, not failed login; manual refresh recovers without clearing session',async()=>{
 const f=fixture();try{
  f.control.code='4026';const w=await f.open();w.url=ACTIVITY;await w.finish();
  const html=decodeURIComponent(w.url);assert.match(html,/登录状态待确认/);assert.doesNotMatch(html,/重新加载官方登录|登录页面未能正常打开/);
  const n=f.control.calls;await w.finish();assert.equal(f.control.calls,n);
  f.control.code='1';const state=await f.service.state();assert.equal(state.loggedIn,true);assert.equal(state.loginOpen,false);assert.equal(w.isDestroyed(),true);assert.equal(f.service.loginError(),'');
 }finally{await f.cleanup();}
});
test('old-window verification cannot display status over a new attempt',async()=>{
 const f=fixture();try{
  f.control.code='4026';const old=await f.open();old.url=ACTIVITY;f.control.gate=deferred();const work=old.finish();
  await new Promise(r=>setImmediate(r));const next=await f.open();const loads=next.loads.length;
  f.control.gate.resolve();await work;assert.equal(next.loads.length,loads);assert.equal(next.url,LOGIN);assert.equal(f.service.loginError(),'');
 }finally{await f.cleanup();}
});
test('aborted redirect and DOM inspection failure do not misclassify a verified callback',async()=>{
 const f=fixture();try{
  f.control.initialAbort=true;const w=await f.open();await new Promise(r=>setImmediate(r));assert.equal(f.service.loginError(),'');
  f.control.domFail=true;w.url=ACTIVITY;await w.finish();assert.equal(w.isDestroyed(),true);assert.equal(f.control.synced,1);
 }finally{await f.cleanup();}
});

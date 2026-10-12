const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCommunityAccounts, chinaDay, alreadyToday } = require('../electron/community-accounts.cjs');
const { createCommunitySignin } = require('../electron/community-signin.cjs');
const { EventEmitter } = require('node:events');

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'synapsex-accounts-'));
  const data = new Map(), calls = [], profiles = [], verified = new Map();
  let time = new Date('2026-09-14T02:00:00Z');
  let limit = 3;
  const factory = ({profileId,onLoginVerified}) => {
    verified.set(profileId,onLoginVerified);
    profiles.push(profileId);
    if (!data.has(profileId)) data.set(profileId, {loggedIn:true, days:4, opened:false, choice:{serverId:'2',groupId:'1',optionKey:'["1","2","月明沧海"]'}});
    const row = data.get(profileId);
    return {
      state: async () => { if (row.failRefresh) throw new Error('官方查询失败'); return {loggedIn:row.loggedIn, accountName:row.accountName || '', choice:row.choice, checkedAt:time.toISOString(), loginOpen:row.opened, records:[{serverId:'2', days:row.days}], lastResult:null}; },
      sign: async () => { calls.push(profileId); if (row.wait) await row.wait; if (row.fail) throw new Error('官方请求超时'); row.days++; return {success:!row.message, message:row.message || '签到成功',code:row.message?'9':'1',at:time.toISOString(),serverId:'2'}; },
      catalog: async () => ({groups:[],servers:[]}),
      selectServer: async value => { row.choice = {serverId:value.serverId,groupId:value.groupId,optionKey:value.optionKey}; },
      openLogin: async () => { row.opened = true; }, loginIsOpen: () => row.opened, loginError: () => row.windowError || '',
      forget: async () => {row.loggedIn=false; row.opened=false;}, shutdown: async () => {},
    };
  };
  const make = () => createCommunityAccounts({app:{getPath:()=>directory},getAccountLimit:()=>limit}, factory, () => time);
  const service = make();
  return {directory, service, data, calls, profiles, verified, make, setLimit:value=>{limit=value}, nextDay:() => {time = new Date(time.getTime()+86400000);}, cleanup:async () => { await service.shutdown(); fs.rmSync(directory,{recursive:true,force:true}); }};
}
const input = ids => ({confirm:'sign-selected-accounts', accountIds:ids});
test('free one, VIP three; downgrade preserves excess accounts but blocks their execution',async()=>{
  const f=fixture();try{
    f.setLimit(1);await assert.rejects(f.service.addAccount({name:'extra'}),/1/);
    f.setLimit(3);const second=await f.service.addAccount({name:'second'});const third=await f.service.addAccount({name:'third'});
    await assert.rejects(f.service.addAccount({name:'fourth'}),/3/);
    f.setLimit(1);assert.equal(f.service.accounts().accounts.length,3);
    await assert.rejects(f.service.openLogin({accountId:second.accountId}),/额度|可使用/);
    await f.service.batch(input(['legacy',second.accountId,third.accountId]));
    assert.deepEqual(f.calls,['legacy']);
    assert.equal(f.service.accounts().accounts.filter(a=>/超出/.test(a.error)).length,2);
  }finally{await f.cleanup()}
});

test('refresh alone restores today proof and cannot resurrect a cleared login-window error',async()=>{
 const f=fixture();let restarted;try{
  await f.service.startup();
  const file=path.join(f.directory,'community-signin/accounts.json');
  const saved=JSON.parse(fs.readFileSync(file,'utf8'));
  saved.accounts[0].state.windowError='登录结果未能确认，请关闭窗口并在软件中刷新状态。';
  saved.accounts[0].state.lastResult={success:false,message:'您今日已经签到过了',at:'2026-09-14T01:00:00Z',serverId:'2'};
  saved.accounts[0].receipt=null;
  fs.writeFileSync(file,JSON.stringify(saved));
  restarted=f.make();
  assert.equal(restarted.accounts().accounts[0].state.windowError,'');
  await restarted.refreshAccounts();
  const row=restarted.accounts().accounts[0];
  assert.equal(row.status,'signed');assert.equal(row.receipt.date,'2026-09-14');
  assert.equal(row.state.windowError || '','');assert.equal(f.calls.length,0);
  f.nextDay();assert.equal(restarted.accounts().accounts[0].status,'pending');
 }finally{await restarted?.shutdown();await f.cleanup();}
});

test('verified re-login updates the shared snapshot and restores only the same identity receipt',async()=>{
 const f=fixture();try{
  await f.service.startup(); f.data.get('legacy').accountName='same_account';await f.service.refreshAccounts();
  await f.service.batch(input(['legacy']));
  await f.service.openLogin({accountId:'legacy'});
  assert.equal(f.service.accounts().accounts[0].receipt,null);
  const next={loggedIn:true,accountName:'same_account',choice:f.data.get('legacy').choice,records:[],checkedAt:'2026-09-14T03:00:00Z',lastResult:null};
  await f.verified.get('legacy')(next);
  assert.equal(f.service.accounts().accounts[0].status,'signed');
  await f.service.openLogin({accountId:'legacy'});
  await f.verified.get('legacy')({...next,accountName:'different_account'});
  assert.equal(f.service.accounts().accounts[0].receipt,null);
 }finally{await f.cleanup();}
});

test('stale login completion cannot overwrite a newer account attempt',async()=>{
 const f=fixture();try{
  await f.service.startup();await f.service.openLogin({accountId:'legacy'});
  const old={loggedIn:true,accountName:'old_identity',choice:f.data.get('legacy').choice,records:[],checkedAt:'2026-09-14T03:00:00Z',lastResult:null};
  await f.verified.get('legacy')(old,()=>false);
  assert.equal(f.service.accounts().accounts[0].accountName,'');
  assert.equal(f.service.accounts().accounts[0].state.loggedIn,false);
 }finally{await f.cleanup();}
});

test('a failed status refresh preserves confirmed sign-in and login state',async()=>{
 const f=fixture();try{
  await f.service.startup();await f.service.batch(input(['legacy']));
  f.data.get('legacy').failRefresh=true;await f.service.refreshAccounts();
  const row=f.service.accounts().accounts[0];assert.equal(row.status,'signed');assert.equal(row.state.loggedIn,true);
 }finally{await f.cleanup();}
});
test('remarks are optional and separate from verified login names; expired auth preserves daily proof',async()=>{
 const f=fixture();try {
   await f.service.startup();
   assert.equal(f.service.accounts().accounts[0].name,'');
   f.data.get('legacy').accountName='sample_login';
   await f.service.refreshAccounts();
   await f.service.updateAccount({accountId:'legacy',name:'主号'});
   await f.service.batch(input(['legacy']));
   f.data.get('legacy').loggedIn=false;
   await f.service.refreshAccounts();
   const row=f.service.accounts().accounts[0];
   assert.equal(row.status,'signed');assert.equal(row.accountName,'sample_login');assert.equal(row.name,'主号');
   assert.equal(row.state.records[0].days,5);
   await f.service.updateAccount({accountId:'legacy',name:''});
   assert.equal(f.service.accounts().accounts[0].name,'');
   const added=await f.service.addAccount({name:''});assert.ok(added.accountId);
 }finally{await f.cleanup();}
});
test('China date boundary and today-only confirmations do not infer status from accumulated days', () => {
  assert.equal(chinaDay('2026-09-14T15:59:59Z'),'2026-09-14');
  assert.equal(chinaDay('2026-09-14T16:00:00Z'),'2026-09-15');
  assert.equal(alreadyToday('您今天已经签到，请明天再来'),true);
  assert.equal(alreadyToday('昨日已经签到'),false);
  assert.equal(alreadyToday('签到失败'),false);
});
test('default is opt-out; independent accounts persist names and automatic participation',async()=>{
  const f=fixture(); try {
    await f.service.startup(); assert.equal(f.calls.length,0);
    const a=await f.service.addAccount({name:' 小号 '});
    assert.notEqual(a.accountId,'legacy');
    await f.service.updateAccount({accountId:a.accountId,enabled:false,name:'小号二'});
    const b=f.make(); const rows=b.accounts().accounts;
    assert.equal(rows.length,2); assert.equal(rows[1].name,'小号二'); assert.equal(rows[1].enabled,false);
    await assert.rejects(b.settings({autoSign:true}),/确认/);
    await b.shutdown();
  } finally {await f.cleanup();}
});
test('batch is sequential, isolates login failures, refreshes totals, persists receipt and skips repeats',async()=>{
  const f=fixture(); try {
    const a=await f.service.addAccount({name:'需要验证'}), b=await f.service.addAccount({name:'第二账号'});
    f.service.accounts(); f.data.get(a.accountId).loggedIn=false;
    await f.service.refreshAccounts();
    assert.equal(f.service.accounts().accounts[0].status,'pending');
    await f.service.batch(input(['legacy',a.accountId,b.accountId]));
    assert.deepEqual(f.calls,['legacy',b.accountId]);
    const rows=f.service.accounts().accounts;
    assert.equal(rows[0].status,'signed'); assert.equal(rows[0].state.records[0].days,5);
    assert.equal(rows[1].status,'login'); assert.equal(rows[2].status,'signed');
    const c=f.make(); await c.batch(input(['legacy'])); assert.equal(f.calls.length,2);
    f.nextDay(); assert.equal(c.accounts().accounts[0].status,'pending');
    await c.batch(input(['legacy'])); assert.equal(f.calls.length,3); await c.shutdown();
  } finally {await f.cleanup();}
});
test('uncertain auto submission is not retried on restart; disabled accounts never submit',async()=>{
  const f=fixture(); try {
    const a=await f.service.addAccount({name:'排除账号'});
    await f.service.updateAccount({accountId:a.accountId,enabled:false});
    f.service.accounts(); f.data.get('legacy').fail=true;
    await f.service.settings({autoSign:true,confirm:'enable-startup-sign'});
    await f.service.startup(); await f.service.startup(); assert.deepEqual(f.calls,['legacy']);
    const b=f.make(); await b.startup(); assert.deepEqual(f.calls,['legacy']);
    assert.match(b.accounts().accounts[0].error,/自动尝试过/);
    f.data.get('legacy').fail=false;
    await b.batch(input(['legacy'])); assert.equal(f.calls.length,2);
    await b.shutdown();
  } finally {await f.cleanup();}
});
test('batch rejects mutations and invalid selection, coalesces duplicates and handles open login',async()=>{
  const f=fixture(); try {
    await assert.rejects(f.service.batch(input(['missing'])),/有效账号/);
    await assert.rejects(f.service.batch({accountIds:['legacy']}),/确认/);
    f.service.accounts(); let finish; f.data.get('legacy').wait=new Promise(r=>finish=r);
    const a=f.service.batch(input(['legacy'])); const b=f.service.batch(input(['legacy']));
    assert.equal(a,b); await assert.rejects(f.service.openLogin({accountId:'legacy'}),/处理中/);
    finish(); await a;
    await f.service.openLogin({accountId:'legacy'});
    assert.equal(f.service.accounts().accounts[0].receipt,null);
    await f.service.batch(input(['legacy'])); assert.equal(f.calls.length,1);
  } finally {await f.cleanup();}
});
test('remove erases only that local profile and corrupt index fails closed',async()=>{
  const f=fixture(); try {
    const a=await f.service.addAccount({name:'可移除'});
    await assert.rejects(f.service.removeAccount({accountId:a.accountId}),/确认/);
    await f.service.removeAccount({accountId:a.accountId,confirm:'remove-local-account'});
    assert.deepEqual(f.service.accounts().accounts.map(a=>a.id),['legacy']);
    fs.writeFileSync(path.join(f.directory,'community-signin/accounts.json'),'{broken');
    const b=f.make(); assert.match(b.accounts().storageError,/读取失败/);
    await b.startup(); assert.equal(f.calls.length,0);
    await assert.rejects(b.addAccount({name:'不覆盖'}),/读取失败/); await b.shutdown();
  } finally {await f.cleanup();}
});
test('real sessions use independent encrypted jars and keep legacy partition unchanged',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'synapsex-isolated-'));
  const jars=new Map(), partitions=[];
  const session={fromPartition(name) {
    partitions.push(name); const cookies=new EventEmitter(); let jar=[]; jars.set(name,()=>jar);
    cookies.get=async()=>jar; cookies.set=async c=>jar.push(c); cookies.flushStore=async()=>{};
    return {cookies, setPermissionRequestHandler(){},setPermissionCheckHandler(){},on(){},webRequest:{onBeforeRequest(){}},flushStorageData(){},clearStorageData:async()=>{jar=[];},fetch:async()=>({ok:true,text:async()=>'{"msgcode":"4028"}'})};
  }};
  const base={app:{getPath:()=>dir},session,BrowserWindow:class{},safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:s=>s.toString()},getMainWindow:()=>null};
  const a=createCommunitySignin(base), b=createCommunitySignin({...base,profileId:'12345678-1234-1234-1234-123456789abc'});
  try {
    assert.equal(partitions[0],'persist:synapsex-community-v1'); assert.notEqual(partitions[0],partitions[1]);
    assert.throws(()=>createCommunitySignin({...base,profileId:'../../escape'}));
    await a.state(); await b.state();
    assert.ok(fs.existsSync(path.join(dir,'community-signin/session.bin')));
    assert.ok(fs.existsSync(path.join(dir,'community-signin/accounts/12345678-1234-1234-1234-123456789abc/session.bin')));
    await b.forget({confirm:'forget-local-login'}); assert.ok(fs.existsSync(path.join(dir,'community-signin/session.bin')));
  } finally {await a.shutdown();await b.shutdown();fs.rmSync(dir,{recursive:true,force:true});}
});

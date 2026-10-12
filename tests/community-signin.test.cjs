const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {EventEmitter}=require('node:events');
const {createCommunitySignin,officialUrl,parseResponse,cookieDetails,realmOption}=require('../electron/community-signin.cjs');
test('official URL gate rejects lookalike hosts, credentials, custom schemes and ports',()=>{
  for(const u of ['https://sso.woniu.com/login','http://gwact.woniu.com/passport/ssologin']) assert.equal(officialUrl(u),true);
  for(const u of ['https://woniu.com.evil.test/','https://sso.woniu.com@evil.test/','file:///C:/x','https://sso.woniu.com:8443/','https://evil.test/']) assert.equal(officialUrl(u),false);
});
test('JSONP is parsed as data, never evaluated; expired cookies are not extended',()=>{
  assert.equal(parseResponse('synapsexSignin({"msgcode":"1"});').msgcode,'1');
  assert.throws(()=>parseResponse('synapsexSignin({}); process.exit()'));
  assert.throws(()=>parseResponse('<html>login</html>'));
  const c={domain:'.woniu.com',name:'test',value:'secret',path:'/',secure:true,httpOnly:true,expirationDate:120};
  assert.equal(cookieDetails(c,130),null);
  assert.equal(cookieDetails(c,100).expirationDate,120);
  assert.equal(cookieDetails({...c,domain:'.evil.test'},100),null);
  assert.equal(cookieDetails({...c,expirationDate:undefined},100).expirationDate,undefined);
});
function fixture(directory, realms = [{id:2,isp:1,name:'测试服务器'}]) {
  const cookies=new EventEmitter(); let jar=[],signed=0,logged=true,initCalls=0;
  cookies.get=async()=>jar; cookies.set=async c=>{jar.push({...c,domain:c.domain||new URL(c.url).hostname});}; cookies.flushStore=async()=>{};
  const ses={cookies,setPermissionRequestHandler(){},setPermissionCheckHandler(){},on(){},webRequest:{onBeforeRequest(){}},flushStorageData(){},clearStorageData:async()=>{jar=[];},fetch:async url=>{
    let data;
    if(url.includes('/api/isp')) data={List:[{GROUPID:1,GROUPNAME:'测试分区'}]};
    else if(url.includes('/api/garea')) data={realms};
    else if(url.includes('/sign?')) {assert.ok(realms.some(r=>String(r.id)===new URL(url).searchParams.get('server_id'))); signed++; await new Promise(r=>setImmediate(r)); data={msgcode:'1',msg:'签到成功'};}
    else {initCalls++;data=logged?{msgcode:'1',list:[{server_id:2,days_num:4}]}:{msgcode:'4028',msg:'没有登录'};}
    return {ok:true,text:async()=>JSON.stringify(data)};
  }};
  const service=createCommunitySignin({activityScheduler:task=>task(),app:{getPath:()=>directory},BrowserWindow:class{},session:{fromPartition:p=>{assert.equal(p,'persist:synapsex-community-v1');return ses;}},safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from('encrypted:'+Buffer.from(s).toString('base64')),decryptString:b=>Buffer.from(b.toString().slice(10),'base64').toString()},getMainWindow:()=>null});
  return {service,jar:()=>jar,signed:()=>signed,initCalls:()=>initCalls,setLogged:v=>logged=v,cookies};
}

test('nearby state and sign preflight reuse one query; submission invalidates totals cache',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'synapsex-init-cache-'));
 const f=fixture(directory);try{
  await f.service.selectServer({serverId:'2',groupId:'1'});
  await Promise.all([f.service.state(),f.service.state()]);assert.equal(f.initCalls(),1);
  await f.service.sign({confirm:'sign-selected-server',serverId:'2'});assert.equal(f.initCalls(),1);
  await f.service.state();assert.equal(f.initCalls(),2);
 }finally{await f.service.shutdown();fs.rmSync(directory,{recursive:true,force:true});}
});
test('session snapshot survives service restart and forget removes saved credentials',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'synapsex-signin-test-'));
  try {
    const a=fixture(directory); await a.service.state();
    await a.cookies.set({url:'https://sso.woniu.com/',domain:'sso.woniu.com',hostOnly:true,name:'test-session',value:'test-only-secret',secure:true,httpOnly:true});
    await a.service.shutdown();
    assert.ok(!fs.readFileSync(path.join(directory,'community-signin/session.bin')).includes(Buffer.from('test-only-secret')));
    const b=fixture(directory); await b.service.state(); assert.ok(b.jar().some(c=>c.name==='test-session'));
    await b.service.forget({confirm:'forget-local-login'});
    assert.equal(b.jar().length,0); assert.equal(fs.existsSync(path.join(directory,'community-signin/session.bin')),false);
    await b.service.shutdown();
    const c=fixture(directory); await c.service.state(); assert.equal(c.jar().length,0); await c.service.shutdown();
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
test('sign requires explicit valid selection, rechecks login and coalesces duplicate clicks',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'synapsex-signin-test-'));
  try {
    const a=fixture(directory);
    await assert.rejects(a.service.sign({}),/确认/);
    await assert.rejects(a.service.selectServer({serverId:'999',groupId:'1'}),/官方列表/);
    await a.service.selectServer({serverId:'2',groupId:'1'});
    a.setLogged(false); await assert.rejects(a.service.sign({confirm:'sign-selected-server',serverId:'2'}),/登录已失效/); assert.equal(a.signed(),0);
    a.setLogged(true); const input={confirm:'sign-selected-server',serverId:'2'};
    const results=await Promise.all([a.service.sign(input),a.service.sign(input)]);
    assert.ok(results.every(r=>r.success)); assert.equal(a.signed(),1);
    await a.service.shutdown();
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
test('official window has only the scoped one-way name observer; privileged IPC remains restricted',()=>{
  const code=fs.readFileSync(require.resolve('../electron/community-signin.cjs'),'utf8');
  assert.doesNotMatch(code,/nodeIntegration: true|webSecurity: false|setCertificateVerifyProc|MicroMessenger/);
  assert.match(code,/community-login-observer\.cjs/);
  assert.match(code,/event.sender !== win.webContents/);
  assert.match(code,/event.senderFrame !== win.webContents.mainFrame/);
  const observer=fs.readFileSync(require.resolve('../electron/community-login-observer.cjs'),'utf8');
  assert.match(observer,/getElementById\('username'\)/);
  assert.doesNotMatch(observer,/exposeInMainWorld|\.elements|FormData|querySelectorAll|ipcRenderer\.invoke|executeJavaScript/);
  const main=fs.readFileSync(require.resolve('../electron/main.cjs'),'utf8');
  assert.match(main,/requireMain\(event\); if\(\['batch','addAccount','openLogin','selectServer'\]\.includes\(method\)\)product.requireAccess\(\); return getSignin\(\)\[method\]\(value\)/);
});
test('same-ID aliases remain distinct, persist across restart and submit the official ID',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'synapsex-signin-test-'));
  const realms=[{id:7100587,isp:270,name:'龙行天下'},{id:7100587,isp:270,name:'月明沧海'},{id:7100587,isp:270,name:'霜晨月'},{id:7100587,isp:271,name:'另一分区'}];
  try {
    const a=fixture(directory,[...realms,realms[0]]);
    const options=await a.service.catalog();
    assert.equal(options.servers.length,4);
    assert.equal(new Set(options.servers.map(s=>s.optionKey)).size,4);
    await assert.rejects(a.service.selectServer({serverId:'7100587',groupId:'270'}),/官方列表/);
    for (const name of ['月明沧海','霜晨月','龙行天下','月明沧海']) {
      const selected=options.servers.find(s=>s.name===name);
      const choice=await a.service.selectServer({serverId:selected.id,groupId:selected.groupId,optionKey:selected.optionKey});
      assert.equal(options.servers.find(s=>s.optionKey===choice.optionKey).name,name);
      assert.deepEqual((await a.service.state()).choice,choice);
    }
    await assert.rejects(a.service.selectServer({serverId:'7100587',groupId:'271',optionKey:options.servers[0].optionKey}),/官方列表/);
    await a.service.shutdown();
    const b=fixture(directory,realms);
    assert.equal((await b.service.state()).choice.optionKey,options.servers.find(s=>s.name==='月明沧海').optionKey);
    assert.equal((await b.service.sign({confirm:'sign-selected-server',serverId:'7100587'})).success,true);
    assert.equal(b.signed(),1);
    await b.service.shutdown();
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
test('renderer uses display option identity instead of duplicate official IDs',()=>{
  const code=fs.readFileSync(path.join(__dirname,'../src/components/CommunitySigninPanel.tsx'),'utf8');
  assert.match(code,/key=\{s.optionKey\} value=\{s.optionKey\}/);
  assert.doesNotMatch(code,/key=\{s.id\} value=\{s.id\}/);
  assert.match(code,/selectServer\(\{accountId: active.id, groupId, serverId, optionKey\}\)/);
  assert.match(code,/visibleServers.filter\(s => s.groupId === groupId\)/);
  assert.match(code,/setGroupId\(e.target.value\); setOptionKey\(''\)/);
});
test('current realm status is explicit; history and missing status are not treated as current',()=>{
  assert.equal(realmOption({id:7100587,isp:270,name:'月明沧海',state:'1'}).active,true);
  assert.equal(realmOption({id:7100587,isp:270,name:'龙行天下',state:'3'}).active,false);
  assert.equal(realmOption({id:1,isp:2,name:'未知状态'}).active,false);
});

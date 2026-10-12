// Real Windows host, isolated state. Does not apply any system optimization.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const http=require('node:http'),net=require('node:net');
const {spawn,execFileSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const resources=process.env.SYNAPSEX_TEST_RESOURCES||path.resolve(__dirname,'..');
test('real host survives aborted covers/API bodies, malformed requests and recovers after child crash', {skip:process.platform!=='win32',timeout:90000},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'synapsex-http-regression-'));
 const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
 const token=randomUUID().replaceAll('-',''),vip=randomUUID().replaceAll('-','');
 const env={...process.env,SYNAPSEX_STATE_ROOT:root,LOCALAPPDATA:root,APPDATA:root};
 const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(resources,'host/WatchLocalHost.ps1'),'-ScriptPath',path.join(resources,'host/SynapseXHost.ps1'),'-Port',String(port),'-SessionToken',token,'-VipToken',vip,'-OwnerProcessId',String(process.pid)],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let error='';child.stdout.resume();child.stderr.on('data',chunk=>error=(error+chunk).slice(-4000));
 const base=`http://127.0.0.1:${port}`;
 async function api(route,body,auth=token){return fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'X-SynapseX-Token':auth,'Content-Type':'application/json'},body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});}
 async function ready(){for(let n=0;n<100;n++){if(child.exitCode!==null)throw Error('Supervisor exited: '+child.exitCode+' '+error);try{if((await api('/api/status')).ok)return;}catch{}await delay(150);}throw Error('Host not ready');}
 async function abortCover(asset){await new Promise((resolve,reject)=>{const req=http.get(base+'/assets/'+asset,res=>{res.once('data',()=>{res.destroy();req.destroy();resolve();});res.on('error',()=>resolve());});req.on('error',reject);req.setTimeout(5000,()=>req.destroy(Error('timeout')));});}
 const report={id:'session-20260916-120000-12345678',status:'recording',game:{processName:'fixture.exe',title:'Isolated HTTP regression',processId:4321,bindingMode:'manual',startedAt:'2026-09-16T00:00:00Z',endedAt:'2026-09-16T00:00:20Z',durationSeconds:20},samples:{telemetry:4,fps:0,latency:0,unreachableLatency:0},fps:null,cpu:{system:null,game:null},gpu:null,memory:{systemUsedPercent:null,gameMB:null},latency:{milliseconds:null},network:{downloadMbps:null,uploadMbps:null},timeline:[],observations:[]};
 try{
  await ready();
  const asset=fs.readdirSync(path.join(resources,'dist/assets')).find(name=>/^jiuyin-cover.*\.png$/.test(name));assert.ok(asset);
  const full=await fetch(base+'/assets/'+asset);assert.equal(full.status,200);assert.equal((await full.arrayBuffer()).byteLength,fs.statSync(path.join(resources,'dist/assets',asset)).size);
  assert.equal((await api('/api/status',undefined,'wrong')).status,403);
  assert.equal((await api('/api/network/tcp/apply',{})).status,403);
  const access=require('../host/feature-access.json');
  for(const route of Object.keys(access.paid))assert.equal((await api(route,{})).status,403,'Free user must not apply: '+route);
  for(const route of ['/api/lab/session/state','/api/lab/session/preferences','/api/lab/session/registry','/api/lab/session/gpu-records','/api/lab/session/latency','/api/lab/session/latency-history','/api/lab/session/diagnostics'])assert.equal((await api(route)).status,200,'Free read: '+route);
  // Diagnostic confirmation must still be enforced; no mouse/DPC trace is started.
  for(const route of access.diagnostics)assert.equal((await api(route,{})).status,400,'Free diagnostic reaches confirmation validator: '+route);
  const notice=await api('/api/lab/session/notice',{suppressed:true});assert.equal(notice.status,200);
  assert.equal((await (await api('/api/lab/session/notice')).json()).suppressed,true);
  assert.equal((await api('/api/lab/session/latency-start',{confirmation:'MEASURE',seconds:15,label:'Isolated free-tier regression'})).status,200);
  await delay(1200);
  const measured=await (await api('/api/lab/session/latency')).json();assert.ok(['running','complete'].includes(measured.Status));
  assert.equal((await api('/api/lab/session/latency-stop',{confirmation:'STOP'})).status,200);
  // Invalid recovery bodies prove they reach validation rather than a VIP gate;
  // no existing system backup or user setting is ever restored by this test.
  for(const route of access.recovery)assert.notEqual((await api(route,{})).status,403,'Recovery must remain free: '+route);
  const vipInvalid=await fetch(base+'/api/network/tcp/apply',{method:'POST',headers:{'X-SynapseX-Token':token,'X-SynapseX-Vip':vip,'Content-Type':'application/json'},body:'{}'});
  assert.equal(vipInvalid.status,400,'VIP application reaches confirmation validation, without writing');
  console.log('PASS: free diagnostics start/stop, free reads/preferences/recovery; all paid writes denied without VIP; confirmations retained');
  for(let n=0;n<12;n++){await abortCover(asset);await delay(25);assert.equal((await api('/api/status')).status,200);}
  assert.equal((await api('/api/reports/save','{bad')).status,400);
  await new Promise(resolve=>{const req=http.request(base+'/api/reports/save',{method:'POST',headers:{'X-SynapseX-Token':token,'Content-Length':'10000'}});req.on('error',()=>{});req.flushHeaders();req.write('{');setTimeout(()=>{req.destroy();resolve();},100);});
  assert.equal((await api('/api/status')).status,200);
  const saved=await api('/api/reports/save',{report});assert.equal(saved.status,200,await saved.clone().text());await saved.arrayBuffer();
  const list=await (await api('/api/reports/list',{})).json();assert.equal(list.length,1);
  // Only terminate the PowerShell child of this test's own supervisor.
  const pidText=execFileSync('powershell.exe',['-NoProfile','-Command',`Get-CimInstance Win32_Process -Filter "ParentProcessId = ${child.pid}" | Where-Object { $_.Name -eq 'powershell.exe' -and $_.CommandLine -like '*SynapseXHost.ps1*' } | Select-Object -ExpandProperty ProcessId`],{encoding:'utf8',windowsHide:true}).trim();
  assert.match(pidText,/^\d+$/);execFileSync('powershell.exe',['-NoProfile','-Command',`Stop-Process -Id ${Number(pidText)} -Force`],{windowsHide:true});
  await delay(500);await ready();
  const restored=await (await api('/api/reports/list',{})).json();assert.equal(restored[0].id,report.id);
  assert.equal((await api('/api/status',undefined,'wrong')).status,403);
  assert.equal((await api('/api/network/tcp/apply',{})).status,403);
  await abortCover(asset);assert.equal((await api('/api/status')).status,200);
  const stopped=await api('/api/shutdown',{});await stopped.arrayBuffer();
  for(let n=0;n<40&&child.exitCode===null;n++)await delay(100);
  assert.equal(child.exitCode,0,'Explicit shutdown must stop, not restart');
  console.log('PASS: full asset, 13 aborted assets, truncated POST, malformed JSON, auth/VIP, report persistence, real child recovery, clean shutdown');
 }finally{
  if(child.exitCode===null){try{await api('/api/shutdown',{});}catch{}for(let n=0;n<50&&child.exitCode===null;n++)await delay(100);}
  if(child.exitCode===null){execFileSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}
  assert.ok(path.resolve(root).startsWith(path.join(os.tmpdir(),'synapsex-http-regression-')));
  fs.rmSync(root,{recursive:true,force:true});
 }
});

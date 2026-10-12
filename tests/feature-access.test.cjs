const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const policy=require('../host/feature-access.json');
const {routeFeature,createVipPolicy}=require('../electron/vip-policy.cjs');
const free=[...policy.read,...policy.diagnostics,...policy.preferences,...policy.recovery];
test('explicit free access includes starting diagnostics, compatibility reads, preferences and recovery for all users',()=>{
 assert.ok(policy.diagnostics.includes('/api/lab/session/latency-start'));
 assert.ok(policy.diagnostics.includes('/api/lab/session/diagnostic-start'));
 for(const route of free)for(const method of ['GET','POST']){
  assert.equal(routeFeature(route,method),null,route);
  assert.equal(routeFeature(route.toUpperCase()+'?refresh=1',method),null,route);
 }
 for(const status of ['unlicensed','expired','revoked','invalid','clock_error']){
  const access=createVipPolicy({state:()=>({status,features:['vip'],user:{id:'fixture'}})});
  for(const feature of new Set(Object.values(policy.paid)))assert.throws(()=>access.requireFeature(feature),/VIP/);
  assert.equal(access.state().signinLimit,1);
 }
});
test('paid applications remain gated and unknown protected routes fail closed',()=>{
 for(const [route,feature] of Object.entries(policy.paid))for(const method of ['GET','POST'])assert.equal(routeFeature(route,method),feature,route);
 for(const [prefix,feature]of Object.entries(policy.protectedPrefixes)){
  for(const suffix of ['future-state','future-restore','apply/restore'])assert.equal(routeFeature(prefix+suffix),feature);
 }
 assert.equal(new Set([...free,...Object.keys(policy.paid)]).size,free.length+Object.keys(policy.paid).length);
});
test('each actual guarded host endpoint is explicitly classified and Electron packages the shared source',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../host/SynapseXHost.ps1'),'utf8');
 const actual=[...source.matchAll(/'([^']+)'\s*\{/g)].map(x=>x[1]).filter(route=>Object.keys(policy.protectedPrefixes).some(prefix=>route.startsWith(prefix)));
 for(const route of actual)assert.ok(free.includes(route)||Object.hasOwn(policy.paid,route),'Unreviewed endpoint: '+route);
 for(const route of [...free,...Object.keys(policy.paid)])assert.ok(actual.includes(route),'Nonexistent endpoint: '+route);
 assert.match(source,/\$vipFeature = Get-RouteFeature \$path/);
 assert.ok(require('../package.json').build.files.includes('host/feature-access.json'));
});
test('PowerShell host and Electron agree on every access decision',{skip:process.platform!=='win32'},()=>{
 const script=`Import-Module './host/modules/FeatureAccess.psm1' -Force; $p=Get-Content './host/feature-access.json' -Raw|ConvertFrom-Json; $routes=@($p.read)+@($p.diagnostics)+@($p.preferences)+@($p.recovery)+@($p.paid.PSObject.Properties.Name)+@('/api/lab/future-state','/api/network/tcp/future-restore','/api/monitor/sample'); @($routes|ForEach-Object{[pscustomobject]@{route=$_;feature=(Get-RouteFeature $_);upper=(Get-RouteFeature ($_.ToUpperInvariant()+'?x=1'))}})|ConvertTo-Json -Compress`;
 const rows=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{cwd:path.join(__dirname,'..'),windowsHide:true,encoding:'utf8'}));
 for(const row of rows){assert.equal(row.feature||null,routeFeature(row.route),row.route);assert.equal(row.upper||null,routeFeature(row.route),row.route);}
});
test('entering premium settings does not automatically request registration and sales copy excludes administrator capabilities',()=>{
 const notice=fs.readFileSync(path.join(__dirname,'../src/components/VipNotice.tsx'),'utf8');
 assert.doesNotMatch(notice,/softwareAccount.*state\(/);
 assert.match(notice,/onClick=.*synapsex:open-account/);
 const entry=fs.readFileSync(path.join(__dirname,'../src/components/LabEntryGate.tsx'),'utf8');assert.doesNotMatch(entry,/全部实验室功能|<VipNotice/);
 const membership=fs.readFileSync(path.join(__dirname,'../src/components/MembershipCenter.tsx'),'utf8');assert.match(membership,/不属于 VIP 权益/);assert.match(membership,/另行报价/);
});

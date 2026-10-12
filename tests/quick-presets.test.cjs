const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const Module=require('node:module');
const file=path.join(__dirname,'../src/lib/quickPresets.ts');
const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const unit=new Module(file,module);unit._compile(compiled,file);
const {quickPlan,executeQuickPlan,restoreQuickResults}=unit.exports;
const empty={system:[],advanced:[],expert:[]};
function fixture(){
  const rows=quickPlan('maximum',empty);
  return {
    system:rows.filter(r=>r.kind==='system').map(r=>({id:r.id,title:r.id,impact:'write',tradeoff:'effect',applied:false,states:[{current:0,desired:1}]})),
    advanced:rows.filter(r=>r.kind==='advanced').map(r=>({id:r.id,title:r.id,impact:'write',tradeoff:'effect',available:true,currentLabel:'on',target:r.id,applied:false})),
    expert:rows.filter(r=>r.kind==='expert').map(r=>({id:r.id,title:r.id,effect:'effect',available:true,current:'default',fingerprint:'initial',options:[{value:'default',label:'default'},{value:r.choice,label:'target'}]})),
  };
}
test('three cumulative tiers contain 4/24/72 fixed entries and all 35 new privacy controls',()=>{
  const s=fixture(),tiers=['basic','optimal','maximum'].map(t=>quickPlan(t,s));
  assert.deepEqual(tiers.map(t=>t.length),[4,24,72]);
  assert.equal(new Set(tiers[2].map(r=>r.key)).size,72);
  assert.equal(tiers[2].filter(r=>r.id.startsWith('privacy-')).length,35);
  for(let i=0;i<2;i++) for(const row of tiers[i]) assert(tiers[i+1].some(r=>r.key===row.key&&r.choice===row.choice));
  assert(tiers[2].every(r=>r.available));
  for(const row of tiers[2]) assert.doesNotMatch(row.id,/firewall|defender|smartscreen|^uac$|boot-|^mpo$|automatic-updates|disconnected|cleanup/);
});
test('missing catalogs, unsupported options and already applied values stay explicit',()=>{
  assert(quickPlan('maximum',empty).every(r=>!r.available&&r.reason));
  const s=fixture();s.expert[0].available=false;s.expert[0].reason='Home edition';s.expert[1].options=[];s.system[0].applied=true;
  const plan=quickPlan('maximum',s);
  assert.equal(plan.find(r=>r.id===s.expert[0].id).reason,'Home edition');
  assert.equal(plan.find(r=>r.id===s.expert[1].id).available,false);
  assert.equal(plan[0].applied,true);
});
test('confirmed queue journals before writing, reads back and stops on failure',async()=>{
  const rows=quickPlan('basic',fixture());let writes=0;const state=new Map(rows.map(r=>[r.key,{...r}]));let saved=[];
  const out=await executeQuickPlan(rows,{cancelled:()=>false,publish:r=>{saved=r},read:async r=>state.get(r.key),apply:async r=>{
    assert.equal(saved.find(x=>x.key===r.key).status,'running');writes++;if(writes===2)throw Error('denied');state.get(r.key).applied=true;return {ok:true,backupId:'test-backup'};
  }});
  assert.equal(writes,2);assert.deepEqual(out.map(r=>r.status),['applied','failed','cancelled','cancelled']);assert.equal(out[0].backupId,'test-backup');
});
test('stale preview, cancellation and local journal failure cause no writes',async()=>{
  const rows=quickPlan('basic',fixture());let writes=0;
  for(const mode of ['stale','cancel','storage']) {
    const io={cancelled:()=>mode==='cancel',read:async r=>({...r,signature:'changed'}),apply:async()=>{writes++;return{ok:true,backupId:''}},publish:()=>{if(mode==='storage')throw Error('storage full')}};
    if(mode==='storage')await assert.rejects(executeQuickPlan(rows,io),/storage/);else {const r=await executeQuickPlan(rows,io);assert.notEqual(r[0].status,'applied');}
  }
  assert.equal(writes,0);
});
test('already applied skips; false success fails readback with backup retained; cancellation after read prevents write',async()=>{
  const rows=quickPlan('basic',fixture());let writes=0,reads=0;
  const r=await executeQuickPlan(rows.slice(0,2),{cancelled:()=>false,publish:()=>{},read:async row=>({...row,applied:row.key===rows[0].key}),apply:async()=>{writes++;return{ok:true,backupId:'kept'}}});
  assert.deepEqual(r.map(x=>x.status),['skipped','failed']);assert.equal(writes,1);assert.equal(r[1].backupId,'kept');
  await executeQuickPlan(rows,{cancelled:()=>reads>0,publish:()=>{},read:async row=>{reads++;return row},apply:async()=>{throw Error('must not write')}});
});
test('preset options match actual compiled Windows definitions', {skip:process.platform!=='win32'},()=>{
  const {execFileSync}=require('node:child_process');
  const command="$r=Get-Location;$s=Import-Module ./host/modules/SystemOptimizer.psm1 -Force -PassThru;$a=Import-Module ./host/modules/AdvancedSystemOptimizer.psm1 -Force -PassThru;$e=Import-Module ./host/modules/ExpertSettings.psm1 -Force -PassThru;[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);@{system=@(&$s {Get-SystemTweakDefinitions}|ForEach-Object{[pscustomobject]$_}|Select-Object id);advanced=@(&$a {Get-AdvancedDefinitions}|ForEach-Object{[pscustomobject]$_}|Select-Object id);expert=@(&$e {Get-ExpertDefinitions}|ForEach-Object{[pscustomobject]$_}|Select-Object id,options)}|ConvertTo-Json -Depth 6 -Compress";
  const defs=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',command],{cwd:path.join(__dirname,'..'),encoding:'utf8'}).trim());
  for(const r of quickPlan('maximum',empty)) {const d=defs[r.kind].find(x=>x.id===r.id);assert(d,`missing ${r.key}`);if(r.kind==='expert')assert(d.options.some(x=>x.value===r.choice),`invalid ${r.key}=${r.choice}`);}
});
test('batch restore reverses exact backup IDs and verifies original signatures',async()=>{
  const rows=quickPlan('basic',fixture()).slice(0,2),state=new Map(rows.map(r=>[r.key,{...r,applied:true,signature:'applied'}]));
  const previous=rows.map((r,i)=>({key:r.key,title:r.title,status:'applied',message:'',backupId:`20260909-120000-00${i}`,beforeSignature:r.signature}));
  const calls=[];let journal=[];
  const restored=await restoreQuickResults(previous,{cancelled:()=>false,publish:r=>journal=r,read:async key=>state.get(key),restore:async(row,id)=>{assert.equal(journal.find(r=>r.key===row.key).status,'restoring');calls.push(id);Object.assign(state.get(row.key),rows.find(r=>r.key===row.key));return{ok:true}}});
  assert.deepEqual(calls,previous.map(r=>r.backupId).reverse());assert(restored.every(r=>r.status==='restored'));
  await restoreQuickResults(restored,{cancelled:()=>false,publish:()=>{},read:async()=>{throw Error('already restored')},restore:async()=>{throw Error('must not repeat')}});
});
test('restore refuses external changes and invalid records, and treats silent restore as failure',async()=>{
  const row=quickPlan('basic',fixture())[0],previous=[{key:row.key,title:row.title,status:'applied',message:'',backupId:'20260909-120000-000',beforeSignature:row.signature}];let writes=0;
  for(const mode of ['external','silent','invalid']) {
    const data=mode==='invalid'?[{...previous[0],backupId:'latest'}]:previous;
    const result=await restoreQuickResults(data,{cancelled:()=>false,publish:()=>{},read:async()=>({...row,signature:'new',applied:mode!=='external'}),restore:async()=>{writes++;return{ok:true}}});assert.equal(result[0].status,'failed');
  }
  assert.equal(writes,1);
});
test('quick UI confirms full selected list and has real apply/restore dispatch and paging',()=>{
  const ui=fs.readFileSync(path.join(__dirname,'../src/components/QuickOptimizationPanel.tsx'),'utf8');
  assert.match(ui,/synapsexDesktop\.quickApply\(\{tier,kind:row.kind/);
  for(const name of ['restoreSystem','restoreAdvancedSystem','restoreExpert'])assert(ui.includes(`hostApi.${name}`));
  assert.match(ui,/items: selected\.map/);assert.match(ui,/恢复本次优化/);assert.match(ui,/上一页/);assert.match(ui,/取消|停止/);assert.match(ui,/localStorage\.setItem/);
  const workspace=fs.readFileSync(path.join(__dirname,'../src/components/OptimizerWorkspace.tsx'),'utf8');
  assert.match(workspace,/<QuickOptimizationPanel/);assert.doesNotMatch(workspace,/applyRecommendedBundle|selectTweakPreset|3D Acrylic Presets/);
});

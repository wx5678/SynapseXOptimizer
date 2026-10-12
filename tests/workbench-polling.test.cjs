const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');const Module=require('node:module');
function load(name){const file=path.join(__dirname,'../src/lib/',name+'.ts');const unit=new Module(file,module);unit.paths=module.paths;unit.require=name=>name==='./workbenchPolling'?pollingModule:name.startsWith('./')?load(name.slice(2)):require(name);unit._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);return unit.exports;}
const pollingModule=load('workbenchPolling');const {createWorkbenchPolling,isGameIdentity,emptyWorkbenchFps}=pollingModule;
const flush=()=>new Promise(r=>setImmediate(r));
const fps=(id=10)=>({...emptyWorkbenchFps,running:true,status:'capturing',targetProcessId:id,targetProcessName:'fxgame.exe',fps:630,onePercentLow:390,frameTimeMs:1.59});
const sample=(id=10,name='fxgame.exe')=>({game:{id,name,title:'Test game'},cpu:{totalPercent:18},gpu:{utilizationPercent:91}});
const targets=async()=>({candidates:[{processId:10,processName:'fxgame.exe',autoEligible:true}],detected:{processId:4,processName:'System.exe',autoEligible:false}});
test('existing capture pins homepage target even when detection returns System',async()=>{
  let clock=100000,reads=0;const rows=[];const p=createWorkbenchPolling({now:()=>clock,fps:async()=>fps(),targets,sample:async(name,id)=>{reads++;assert.equal(id,10);return sample()},selection:()=>({mode:'auto',name:''}),publish:(t,f)=>rows.push([t,f])});
  await p.tick();await flush();clock+=1000;await p.tick();await flush();assert.equal(rows.length,2);assert.equal(reads,1);assert.equal(rows[1][1].frameTimeMs,1.59);p.dispose();
});
test('slow telemetry never blocks FPS polling; disposed request cannot publish',async()=>{
  let resolve,calls=0,clock=100000,published=0;const p=createWorkbenchPolling({now:()=>clock,fps:async()=>{calls++;return fps()},targets,sample:()=>new Promise(r=>resolve=r),selection:()=>({mode:'auto',name:''}),publish:()=>published++});
  await p.tick();await flush();clock+=1000;await p.tick();assert.equal(calls,2);p.dispose();resolve(sample());await flush();assert.equal(published,0);
});
test('collector change during a pending telemetry call cannot repaint the old game',async()=>{
  let resolve,clock=100000,current=fps(),published=0;const p=createWorkbenchPolling({now:()=>clock,fps:async()=>current,targets,sample:()=>new Promise(r=>resolve=r),selection:()=>({mode:'auto',name:''}),publish:()=>published++});
  await p.tick();await flush();current=fps(20);clock+=1000;await p.tick();resolve(sample(10));await flush();assert.equal(published,0);p.dispose();
});
test('without FPS capture choose known game and never start any collector',async()=>{
  let selected;const p=createWorkbenchPolling({now:()=>100000,fps:async()=>emptyWorkbenchFps,targets,sample:async(name,id)=>{selected=id;return sample()},selection:()=>({mode:'auto',name:''}),publish:()=>{}});
  await p.tick();await flush();assert.equal(selected,10);p.dispose();assert.equal(isGameIdentity(4,'System.exe'),false);assert.equal(isGameIdentity(45,'svchost.exe'),false);
});
test('store rejects System, fills missing frame time from measured FPS and preserves history',()=>{
  const store=load('telemetryStore');const React=require('react');const originalHook=React.useSyncExternalStore;React.useSyncExternalStore=(_subscribe,snapshot)=>snapshot();
  const originalNow=Date.now;let clock=100000;Date.now=()=>clock;
  try {
    store.publishTelemetry(sample(),{...fps(),frameTimeMs:null});clock+=1000;store.publishTelemetry(sample(4,'System.exe'),emptyWorkbenchFps);clock+=1000;store.publishTelemetry(sample(),fps());
    const rows=store.useWorkbenchSamples();assert.equal(rows.length,2);assert.ok(Math.abs(rows[0].frameTime-1000/630)<1e-9);assert.ok(rows.every(r=>r.processId===10));
    clock+=100;store.publishTelemetry(sample(),emptyWorkbenchFps);assert.equal(store.useWorkbenchSamples().at(-1).fps,630);
  } finally{React.useSyncExternalStore=originalHook;Date.now=originalNow;}
});
test('homepage does not depend on report setting and reporting cannot retarget a running collector',()=>{
  const hook=fs.readFileSync(path.join(__dirname,'../src/lib/useWorkbenchPolling.ts'),'utf8');assert.doesNotMatch(hook,/reports.auto|startFps|stopFps/);
  const reporter=fs.readFileSync(path.join(__dirname,'../src/components/GameSessionReporter.tsx'),'utf8');assert.doesNotMatch(reporter,/publishTelemetry|\.startFps\(/);
});
test('stale WeChat FPS cannot pin the homepage; a non-JiuYin game replaces it and clears after exit',async()=>{
 const chat={processName:'WeChatAppEx.exe',processId:88,autoEligible:false},other={processName:'cs2.exe',processId:55,autoEligible:true};
 let clock=100000,list=[chat],reads=[],clears=0;
 const p=createWorkbenchPolling({now:()=>clock,fps:async()=>({...fps(88),targetProcessName:chat.processName}),targets:async()=>({candidates:list,detected:chat}),sample:async(name,id)=>{reads.push(name);return sample(id,name);},selection:()=>({mode:'auto',name:''}),publish:()=>{},clear:()=>clears++});
 await p.tick();await flush();assert.deepEqual(reads,[]);assert.equal(clears,1);
 clock+=3000;list=[chat,other];await p.tick();await flush();assert.deepEqual(reads,['cs2.exe']);
 clock+=3000;list=[chat];await p.tick();await flush();assert.equal(clears,2);p.dispose();
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {createMonitorController}=require('../electron/monitor-controller.cjs');
function fixture(t,directory=fs.mkdtempSync(path.join(os.tmpdir(),'synapsex-monitor-'))) {
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  let list=[],running=false,targetProcessId=0,shown=false,click=false,starts=0,opens=0;
  const deps={directory,targets:async()=>({candidates:list,detected:list[0]||null}),fps:()=>({running,targetProcessId}),
    startFps:async target=>{running=true;targetProcessId=target.processId;starts++},stopFps:()=>{running=false},openOverlay:async()=>{shown=true;opens++},closeOverlay:()=>{shown=false},setClickThrough:v=>{click=v},visible:()=>shown};
  const control=createMonitorController(deps);
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  return {control,deps,directory,settle,setList:v=>list=v,snapshot:()=>({running,shown,click,starts,opens})};
}
const game={processName:'fxgame.exe',processId:123,title:'Game',autoEligible:true};
test('overlay preference persists, waits for game, opens once, and survives single detection miss',async t=>{
  const f=fixture(t);f.control.save({overlayEnabled:true,clickThrough:true});await f.settle();assert.equal(f.snapshot().shown,false);
  f.setList([game]);await f.control.tick();assert.deepEqual(f.snapshot(),{running:false,shown:true,click:true,starts:0,opens:1});
  await f.control.tick();assert.equal(f.snapshot().opens,1);
  f.setList([]);await f.control.tick();assert.equal(f.snapshot().shown,true);
  await f.control.tick();await f.control.tick();assert.equal(f.snapshot().shown,false);assert.equal(f.control.state().overlayEnabled,true);
  const restarted=createMonitorController(f.deps);assert.equal(restarted.state().overlayEnabled,true);assert.equal(restarted.state().clickThrough,true);
});
test('explicit disable/close persists and never resurrects; invalid patch cannot write',async t=>{
  const f=fixture(t);f.setList([game]);f.control.save({overlayEnabled:true});await f.settle();
  f.control.save({overlayEnabled:false});await f.settle();await f.control.tick();assert.equal(f.snapshot().shown,false);
  assert.equal(createMonitorController(f.deps).state().overlayEnabled,false);
  assert.throws(()=>f.control.save({overlayEnabled:'true'}));assert.throws(()=>f.control.save({execute:'bad'}));
});
test('auto capture is opt in, manual stop holds for this game, next game resumes',async t=>{
  const f=fixture(t);f.setList([game]);await f.control.tick();assert.equal(f.snapshot().starts,0);
  f.control.save({autoCapture:true});await f.settle();assert.equal(f.snapshot().starts,1);
  f.control.pauseCapture();await f.control.tick();assert.equal(f.snapshot().running,false);
  f.setList([]);await f.control.tick();await f.control.tick();await f.control.tick();f.setList([game]);await f.control.tick();assert.equal(f.snapshot().starts,2);
});
test('manual binding waits for exact process, rejects System, and shutdown cancels pending detection',async t=>{
  const f=fixture(t);f.setList([{processName:'System.exe',processId:4}]);f.control.save({overlayEnabled:true});await f.settle();assert.equal(f.snapshot().shown,false);
  f.control.save({mode:'manual',manualProcess:'other.exe'});f.setList([game]);await f.settle();await f.control.tick();assert.equal(f.snapshot().shown,false);
  let resolve;const g=createMonitorController({...f.deps,targets:()=>new Promise(r=>resolve=r)});g.save({mode:'auto',overlayEnabled:true});g.stop();resolve({candidates:[game],detected:game});await f.settle();assert.equal(f.snapshot().shown,false);
});
test('late open is closed if setting was turned off while loading',async t=>{
  const f=fixture(t);f.setList([game]);let resolve,closed=0;
  const c=createMonitorController({...f.deps,openOverlay:()=>new Promise(r=>resolve=r),closeOverlay:()=>closed++});
  c.save({overlayEnabled:true});await f.settle();c.save({overlayEnabled:false});resolve();await f.settle();assert.ok(closed>=2);
});
test('rapid game restart clears manual session pause, settings do not depend on report page',async t=>{
  const f=fixture(t);f.setList([game]);f.control.save({autoCapture:true});await f.settle();f.control.pauseCapture();
  f.setList([{...game,processId:124}]);await f.control.tick();assert.equal(f.snapshot().starts,2);
});

test('auto ignores WeChat even with stale capture; other games open and exit closes without switching to WeChat',async t=>{
 const f=fixture(t),chat={processName:'WeChatAppEx.exe',processId:999,autoEligible:false},other={processName:'cs2.exe',processId:200,autoEligible:true};
 f.setList([chat]);f.deps.fps=()=>({running:true,targetProcessId:999});
 const c=createMonitorController(f.deps);c.save({overlayEnabled:true});await f.settle();assert.equal(f.snapshot().shown,false);
 f.setList([chat,other]);await c.tick();assert.equal(f.snapshot().shown,true);
 // Losing the foreground/GPU load does not remove an eligible living game.
 f.setList([chat,{...other,foreground:false,gpuPercent:0}]);await c.tick();assert.equal(f.snapshot().opens,1);
 f.setList([chat]);await c.tick();await c.tick();await c.tick();assert.equal(f.snapshot().shown,false);
 f.setList([other,chat]);await c.tick();assert.equal(f.snapshot().shown,true);assert.equal(f.snapshot().opens,2);
});
test('manual binding still supports unknown games and restores after restart',async t=>{
 const f=fixture(t),other={processName:'CustomGame.exe',processId:90,autoEligible:false};
 f.setList([other]);f.control.save({mode:'manual',manualProcess:'CustomGame.exe',overlayEnabled:true});await f.settle();assert.equal(f.snapshot().shown,true);
 f.setList([]);for(let i=0;i<3;i++)await f.control.tick();assert.equal(f.snapshot().shown,false);
 f.setList([{...other,processId:91}]);await f.control.tick();assert.equal(f.snapshot().shown,true);
});
test('auto capture switches immediately when a different eligible game replaces previous game',async t=>{
 const f=fixture(t);f.setList([game]);f.control.save({autoCapture:true});await f.settle();
 f.setList([{processName:'cs2.exe',processId:444,autoEligible:true}]);await f.control.tick();assert.equal(f.snapshot().starts,2);
});

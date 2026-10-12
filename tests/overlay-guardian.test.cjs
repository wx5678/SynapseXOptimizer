const {test}=require('node:test'); const assert=require('node:assert/strict'); const {EventEmitter}=require('node:events');
const {attachOverlayGuardian}=require('../electron/overlay-guardian.cjs');
function fixture() {
  const win=new EventEmitter(), screen=new EventEmitter(), powerMonitor=new EventEmitter();
  let wanted=true, hidden=false, top=true, bounds={x:5000,y:5000,width:940,height:52};const calls=[];const timeouts=new Map();let periodic, intervalMs;
  Object.assign(win,{webContents:new EventEmitter(),isDestroyed:()=>false,getBounds:()=>bounds,setBounds:x=>{bounds=x;calls.push('bounds')},isMinimized:()=>false,isAlwaysOnTop:()=>top,setAlwaysOnTop:()=>{top=true;calls.push('top')},isVisible:()=>!hidden,showInactive:()=>{hidden=false;calls.push('showInactive')},moveTop:()=>calls.push('moveTop')});
  win.webContents.reload=()=>calls.push('reload');win.webContents.invalidate=()=>calls.push('paint');screen.getDisplayMatching=()=>({workArea:{x:0,y:0,width:1280,height:720}});
  const timers={setTimeout:f=>{timeouts.set(f,f);return f},clearTimeout:f=>timeouts.delete(f),setInterval:(f,ms)=>{periodic=f;intervalMs=ms;return 1},clearInterval:()=>{periodic=null}};
  const guard=attachOverlayGuardian(win,{screen,powerMonitor,timers,wanted:()=>wanted});
  return {win,screen,powerMonitor,calls,guard,intervalMs:()=>intervalMs,pending:()=>timeouts.size,bounds:()=>bounds,tick:()=>{for(const f of [...timeouts.values()]){timeouts.delete(f);f()}periodic?.()},hide:()=>{hidden=true;top=false;win.emit('hide')},cancel:()=>{wanted=false},close:()=>{wanted=false;win.emit('closed')}};
}
test('overlay recovers hidden/topmost/off-screen state without focusing, and never resurrects explicit close',()=>{
 const f=fixture();f.hide();f.tick();assert.ok(f.calls.includes('showInactive'));assert.ok(f.calls.includes('top'));assert.deepEqual(f.bounds(),{x:340,y:668,width:940,height:52});f.close();const n=f.calls.length;f.tick();assert.equal(f.calls.length,n);assert.equal(f.screen.listenerCount('display-removed'),0);
});
test('overlay does not appear on locked desktop; bounded renderer retries and resume recover',()=>{
 const f=fixture();f.powerMonitor.emit('lock-screen');f.hide();f.tick();assert.equal(f.calls.length,0);f.powerMonitor.emit('unlock-screen');f.tick();assert.ok(f.calls.includes('showInactive'));
 for(let i=0;i<5;i++)f.win.webContents.emit('render-process-gone',{}, {reason:'crashed',exitCode:1});assert.equal(f.calls.filter(x=>x==='reload').length,2);f.guard.stop();
});

test('silent Alt+Tab occlusion reasserts topmost and repaints without reload or focus',()=>{
 const f=fixture();assert.equal(f.intervalMs(),1000);f.tick();
 assert.ok(f.calls.includes('top'));assert.ok(f.calls.includes('moveTop'));assert.ok(f.calls.includes('paint'));
 assert.ok(!f.calls.includes('reload'));assert.ok(!f.calls.includes('showInactive'));f.close();
});

test('display hotplug query failure cannot block hidden overlay recovery',()=>{
 const f=fixture();f.screen.getDisplayMatching=()=>{throw Error('display switching')};f.hide();f.tick();
 assert.ok(f.calls.includes('showInactive'));assert.ok(f.calls.includes('paint'));f.close();
});

test('resume while desktop remains locked must not raise overlay',()=>{
 const f=fixture();f.powerMonitor.emit('lock-screen');f.powerMonitor.emit('suspend');f.hide();
 f.powerMonitor.emit('resume');f.tick();assert.equal(f.calls.length,0);
 f.powerMonitor.emit('unlock-screen');f.tick();assert.ok(f.calls.includes('showInactive'));f.close();
});

test('explicit close cancels already scheduled recovery before native closed arrives',()=>{
 const f=fixture();f.hide();assert.equal(f.pending(),1);f.cancel();f.tick();assert.equal(f.calls.length,0);f.close();
});

test('own topmost notifications cannot create a 200ms recovery feedback loop',()=>{
 const f=fixture();f.win.setAlwaysOnTop=()=>{f.calls.push('top');f.win.emit('always-on-top-changed')};
 f.tick();assert.equal(f.pending(),0);f.tick();assert.equal(f.pending(),0);f.close();
});

test('renderer reload exception is contained instead of crashing the desktop host',()=>{
 const f=fixture();f.win.webContents.reload=()=>{throw Error('renderer already disposed')};
 assert.doesNotThrow(()=>f.win.webContents.emit('render-process-gone',{}, {reason:'crashed',exitCode:1}));f.close();
});

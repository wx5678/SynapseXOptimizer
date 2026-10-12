const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createWindowEffects}=require('../electron/window-effects.cjs');
function fixture(){const sender=new EventEmitter(),messages=[];sender.isDestroyed=()=>false;sender.send=(channel,value)=>messages.push({channel,...value});let timer;
 const window={webContents:sender,isDestroyed:()=>false,isVisible:()=>true,isMinimized:()=>false};
 const fx=createWindowEffects({setTimer:fn=>{timer=fn;return 1;},clearTimer:()=>{timer=null;}});
 return {fx,window,sender,messages,timeout:()=>timer()};}
test('window lights only acknowledge the owning renderer and current request; duplicate close coalesces',async()=>{
 const f=fixture();f.fx.setReady(f.window,true);assert.equal(f.messages[0].kind,'enter');
 const done=f.fx.leave(f.window,'quit');assert.equal(f.fx.leave(f.window,'quit'),done);const id=f.messages.at(-1).id;
 assert.equal(f.fx.complete({},id),false);assert.equal(f.fx.complete(f.sender,'old'),false);assert.equal(f.fx.complete(f.sender,id),true);assert.equal(await done,true);assert.equal(f.fx.complete(f.sender,id),false);assert.equal(f.sender.listenerCount('destroyed'),0);
});
test('animation timeout and renderer loss never block quitting; hidden/unready windows skip',async()=>{
 const f=fixture();assert.equal(await f.fx.leave(f.window,'quit'),true);f.fx.setReady(f.window,true);
 const timed=f.fx.leave(f.window,'quit');f.timeout();assert.equal(await timed,true);
 const lost=f.fx.leave(f.window,'tray');f.sender.emit('render-process-gone');assert.equal(await lost,true);assert.equal(f.sender.listenerCount('did-start-loading'),0);
 f.fx.setReady(f.window,true);f.window.isVisible=()=>false;const count=f.messages.length;assert.equal(await f.fx.leave(f.window,'quit'),true);assert.equal(f.messages.length,count);
});
test('reopening cancels tray fade; actual quit supersedes hide and cannot be cancelled by reopen',async()=>{
 const f=fixture();f.fx.setReady(f.window,true);const tray=f.fx.leave(f.window,'tray');f.fx.cancelHide(f.window);assert.equal(await tray,false);assert.equal(f.messages.at(-1).kind,'enter');
 const tray2=f.fx.leave(f.window,'tray'),quit=f.fx.leave(f.window,'quit');assert.equal(await tray2,false);const id=f.messages.at(-1).id;f.fx.enter(f.window);assert.equal(f.messages.at(-1).id,id);f.fx.complete(f.sender,id);assert.equal(await quit,true);
});
test('disabling renderer readiness releases pending exit and rejects invalid inputs',async()=>{
 const f=fixture();assert.throws(()=>f.fx.setReady(f.window,'yes'));assert.throws(()=>f.fx.leave(f.window,'bad'));
 f.fx.setReady(f.window,true);const exit=f.fx.leave(f.window,'quit');f.fx.setReady(f.window,false);assert.equal(await exit,true);
});

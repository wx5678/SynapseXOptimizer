const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {EventEmitter}=require('node:events');
const {createOverlayPositionStore,clampBounds}=require('../electron/overlay-position.cjs');
function fixture(t){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'synapsex-overlay-position-'));
 t.after(()=>{assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('synapsex-overlay-position-'));fs.rmSync(directory,{recursive:true,force:true});});
 let displays=[{id:1,workArea:{x:0,y:0,width:1920,height:1040}},{id:2,workArea:{x:-1280,y:0,width:1280,height:1024}}];
 const screen={getAllDisplays:()=>displays,getPrimaryDisplay:()=>displays[0],getDisplayMatching:b=>b.x<0&&displays[1]?displays[1]:displays[0]};
 const tasks=new Set(),timers={setTimeout:f=>{tasks.add(f);return f},clearTimeout:f=>tasks.delete(f)};
 const store=()=>createOverlayPositionStore({directory,screen,timers});
 const win=new EventEmitter();let bounds={x:0,y:8,width:940,height:52};
 Object.assign(win,{getBounds:()=>bounds,isDestroyed:()=>false,isMinimized:()=>false});
 return {directory,screen,store,win,timers,tasks,move:b=>{bounds=b;win.emit('move');},flush:()=>{for(const f of [...tasks]){tasks.delete(f);f();}},setDisplays:d=>{displays=d;}};
}
test('first overlay starts top-center; corrupt saved positions fall back safely',t=>{
 const f=fixture(t);assert.deepEqual(f.store().resolve({width:940,height:52}),{width:940,height:52,x:490,y:8});
 fs.writeFileSync(path.join(f.directory,'overlay-position-v1.json'),'{broken');assert.equal(f.store().resolve({width:940,height:52}).y,8);
 fs.writeFileSync(path.join(f.directory,'overlay-position-v1.json'),JSON.stringify({version:1,displayId:1,x:null,y:'bad',areaX:0,areaY:0}));assert.equal(f.store().resolve({width:940,height:52}).x,490);
});
test('drag saves once after debounce and restores across close/restart including negative monitor coordinates',t=>{
 const f=fixture(t),store=f.store();store.attach(f.win);
 f.move({x:-1100,y:70,width:940,height:52});f.move({x:-1000,y:80,width:940,height:52});assert.equal(f.tasks.size,1);
 f.flush();assert.deepEqual(f.store().resolve({width:940,height:52}),{x:-1000,y:80,width:940,height:52});
 f.move({x:-980,y:90,width:940,height:52});f.win.emit('close');f.win.emit('closed');assert.equal(f.tasks.size,0);assert.equal(f.win.listenerCount('move'),0);
 assert.equal(f.store().resolve({width:940,height:52}).y,90);
});
test('disconnected saved monitor falls back to primary top and resized displays keep overlay visible',t=>{
 const f=fixture(t),store=f.store();store.attach(f.win);f.move({x:-1100,y:900,width:940,height:52});f.win.emit('moved');
 f.setDisplays([{id:1,workArea:{x:0,y:40,width:800,height:600}}]);
 assert.deepEqual(f.store().resolve({width:940,height:52}),{x:0,y:48,width:800,height:52});
 f.setDisplays([{id:1,workArea:{x:0,y:0,width:1920,height:1040}},{id:2,workArea:{x:1920,y:0,width:800,height:600}}]);
 assert.deepEqual(f.store().resolve({width:940,height:52}),{x:1920,y:548,width:800,height:52});
});
test('destroy flushes cached move before invalid native bounds; transient screen errors do not crash HUD',t=>{
 const f=fixture(t);f.store().attach(f.win);f.move({x:130,y:160,width:940,height:52});
 f.win.getBounds=()=>{throw Error('destroyed')};assert.doesNotThrow(()=>f.win.emit('closed'));
 assert.equal(f.store().resolve({width:940,height:52}).x,130);
 const g=fixture(t);g.store().attach(g.win);g.screen.getDisplayMatching=()=>{throw Error('hotplug')};assert.doesNotThrow(()=>g.move({x:10,y:10,width:940,height:52}));g.win.emit('closed');
});
test('resizing near a screen edge clamps without centering',()=>{
 assert.deepEqual(clampBounds({x:1700,y:950,width:1120,height:300},{x:0,y:0,width:1920,height:1040}),{x:800,y:740,width:1120,height:300});
});

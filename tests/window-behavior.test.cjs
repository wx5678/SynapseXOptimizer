const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createWindowBehavior}=require('../electron/window-behavior.cjs');
function fixture(t, overrides={}) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'synapsex-window-test-'));
  t.after(()=>{assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));fs.rmSync(directory,{recursive:true,force:true});});
  let response={response:0,checkboxChecked:false}, prompts=0,hidden=0,quits=0,opened=0,checks=0,errors=0,quitting=false;
  const trays=[];
  class Tray {constructor(){trays.push(this);}setToolTip(){}setContextMenu(menu){this.menu=menu;}on(event,fn){this[event]=fn;}destroy(){this.destroyed=true;}}
  const options={directory,Tray,Menu:{buildFromTemplate:v=>v},icon:'test',openWorkspace:()=>opened++,checkUpdates:()=>checks++,quit:()=>quits++,isQuitting:()=>quitting,
    dialog:{showMessageBox:async()=>{prompts++;return response;},showErrorBox:()=>errors++},...overrides};
  const controller=createWindowBehavior(options);
  const window={hide:()=>hidden++,isDestroyed:()=>false};
  t.after(()=>controller.stop());
  return {controller,window,directory,trays,options,response:v=>{response=v;},quitting:()=>{quitting=true;},counts:()=>({prompts,hidden,quits,opened,checks,errors})};
}
test('default close asks; tray keeps window alive and provides reopen, update and real quit',async t=>{
  const f=fixture(t);assert.equal(f.controller.read().closeAction,'ask');
  await f.controller.requestClose(f.window);
  assert.equal(f.counts().hidden,1);assert.equal(f.counts().quits,0);
  f.trays[0]['double-click'](); f.trays[0].menu.find(x=>x.label==='检查更新').click(); f.trays[0].menu.find(x=>x.label==='退出 SynapseX').click();
  assert.equal(f.counts().opened,1);assert.equal(f.counts().checks,1);assert.equal(f.counts().quits,1);
  await f.controller.requestClose(f.window);assert.equal(f.counts().prompts,2);assert.equal(f.trays.length,1);
  f.controller.stop();assert.equal(f.trays[0].destroyed,true);
});
test('remembered tray and quit survive restart and can be reset to ask',async t=>{
  const f=fixture(t);f.response({response:0,checkboxChecked:true});await f.controller.requestClose(f.window);
  const next=createWindowBehavior(f.options);t.after(()=>next.stop());assert.equal(next.read().closeAction,'tray');
  next.save({closeAction:'quit'});await next.requestClose(f.window);assert.equal(f.counts().quits,1);assert.equal(f.counts().prompts,1);
  const last=createWindowBehavior(f.options);t.after(()=>last.stop());assert.equal(last.read().closeAction,'quit');last.save({closeAction:'ask'});
  f.response({response:2,checkboxChecked:true});await last.requestClose(f.window);assert.equal(last.read().closeAction,'ask');assert.equal(f.counts().hidden,1);
  assert.throws(()=>last.save({closeAction:'invalid'}));
});
test('cancel never hides, quits or remembers; quit selection does not create tray',async t=>{
  const f=fixture(t);f.response({response:2,checkboxChecked:true});await f.controller.requestClose(f.window);
  assert.equal(f.counts().hidden,0);assert.equal(f.counts().quits,0);assert.equal(f.controller.read().closeAction,'ask');
  f.response({response:1,checkboxChecked:true});await f.controller.requestClose(f.window);
  assert.equal(f.counts().quits,1);assert.equal(f.trays.length,0);assert.equal(f.controller.read().closeAction,'quit');
});
test('repeated close coalesces, and shutdown while dialog is open cannot hide app again',async t=>{
  let resolve,prompts=0;
  const f=fixture(t,{dialog:{showMessageBox:()=>{prompts++;return new Promise(r=>resolve=r);},showErrorBox:()=>{}}});
  const wait=f.controller.requestClose(f.window);await f.controller.requestClose(f.window);assert.equal(prompts,1);
  f.quitting();resolve({response:0,checkboxChecked:true});await wait;
  assert.equal(f.counts().hidden,0);assert.equal(f.controller.read().closeAction,'ask');
});
test('tray initialization failure keeps the window visible; startup tray is reused',async t=>{
  const f=fixture(t,{Tray:class {constructor(){throw Error('tray unavailable');}}});
  f.response({response:0,checkboxChecked:true});await f.controller.requestClose(f.window);
  assert.equal(f.counts().errors,1);assert.equal(f.counts().hidden,0);assert.equal(f.controller.read().closeAction,'ask');
  const g=fixture(t,{hasBackgroundTray:()=>true});await g.controller.requestClose(g.window);assert.equal(g.counts().hidden,1);assert.equal(g.trays.length,0);
});
test('corrupt settings default to ask and failed save cannot update in-memory choice',t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.directory,'window-behavior.json'),'bad json');
  const next=createWindowBehavior(f.options);t.after(()=>next.stop());assert.equal(next.read().closeAction,'ask');
  fs.mkdirSync(path.join(f.directory,'window-behavior.json.tmp'));assert.throws(()=>next.save({closeAction:'tray'}));assert.equal(next.read().closeAction,'ask');
});

test('tray waits for lights-out, but reopening or shutdown cancels the delayed hide',async t=>{
 let finish;
 const f=fixture(t,{beforeHide:()=>new Promise(r=>finish=r)});
 const first=f.controller.requestClose(f.window);await new Promise(r=>setImmediate(r));assert.equal(f.counts().hidden,0);
 finish(false);await first;assert.equal(f.counts().hidden,0);
 const second=f.controller.requestClose(f.window);await new Promise(r=>setImmediate(r));finish(true);await second;assert.equal(f.counts().hidden,1);
 const third=f.controller.requestClose(f.window);await new Promise(r=>setImmediate(r));f.quitting();finish(true);await third;assert.equal(f.counts().hidden,1);
});

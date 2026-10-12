const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createClosePrompt}=require('../electron/close-prompt.cjs');
function fixture(){
 const sender=new EventEmitter(),sent=[];sender.send=(...args)=>sent.push(args);sender.isDestroyed=()=>false;
 let timer,native=0;
 const broker=createClosePrompt({dialog:{showMessageBox:async()=>{native++;return {response:2,checkboxChecked:false};}},setTimer:fn=>(timer=fn,1),clearTimer:()=>{timer=null;}});
 return {sender,sent,broker,window:{webContents:sender},native:()=>native,timeout:()=>timer?.()};
}
test('themed close prompt requires matching sender and request, keeps remembered selection',async()=>{
 const f=fixture();f.broker.setReady(f.sender,true);const result=f.broker.ask(f.window,{});const id=f.sent[0][1];
 assert.equal(f.sent[0][0],'window-close:prompt');assert.equal(f.native(),0);
 assert.equal(f.broker.acknowledge({},id),false);assert.equal(f.broker.acknowledge(f.sender,id),true);
 assert.throws(()=>f.broker.respond({}, {id,action:'quit',remember:true}));
 assert.throws(()=>f.broker.respond(f.sender, {id:'old',action:'quit',remember:true}));
 assert.throws(()=>f.broker.respond(f.sender, {id,action:'invalid',remember:true}));
 f.broker.respond(f.sender,{id,action:'tray',remember:true});assert.deepEqual(await result,{response:0,checkboxChecked:true});
 assert.throws(()=>f.broker.respond(f.sender,{id,action:'quit',remember:true}));assert.equal(f.sender.listenerCount('destroyed'),0);
});
test('cancel ignores remember, and renderer teardown or real quit releases a waiting prompt',async()=>{
 for(const trigger of ['cancel','reload','gone','stop','unmount']){
  const f=fixture();f.broker.setReady(f.sender,true);const wait=f.broker.ask(f.window,{}),id=f.sent[0][1];
  if(trigger==='cancel')f.broker.respond(f.sender,{id,action:'cancel',remember:true});
  if(trigger==='reload')f.sender.emit('did-start-loading');
  if(trigger==='gone')f.sender.emit('render-process-gone');
  if(trigger==='stop')f.broker.stop();
  if(trigger==='unmount')f.broker.setReady(f.sender,false);
  assert.deepEqual(await wait,{response:2,checkboxChecked:false});assert.equal(f.native(),0);
 }
});
test('unavailable or unacknowledged renderer falls back without duplicate themed decisions',async()=>{
 const f=fixture();assert.equal((await f.broker.ask(f.window,{})).response,2);assert.equal(f.native(),1);
 f.broker.setReady(f.sender,true);const wait=f.broker.ask(f.window,{}),id=f.sent[0][1];await f.timeout();
 assert.equal((await wait).response,2);assert.equal(f.native(),2);assert.equal(f.sent[1][0],'window-close:dismiss');
 assert.equal(f.broker.acknowledge(f.sender,id),false);assert.throws(()=>f.broker.respond(f.sender,{id,action:'quit',remember:false}));
});

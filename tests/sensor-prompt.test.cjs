const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createSensorPrompt}=require('../electron/sensor-prompt.cjs');
function fixture(){const sender=new EventEmitter();sender.isDestroyed=()=>false;sender.send=(channel,value)=>{if(channel==='sensor-prompt:request')sender.request=value;};let timeout;const broker=createSensorPrompt({setTimer:fn=>{timeout=fn;return 1;},clearTimer:()=>{}});return {sender,broker,window:{webContents:sender},timeout:()=>timeout()};}
test('sensor consent requires ready renderer, matching acknowledged request and boolean response',async()=>{
 const f=fixture();await assert.rejects(f.broker.ask(f.window),/未就绪/);f.broker.setReady(f.sender,true);
 const result=f.broker.ask(f.window),id=f.sender.request.id;
 assert.throws(()=>f.broker.respond(f.sender,{id,accepted:true}));assert.equal(f.broker.acknowledge({},id),false);
 assert.equal(f.broker.acknowledge(f.sender,id),true);
 assert.throws(()=>f.broker.respond({}, {id,accepted:true}));assert.throws(()=>f.broker.respond(f.sender,{id,accepted:'true'}));
 f.broker.respond(f.sender,{id,accepted:true});assert.equal(await result,true);assert.throws(()=>f.broker.respond(f.sender,{id,accepted:true}));
});
test('sensor consent cancels duplicate requests, timeout, reload, shutdown and unmount',async()=>{
 for(const reason of ['timeout','did-start-loading','render-process-gone','destroyed','stop','unmount','cancel']){
  const f=fixture();f.broker.setReady(f.sender,true);const p=f.broker.ask(f.window);
  assert.equal(await f.broker.ask(f.window),false);
  if(reason==='timeout')f.timeout();else if(reason==='stop')f.broker.stop();else if(reason==='unmount')f.broker.setReady(f.sender,false);
  else if(reason==='cancel'){f.broker.acknowledge(f.sender,f.sender.request.id);f.broker.respond(f.sender,{id:f.sender.request.id,accepted:false});}
  else f.sender.emit(reason);
  assert.equal(await p,false);assert.equal(f.sender.listenerCount('destroyed'),0);
 }
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {shouldRestore,createFpsExpiry}=require('../electron/fps-expiry.cjs');
test('expiry checks a high view limit even when FPS is already 300',async()=>{
 let writes=0;
 const worker=createFpsExpiry({account:{state:()=>({user:{id:'u'}}),sync:async()=>({user:{id:'u'},vipStatus:'expired'})},fps:{managedRoots:()=>['fixture'],state:async()=>({cap:300,visualRange:1000}),restoreExpired:async(_r,check)=>{await check();writes++;return {message:'restored'};}}});
 await worker.tick();assert.equal(writes,1);await worker.stop();
});
test('only confirmed VIP expiry triggers restore; administrator, active VIP, free, logout and revoked do not',()=>{
  assert.equal(shouldRestore({user:{id:'u'},administrator:false,vipStatus:'expired'}),true);
  for(const state of [{user:{id:'u'},administrator:true,vipStatus:'expired'},{user:{id:'u'},vipStatus:'active'},{user:{id:'u'},vipStatus:'none'},{user:{id:'u'},status:'expired',vipStatus:'unknown'},{user:null,vipStatus:'expired'},{user:{id:'u'},vipStatus:'revoked'}])assert.equal(shouldRestore(state),false);
});
test('expiry worker waits for game exit, retries, preserves renewals and ignores offline',async()=>{
  let user={user:{id:'u'},vipStatus:'expired'}, offline=false,running=true,cap=600,writes=0;
  const account={state:()=>user,sync:async()=>{if(offline)throw Error('offline');return user;}};
  const fps={managedRoots:()=>['fixture'],state:async()=>({cap}),restoreExpired:async(root,check)=>{if(running)throw Error('退出游戏');await check();writes++;cap=300;return {message:'恢复成功'};}};
  const notices=[], worker=createFpsExpiry({account,fps,notify:n=>notices.push(n)});
  await worker.tick();assert.equal(writes,0);assert.equal(worker.state().pending,true);
  await worker.tick();assert.equal(notices.length,1);
  running=false;offline=true;await worker.tick();assert.equal(writes,0);
  offline=false;user={...user,vipStatus:'active'};await worker.tick();assert.equal(writes,0);
  user={...user,vipStatus:'expired'};await worker.tick();assert.equal(writes,1);assert.equal(cap,300);
  await worker.tick();assert.equal(writes,1);
  worker.stop();
});
test('role change immediately before commit cancels rollback',async()=>{
  let calls=0,writes=0;
  const worker=createFpsExpiry({account:{state:()=>({user:{id:'u'}}),sync:async()=>({user:{id:'u'},vipStatus:'expired',administrator:++calls>1})},fps:{managedRoots:()=>['fixture'],state:async()=>({cap:999}),restoreExpired:async(r,check)=>{await check();writes++;}}});
  await worker.tick();assert.equal(writes,0);assert.match(worker.state().message,/权限已变化/);
});
test('shutdown waits for pending check and cannot start a delayed rollback',async()=>{
  let finish,writes=0;
  const delayed=new Promise(resolve=>{finish=resolve;});
  const worker=createFpsExpiry({account:{state:()=>({user:{id:'u'}}),sync:()=>delayed},fps:{managedRoots:()=>['fixture'],state:async()=>({cap:600}),restoreExpired:async()=>{writes++;}}});
  const running=worker.tick();let stopped=false;
  const stopping=worker.stop().then(()=>{stopped=true;});
  await Promise.resolve();assert.equal(stopped,false);
  finish({user:{id:'u'},vipStatus:'expired'});
  await Promise.all([running,stopping]);assert.equal(stopped,true);assert.equal(writes,0);
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createVipPolicy,routeFeature,features}=require('../electron/vip-policy.cjs');
test('free, pilot, VIP, expired and revoked access',()=>{
  let value={status:'unlicensed',features:[],user:{id:'a'}};
  const policy=createVipPolicy({state:()=>value});
  assert.equal(policy.state().signinLimit,1);
  assert.throws(()=>policy.requireFeature('lab.all'),/VIP/);
  assert.throws(()=>policy.requireFeature('quick.optimal'),/最佳优化/);
  value={...value,status:'active',features:['test.pilot']};assert.equal(policy.state().features.length,0);
  value.features=['vip']; assert.equal(policy.state().features.length,Object.keys(features).length);assert.equal(policy.state().signinLimit,3);
  assert.doesNotThrow(()=>policy.requireFeature('quick.optimal'));
  for(const status of ['expired','revoked','invalid','clock_error']) {value.status=status;assert.equal(policy.state().features.length,0);assert.equal(policy.state().signinLimit,1)}
});
test('partial grants and signed-in account cannot borrow a different legacy grant',()=>{
  const policy=createVipPolicy({state:()=>({status:'active',user:{id:'a'},features:['network.nic']})},{state:()=>({status:'active',features:['vip']})});
  assert.deepEqual(policy.state().features,['network.nic']);assert.throws(()=>policy.requireFeature('quick.maximum'));assert.equal(policy.state().signinLimit,1);
});
test('all execution routes gated but stops and recovery stay free',()=>{
  assert.equal(routeFeature('/api/network/tcp/apply','GET'),'network.tcp');
  assert.equal(routeFeature('/api/network/nic/property','GET'),'network.nic');
  assert.equal(routeFeature('/api/lab/session/registry','GET'),null);
  for(const [path,feature] of [['/api/lab/start','lab.all'],['/api/lab/session/trim','lab.all'],['/api/lab/session/start','lab.all'],['/api/network/tcp/apply','network.tcp'],['/api/network/qos/apply','network.tcp'],['/api/network/nic/property','network.nic'],['/api/system/expert/apply','system.expert']])assert.equal(routeFeature(path,'POST'),feature);
  for(const path of ['/api/lab/restore','/api/lab/session/stop','/api/lab/session/gpu-restore','/api/network/tcp/restore','/api/network/nic/restore','/api/network/nic/audit','/api/network/qos/remove','/api/system/expert/restore'])assert.equal(routeFeature(path,'POST'),null);
});

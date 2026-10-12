const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createAdminAccess} = require('../electron/admin-access.cjs');
const {createVipPolicy} = require('../electron/vip-policy.cjs');
test('FPS requires fresh account role; VIP, legacy features and display metadata never grant it', async()=>{
  for(const state of [
    {status:'active',user:{id:'a',role:'admin'},features:['vip','jiuyin.fps','account.admin']},
    {status:'expired',user:{id:'a'},administrator:true},
    {status:'active',administrator:true},
  ]) {
    const account = {state:()=>state,sync:async()=>state};
    assert.throws(()=>createVipPolicy(account).requireFeature('jiuyin.fps'),/管理员/);
    await assert.rejects(createAdminAccess(account,{requireAccess(){}})('jiuyin.fps'),/管理员/);
  }
  assert.throws(()=>createVipPolicy(null,{state:()=>({status:'active',administrator:true,features:['vip','jiuyin.fps']})}).requireFeature('jiuyin.fps'));
});
test('each FPS write checks online role again; offline or demoted claims fail closed',async()=>{
  let calls=0, live=true;
  const account={sync:async()=>{calls++;return {user:{id:'a'},status:'active',administrator:live};}};
  const check=createAdminAccess(account,{requireAccess(){}});
  await check('jiuyin.fps'); live=false;
  await assert.rejects(check('jiuyin.fps'),/管理员/);
  assert.equal(calls,2);
  await assert.rejects(createAdminAccess({sync:async()=>{throw Error('offline')}},{requireAccess(){}})('jiuyin.fps'),/offline/);
  await assert.rejects(check('unknown'),/不支持/);
});

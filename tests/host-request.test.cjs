const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {requestHostJson}=require('../electron/host-request.cjs');
const endpoint={port:1,token:'isolated'};
test('host errors retain permission and validation reasons',async()=>{
  await assert.rejects(requestHostJson(endpoint,{path:'/api/network/tcp/apply',method:'POST'},'vip',async()=>({ok:false,status:403,json:async()=>({error:'VIP 专属功能'})})),/VIP/);
});
test('transport failure is friendly and never replays a write',async()=>{
  let calls=0;
  await assert.rejects(requestHostJson(endpoint,{path:'/api/system/apply',method:'POST'},'vip',async()=>{calls++;throw new TypeError('fetch failed')}),/结果尚未确认.*不要重复提交/);
  assert.equal(calls,1);
  await assert.rejects(requestHostJson(endpoint,{path:'/api/reports/list',method:'POST'},'vip',async()=>{throw new TypeError('fetch failed')}),/本地服务连接中断.*刷新/);
});
test('response body read is also bounded by timeout',async()=>{
  const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.write('{');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    await assert.rejects(requestHostJson({port:server.address().port,token:'isolated'},{path:'/api/status',method:'GET'},'',fetch,80),/响应超时/);
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('successful calls preserve endpoint, credentials and method',async()=>{
  const data=await requestHostJson(endpoint,{path:'/api/reports/list',method:'POST',body:'{}'},'vip',async(url,options)=>{
    assert.equal(url,'http://127.0.0.1:1/api/reports/list');assert.equal(options.headers['X-SynapseX-Token'],'isolated');assert.equal(options.headers['X-SynapseX-Vip'],'vip');assert.equal(options.body,'{}');assert.equal(options.redirect,'error');assert.ok(options.signal);
    return {ok:true,json:async()=>[]};
  });assert.deepEqual(data,[]);
});

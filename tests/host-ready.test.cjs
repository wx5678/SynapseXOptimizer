const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {waitForHost}=require('../electron/host-ready.cjs');
test('API readiness does not accept a missing or JSON UI; waits for real HTML',async t=>{
 let uiCalls=0;
 const server=http.createServer((req,res)=>{
   assert.equal(req.headers['x-synapsex-token'],'test-token');
   if(req.url.startsWith('/api'))return res.end('{}');
   uiCalls++;
   res.setHeader('Content-Type',uiCalls<3?'application/json':'text/html');
   res.end(uiCalls<3?'{"error":"ReadAllBytes failed"}':'<!doctype html><div id="root"></div>');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 await waitForHost(server.address().port,'test-token',2000);assert.equal(uiCalls,3);
});
test('unrecoverable missing page reports an actionable startup error',async t=>{
 const server=http.createServer((req,res)=>res.end('{}'));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 await assert.rejects(waitForHost(server.address().port,'test',200),/页面资源未就绪/);
});
test('portable uses per-launch extraction according to installed builder implementation',()=>{
 const config=require('../package.json');assert.equal(config.build.portable.unpackDirName,true);
 // 26.15.3 documentation says false, but the implementation generates a shared
 // build id for false. true is required to leave UNPACK_DIR_NAME undefined.
 const pnpm=path.join(__dirname,'../node_modules/.pnpm');
 const folder=fs.readdirSync(pnpm).find(name=>name.startsWith('app-builder-lib@26.15.3_'));
 const base=path.join(pnpm,folder,'node_modules/app-builder-lib');
 const code=fs.readFileSync(path.join(base,'out/targets/nsis/NsisTarget.js'),'utf8');
 assert.match(code,/typeof unpackDirName === "string" \|\| !unpackDirName/);
 const script=fs.readFileSync(path.join(base,'templates/nsis/portable.nsi'),'utf8');
 assert.match(script,/StrCpy \$INSTDIR "\$PLUGINSDIR\\app"/);
});

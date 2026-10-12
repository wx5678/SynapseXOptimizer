const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
test('window lights real preload, animation and interruption',{skip:process.platform!=='win32',timeout:45000},async()=>{
 const {createServer}=await import('vite');const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'synapsex-lights-ui-'));
 const env={...process.env,SYNAPSEX_LIGHTS_UI_URL:`http://127.0.0.1:${server.httpServer.address().port}/tests/window-lights-preview.html`};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(require('electron'),[path.join(__dirname,'window-lights.native.cjs'),directory],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v);
 try{const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});assert.equal(code,0,output);assert.match(output,/PASS: lights/);console.log(output.trim());}
 finally{await server.close();if(child.exitCode!==null){assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('synapsex-lights-ui-'));fs.rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}}
});

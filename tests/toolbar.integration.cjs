const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
test('toolbar real Electron layout and interactions',{skip:process.platform!=='win32',timeout:60000},async()=>{
 const {createServer}=await import('vite');const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'synapsex-toolbar-ui-'));
 const env={...process.env,SYNAPSEX_TOOLBAR_UI_URL:`http://127.0.0.1:${server.httpServer.address().port}/tests/toolbar-preview.html`};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(require('electron'),[path.join(__dirname,'toolbar.native.cjs'),directory],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 try {const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});assert.equal(code,0,output);assert.match(output,/PASS: toolbar/);console.log(output.trim());}
 finally {await server.close();if(child.exitCode!==null){assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('synapsex-toolbar-ui-'));fs.rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}}
});

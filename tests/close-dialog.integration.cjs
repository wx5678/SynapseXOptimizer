const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
test('real themed close dialog and IPC',{skip:process.platform!=='win32',timeout:40000},async()=>{
 const {createServer}=await import('vite');
 const server=await createServer({server:{host:'127.0.0.1',port:0,strictPort:false}});await server.listen();
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'synapsex-close-ui-'));
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const url=`http://127.0.0.1:${server.httpServer.address().port}/tests/close-dialog-preview.html`;
 env.SYNAPSEX_CLOSE_UI_URL=url;
 const child=spawn(require('electron'),[path.join(__dirname,'close-dialog.native.cjs'),directory,path.resolve(__dirname,'../design-evidence/close-dialog-0.39.24')],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 try {const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});assert.equal(code,0,output);assert.match(output,/PASS: real preload/);console.log(output.trim());}
 finally {await server.close();if(child.exitCode!==null){assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('synapsex-close-ui-'));fs.rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}}
});

const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
test('power library UI search, acknowledgments, selection reset, themes and narrow layout',{skip:process.platform!=='win32',timeout:40000},async()=>{
 const {createServer}=await import('vite');const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'synapsex-power-ui-')),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 env.SYNAPSEX_POWER_UI_URL=`http://127.0.0.1:${server.httpServer.address().port}/tests/power-library-preview.html`;
 const child=spawn(require('electron'),[path.join(__dirname,'power-library.native.cjs'),dir,path.resolve(__dirname,'../design-evidence/power-library-0.39.32')],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 try{const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});assert.equal(code,0,output);console.log(output.trim());}
 finally{await server.close();if(child.exitCode!==null){assert.equal(path.dirname(fs.realpathSync(dir)),fs.realpathSync(os.tmpdir()));assert(path.basename(dir).startsWith('synapsex-power-ui-'));fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}}
});

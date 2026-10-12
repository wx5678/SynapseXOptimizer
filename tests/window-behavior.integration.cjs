const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
test('real Electron tray lifecycle',{skip:process.platform!=='win32',timeout:30000},async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'synapsex-tray-native-'));
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(require('electron'),[path.join(__dirname,'window-behavior.native.cjs'),directory],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
 try {
   const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
   assert.equal(code,0,output);assert.match(output,/PASS: real close event/);console.log(output.trim());
 } finally {
   if(child.exitCode !== null){assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('synapsex-tray-native-'));fs.rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
 }
});

const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function scenario(mode,owner=process.pid){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'synapsex-supervisor-'));
 const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'../host/WatchLocalHost.ps1'),'-ScriptPath',path.join(__dirname,'fixtures/host-supervisor-child.ps1'),'-Port','49123','-SessionToken','a'.repeat(32),'-VipToken','b'.repeat(32),'-OwnerProcessId',String(owner)],{windowsHide:true,stdio:'ignore',env:{...process.env,SYNAPSEX_SUPERVISOR_FIXTURE:root,SYNAPSEX_SUPERVISOR_MODE:mode}});
 const attempts=()=>{const file=path.join(root,'attempts.txt');return fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split(/\r?\n/):[]};
 return {child,attempts,wait:async()=>{for(let n=0;n<160&&child.exitCode===null;n++)await delay(100);assert.notEqual(child.exitCode,null,'Supervisor must stop');return child.exitCode;},cleanup:()=>{assert.ok(path.resolve(root).startsWith(path.join(os.tmpdir(),'synapsex-supervisor-')));fs.rmSync(root,{recursive:true,force:true});}};
}
test('supervisor preserves arguments, retries once then honors clean shutdown',{skip:process.platform!=='win32',timeout:25000},async()=>{
 const f=await scenario('recover');try{assert.equal(await f.wait(),0);assert.equal(f.attempts().length,2);}finally{f.cleanup();}
});
test('supervisor stops after three recovery attempts, not an infinite restart loop',{skip:process.platform!=='win32',timeout:25000},async()=>{
 const f=await scenario('fail');try{assert.equal(await f.wait(),17);assert.equal(f.attempts().length,4);}finally{f.cleanup();}
});
test('owner app exiting closes its service child and supervisor',{skip:process.platform!=='win32',timeout:25000},async()=>{
 const owner=spawn(process.execPath,['-e','setTimeout(()=>{},30000)'],{windowsHide:true,stdio:'ignore'});const f=await scenario('wait',owner.pid);
 try{for(let n=0;n<60&&!f.attempts().length;n++)await delay(100);assert.equal(f.attempts().length,1);const pid=Number(f.attempts()[0]);owner.kill();assert.equal(await f.wait(),0);assert.throws(()=>process.kill(pid,0));}finally{owner.kill();f.cleanup();}
});

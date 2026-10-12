const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
test('NIP parser, eight original files, encodings and transactional recovery',{skip:process.platform!=='win32',timeout:30000},()=>{
 const env={...process.env};delete env.PSModulePath;
 const result=execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'Test-NvidiaNip.ps1')],{env,encoding:'utf8',windowsHide:true});assert.match(result,/"passed":true/);assert.match(result,/"realDriverWrites":0/);
});
test('NVIDIA configuration bundle contains no installers or scripts',()=>{
 const folder=path.resolve(__dirname,'../host/nvidia-library');assert.equal(fs.readdirSync(folder).length,9);for(const name of fs.readdirSync(folder))assert.match(name,/^(?:catalog\.json|[a-f0-9]{64}\.nip)$/);
});

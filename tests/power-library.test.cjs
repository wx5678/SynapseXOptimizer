const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),folder=path.join(root,'host/power-library');
test('all 75 original power plans are individually selectable and hash verified',()=>{
 const data=JSON.parse(fs.readFileSync(path.join(folder,'catalog.json'),'utf8'));
 assert.equal(data.schema,1);assert.equal(data.items.length,75);assert.equal(new Set(data.items.map(p=>p.id)).size,75);
 for(const item of data.items){
  assert.match(item.id,/^[a-f0-9]{64}$/);
  const bytes=fs.readFileSync(path.join(folder,item.id+'.pow'));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),item.id);
  assert.ok(item.files.length);for(const name of item.files)assert.equal(name,path.basename(name));
  assert.equal(item.highRisk,item.values.idleDisabled===1||item.values.autonomousMode===0||[1,3].includes(item.values.schedulingPolicy)||[1,3].includes(item.values.shortSchedulingPolicy));
 }
 assert.equal(data.unavailable.length,2);
 assert.equal(fs.readdirSync(folder).filter(x=>x.endsWith('.pow')).length,75);
});
test('power library mocked transactions reject bad input, roll back failures and restore latest backup',{skip:process.platform!=='win32',timeout:30000},()=>{
 const env={...process.env};delete env.PSModulePath;
 const result=execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'Test-PowerLibrary.ps1')],{env,encoding:'utf8',windowsHide:true});
 assert.match(result,/"passed":true/);assert.match(result,/"realPowerWrites":0/);
});

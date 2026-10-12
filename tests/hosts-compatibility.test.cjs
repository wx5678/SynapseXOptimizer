const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
test('Hosts missing, hidden/system metadata, denied, locked, read-only and race states stay isolated',{skip:process.platform!=='win32',timeout:30000},()=>{
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'Test-HostsCompatibility.ps1')],{encoding:'utf8',windowsHide:true,timeout:25000});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
  const data=JSON.parse(result.stdout.trim());
  assert.equal(data.passed,true);assert.equal(data.realHostsWrites,0);assert.equal(data.securityChanges,0);
});
test('Hosts editor cannot save an unreadable placeholder and presents a local warning',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../src/components/OptimizerWorkspace.tsx'),'utf8');
  assert.match(source,/!networkToolkit\.hosts\.writable \|\| networkToolkit\.hosts\.available === false/);
  assert.match(source,/Hosts 暂不可读取，不影响其他网络工具/);
  assert.match(source,/networkToolkit\.hosts\.error && <Notice tone="warn">/);
});

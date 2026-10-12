const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=file=>fs.readFileSync(require.resolve('../'+file),'utf8');
test('host acknowledges shutdown only after lab restore',()=>{
  const host=source('host/SynapseXHost.ps1');
  const shutdown=host.slice(host.indexOf("if ($path -eq '/api/shutdown')"),host.indexOf('switch ($path)'));
  assert.ok(shutdown.indexOf('Restore-SchedulerLab')<shutdown.indexOf('Send-Json'));
  assert.match(source('electron/main.cjs'),/timeout: 10000/);
});
test('renderer consumes and expires offers rather than permitting stale applies',()=>{
  const ui=source('src/components/SchedulerLabPanel.tsx');
  assert.match(ui,/Date\.parse\(sample\.validUntil\)<=Date\.now\(\)/);
  assert.match(ui,/labStart[\s\S]*?setSample\(null\);setTid\(0\)/);
  assert.match(ui,/Date\.parse\(sample\.validUntil\)<=now/);
  assert.match(ui,/if\(lock\.current \|\| designPreview\)return/);
});
test('limited experiments use identity-checked recovery and serialized journal ownership',()=>{
  const native=source('host/modules/SchedulerExperiment.cs'),ps=source('host/modules/SchedulerLab.psm1');
  assert.match(native,/GetProcessIdOfThread\(threadHandle\)!=target.ProcessId/);
  assert.match(native,/Created\(threadHandle,true\)!=target.ThreadStart/);
  assert.match(native,/if\(generation==leaseGeneration\)Stop\(\)/);
  assert.match(ps,/Threading\.Mutex/);assert.match(ps,/current.leaseId -ne \$script:leaseId/);
  assert.match(ps,/WriteAllText[\s\S]*?engine.Begin/);
});

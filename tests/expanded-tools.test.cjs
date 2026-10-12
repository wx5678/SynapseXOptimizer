const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('expanded controls are explicitly confirmed and do not accept raw command payloads',()=>{
  const host=read('host/SynapseXHost.ps1');
  for(const route of ['device-service/apply','device-service/restore','system/expert/apply','system/expert/restore','repair/start','system/tools/open'])assert.ok(host.includes('/api/'+route));
  for(const component of ['DeviceServicePanel','ExpertSettingsPanel','RepairJobsPanel','SystemToolsPanel'])assert.match(read(`src/components/${component}.tsx`),/requestConfirmation/);
  assert.doesNotMatch(read('host/modules/ExpertSettings.psm1'),/Invoke-Expression|testsigning|nointegritychecks|ExclusionPath/);
  assert.match(read('host/modules/ExpertSettings.psm1'),/IsTamperProtected/);
  assert.match(read('host/modules/DeviceServiceManager.psm1'),/driverVersion/);
});
test('repair worker captures both streams, uses SFC Unicode, and persists tool completion separately',()=>{
  const worker=read('host/RepairRunner.cs');const module=read('host/modules/RepairJobs.psm1');
  assert.match(worker,/Encoding\.Unicode/);assert.match(worker,/OutputDataReceived/);assert.match(worker,/ErrorDataReceived/);
  assert.match(worker,/process\.WaitForExit\(\)/);assert.match(worker,/return process\.ExitCode/);
  assert.match(module,/Invoke-RepairNative/);assert.match(module,/Mutex/);assert.match(module,/\.ToUniversalTime\(\)/);
  assert.doesNotMatch(module,/Stop-Process|taskkill|ResetBase\s*\/|Stop-Service/);
});
test('system sections render on demand and retain a themed, keyboard-accessible tab bar',()=>{
  const ui=read('src/components/SystemExtensions.tsx');
  assert.match(ui,/ArrowRight/);assert.match(ui,/ArrowLeft/);assert.match(ui,/tabIndex/);
  assert.match(ui,/prism-accent-strong/);assert.match(ui,/SystemToolsPanel/);
  const cleanup=read('host/modules/MaintenanceManager.psm1');
  for(const category of ['browser-cache','crash-dumps','system-logs'])assert.ok(cleanup.includes(category));
  assert.match(cleanup,/Assert-CleanupCategory \$preview.category/);
});

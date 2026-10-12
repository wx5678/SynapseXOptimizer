const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
test('background controls are wired to confirmed native APIs, with pagination and recovery records',()=>{
  const ui=fs.readFileSync(path.join(root,'src/components/BackgroundManagerPanel.tsx'),'utf8');
  const host=fs.readFileSync(path.join(root,'host/SynapseXHost.ps1'),'utf8');
  const workspace=fs.readFileSync(path.join(root,'src/components/OptimizerWorkspace.tsx'),'utf8');
  for(const name of ['catalog','apply','restore'])assert.ok(host.includes('/api/background/'+name));
  assert.match(ui,/requestConfirmation/);assert.match(ui,/!item.canApply/);assert.match(ui,/fingerprint|applyBackground/);
  assert.match(ui,/slice\(currentPage\*30/);assert.match(ui,/不包含应用数据/);
  const extensions=fs.readFileSync(path.join(root,'src/components/SystemExtensions.tsx'),'utf8');
  assert.match(workspace,/<SystemExtensions/);assert.match(extensions,/<BackgroundManagerPanel taskOnly/);assert.match(workspace,/<BackgroundManagerPanel \/>/);
});
test('native background changes never delete tasks, force-stop apps or remove provisioning',()=>{
  const code=fs.readFileSync(path.join(root,'host/modules/BackgroundManager.psm1'),'utf8');
  assert.doesNotMatch(code,/\b(Unregister-ScheduledTask|Stop-ScheduledTask|Remove-AppxProvisionedPackage|Invoke-Expression|ForceApplicationShutdown)\b/);
  assert.match(code,/Remove-AppxPackage -Package \$Entry.native.PackageFullName/);
  assert.match(code,/Get-TaskDefinitionHash/);assert.match(code,/原目录已存在不同的同名文件/);
});

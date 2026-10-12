const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
test('maintenance writes use dedicated confirmations and no arbitrary command/path payloads',()=>{
  const api=fs.readFileSync(path.join(root,'src/lib/api.ts'),'utf8');
  const ui=fs.readFileSync(path.join(root,'src/components/MaintenancePanel.tsx'),'utf8');
  const host=fs.readFileSync(path.join(root,'host/SynapseXHost.ps1'),'utf8');
  assert.match(api,/token, ids, confirmation: "DELETE"/);
  assert.match(api,/id: item.id, fingerprint: item.fingerprint, confirmation: "UNINSTALL"/);
  assert.match(host,/confirmation -cne 'DELETE'/);assert.match(host,/confirmation -cne 'UNINSTALL'/);
  assert.match(ui,/不经过回收站，无法恢复/);assert.match(ui,/启动窗口不代表已经卸载/);
  assert.match(ui,/useState<string\[\]>\(\[\]\)/);assert.match(ui,/setData\(null\);\s*setSelected\(\[\]\)/);
});
test('maintenance avoids recursive deletion, shell commands and automatic uninstall completion',()=>{
  const code=fs.readFileSync(path.join(root,'host/modules/MaintenanceManager.psm1'),'utf8');
  assert.doesNotMatch(code,/Remove-Item[^\n]*-Recurse|Invoke-Expression|Win32_Product|QuietUninstallString/);
  assert.match(code,/FileShare\]::None/);assert.match(code,/ReparsePoint/);assert.match(code,/UseShellExecute=\$false/);
  assert.match(code,/status='launched'/);assert.match(code,/script:previews.Remove\(\$Token\)/);
});

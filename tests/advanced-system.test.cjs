const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname,'..');
test('advanced settings have independent UI, API routes and explicit confirmation', () => {
  const panel=fs.readFileSync(path.join(root,'src/components/AdvancedSystemPanel.tsx'),'utf8');
  const workspace=fs.readFileSync(path.join(root,'src/components/OptimizerWorkspace.tsx'),'utf8');
  const host=fs.readFileSync(path.join(root,'host/SynapseXHost.ps1'),'utf8');
  assert.match(workspace, /<SystemExtensions\b[^>]*\bheader=/);
  assert.match(fs.readFileSync(path.join(root,'src/components/SystemExtensions.tsx'),'utf8'), /<AdvancedSystemPanel\s*\/>/);
  for (const suffix of ['catalog','apply','restore']) assert.ok(host.includes(`/api/system/advanced/${suffix}`));
  assert.match(panel,/requestConfirmation/);
  assert.match(panel,/!item.available/);
  assert.match(panel,/!item.backupId/);
  assert.match(panel,/一键优化中按档位选择/);
});
test('advanced backend never stops live services or accepts arbitrary executable commands', () => {
  const module=fs.readFileSync(path.join(root,'host/modules/AdvancedSystemOptimizer.psm1'),'utf8');
  assert.doesNotMatch(module,/\b(Stop-Service|Start-Service|Invoke-Expression|Stop-ScheduledTask)\b/i);
  assert.match(module,/Set-Service -Name \$Definition.target -StartupType/);
  assert.match(module,/Disable-ScheduledTask/);
  assert.match(module,/Test-AdvancedRestored/);
});

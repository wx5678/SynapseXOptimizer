const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const read = name => readFileSync(path.join(__dirname, '..', name), 'utf8');
test('priority mutation is removed from UI, routes, exported module and native bridge', () => {
  assert.doesNotMatch(read('src/components/OptimizerWorkspace.tsx'), /applyGamePriority|restoreGamePriority|临时进程优先级|priorityControl/);
  assert.doesNotMatch(read('src/lib/api.ts'), /runtime\/priority\//);
  assert.doesNotMatch(read('host/SynapseXHost.ps1'), /runtime\/priority\//);
  assert.doesNotMatch(read('host/modules/RuntimeOptimizer.psm1'), /Set-GameProcessAboveNormal|Restore-GameProcessPriority|Get-ActivePriorityBackup|priorityControl/);
  assert.doesNotMatch(read('host/modules/RuntimeNative.cs'), /SetPriorityClass|CanSet|Written|0x0200/);
  assert.match(read('host/modules/RuntimeNative.cs'), /OpenProcess\(0x1000, false, id\)/);
  assert.match(read('host/SynapseXHost.ps1'), /runtime\/power\/apply/);
});

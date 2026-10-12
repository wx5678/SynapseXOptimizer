const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const read = (file) => readFileSync(path.join(__dirname, '..', file), 'utf8');
test('UI uses functional names instead of design-source and development copy', () => {
  for (const file of ['src/components/OptimizerWorkspace.tsx', 'src/components/RealtimeMonitor.tsx', 'src/components/OptimizationAssistant.tsx', 'host/modules/NetworkToolkit.psm1']) {
    assert.doesNotMatch(read(file), /ProcessX|NetworkOptimizer|Bottleneck Checker|OSD 风格|本地实现|功能整合|参考软件|真正执行|实际影响|已有的确定信息|优化助手/, file);
  }
  assert.match(read('src/components/OptimizationAssistant.tsx'), /使用帮助/);
  const workspace = read('src/components/OptimizerWorkspace.tsx');
  assert.doesNotMatch(workspace, /priorityControl|applyGamePriority|restoreGamePriority|临时进程优先级/);
  assert.match(workspace, /写入前显示确认弹窗/);
  assert.match(workspace, /适配信息与调整范围/);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('quick layout keeps selection independent of display filters and one apply trigger', () => {
  const ui = read('src/components/QuickOptimizationPanel.tsx');
  assert.match(ui, /aria-label="按项目状态筛选"/);
  assert.match(ui, /aria-label="项目分类"/);
  assert.match(ui, /aria-label="搜索方案项目"/);
  assert.match(ui, /className="quick-summary-column"/);
  assert.match(ui, /className="quick-item-effect"/);
  assert.match(ui, /htmlFor=\{\x60quick-\$\{row.key\}\x60\}/);
  const reset = ui.slice(ui.indexOf('function resetFilters()'), ui.indexOf('const pageCount'));
  assert.match(reset, /setQuery/);
  assert.doesNotMatch(reset, /setExcluded/);
  assert.match(ui, /executeQuickPlan\(selected,/);
  assert.doesNotMatch(ui, /executeQuickPlan\(filtered,/);
  assert.equal((ui.match(/onClick=\{\(\) => void apply\(\)\}/g) || []).length, 1);
});

test('main navigation exposes quick optimization and help is anchored outside content', () => {
  const app = read('src/App.tsx'), assistant = read('src/components/OptimizationAssistant.tsx');
  assert.match(app, /ids:\s*\[\s*"overview",\s*"boost"/);
  assert.match(app, /<WorkspaceTopActions connected=\{connected\}/);
  const toolbar = read('src/components/WorkspaceTopActions.tsx');
  assert.match(toolbar, /<MembershipCenter/);
  assert.match(read('src/components/MembershipCenter.tsx'), /id="workspace-help-slot"/);
  assert.match(assistant, /createPortal/);
  assert.match(assistant, /document.getElementById\("workspace-help-slot"\)/);
  const css = read('src/optimization-layout.css');
  assert.match(css, /#workspace-help-slot \.assistant-trigger/);
  assert.match(css, /position:\s*static/);
  assert.match(css, /max-height:\s*calc\(100dvh - 80px\)/);
  assert.match(css, /@media \(max-width:\s*1040px\)/);
  assert.match(css, /var\(--skin-input\)|var\(--skin-soft\)/);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('graphite design scopes tokens away from the OSD and keeps theme accessibility', () => {
  const css = read('src/graphite.css');
  assert.match(css, /html\[data-skin\]:not\(\[data-overlay="1"\]\)/);
  assert.match(css, /html\[data-skin="light"\]:not\(\[data-overlay="1"\]\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /max-width: 1040px/);
  assert.match(css, /max-width: 767px/);
  assert.match(css, /grid-template-rows: auto 1fr/);
  assert.match(css, /data-motion="off"/);
  assert.doesNotMatch(css, /animation:\s*[^;]*infinite/);
  assert.match(read('src/lib/appearance.tsx'), /!gameRunning && !reducedMotion && !hidden/);
});

test('selected design uses a local static image and preserves the single confirmed apply path', () => {
  const ui = read('src/components/QuickOptimizationPanel.tsx');
  assert.match(ui, /assets\/graphite-glass\.png/);
  assert.match(ui, /<details className="quick-filters">/);
  assert.match(ui, /executeQuickPlan\(selected,/);
  assert.equal((ui.match(/onClick=\{\(\) => void apply\(\)\}/g) || []).length, 1);
  assert.ok(fs.statSync(path.join(__dirname, '../src/assets/graphite-glass.png')).size > 10000);
  const appearance = read('src/components/AppearancePanel.tsx');
  assert.match(appearance, /name: "石墨"/);
  assert.match(appearance, /name: "银白"/);
  assert.match(appearance, /aria-pressed/);
  assert.doesNotMatch(appearance, /skin-light-preview|skin-dark-preview/);
});

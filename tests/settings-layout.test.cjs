const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('long-page navigation remains sticky without an intervening body scroller',()=>{
  const css=read('src/graphite.css');
  assert.match(css,/overflow-x: clip; overflow-y: visible/);
  assert.match(css,/\.section-navigation-shell\s*\{\s*position: sticky; top: 96px/);
  const tabs=read('src/components/SystemExtensions.tsx');
  assert.match(tabs,/selectTab\(value\)/);
  assert.match(tabs,/ArrowRight/);
  assert.match(tabs,/window\.scrollTo/);
  assert.match(tabs,/role="tabpanel"/);
});
test('system overview and setting detail disclosures preserve interactive selection and metadata',()=>{
  const ui=read('src/components/OptimizerWorkspace.tsx');
  assert.match(ui,/SystemOverviewStrip data=\{systemAudit\}/);
  assert.match(ui,/disabled=\{tweak.applied\} checked=\{tweak.applied \|\| selected\} onChange=\{onToggle\}/);
  assert.match(ui,/tweak\.tradeoff/);
  assert.match(ui,/hostApi\.applySystem\(selectedTweaks\)/);
  assert.match(ui,/hostApi\.restoreSystem\(\)/);
  assert.match(ui,/aria-label="网络优化分类"/);
  assert.match(read('src/App.tsx'),/page === "overview" &&\s*appearance.preferences.particles &&\s*appearance.effectsActive/);
});

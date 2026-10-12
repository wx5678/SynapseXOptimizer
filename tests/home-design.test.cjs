const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('home chrome and empty chart are scoped and keep icons at their intrinsic size',()=>{
  const css=read('src/home.css');
  assert.match(css,/\[data-page="overview"\] \.workspace-context\.is-overview/);
  assert.match(css,/background: transparent; padding: 0/);
  assert.match(css,/\.chart-empty button svg \{ width: 14px; height: 14px; flex: 0 0 14px/);
  assert.match(css,/@media \(max-width: 1100px\)/);
  assert.match(css,/@media \(max-width: 767px\)/);
  assert.match(read('src/main.tsx'),/import "\.\/home.css"/);
});
test('home redesign keeps real data and navigational actions without starting collectors',()=>{
  const ui=read('src/components/WorkbenchDashboard.tsx');
  assert.match(ui,/useWorkbenchSamples\(\)/);
  assert.match(ui,/hostApi\s*\.backups\(\)/);
  assert.match(ui,/dashboard-session/);
  for(const page of ['boost','monitor','history','reports']) assert.ok(ui.includes(`onNavigate("${page}")`));
  assert.match(ui,/onNavigate\(isJiuyin \? "jiuyin" : "runtime"\)/);
  assert.doesNotMatch(ui,/hostApi\.(start|apply|restore)/);
  assert.match(ui,/n == null \|\| !Number\.isFinite\(n\) \? "—"/);
});

test('detail polish keeps chart type unscaled and a single bottom-left sign-in entry',()=>{
  const ui=read('src/components/WorkbenchDashboard.tsx');
  assert.match(ui,/new ResizeObserver/);
  assert.match(ui,/observer\.disconnect\(\)/);
  assert.doesNotMatch(ui,/preserveAspectRatio="none"/);
  const css=read('src/detail-polish.css');
  assert.match(css,/font-variant-numeric:tabular-nums/);
  assert.match(css,/:focus-visible/);
  assert.doesNotMatch(css,/animation:.*infinite/);
  assert.match(read('src/components/community-signin.css'),/\.global-signin-dock \{ position:fixed; left:14px; bottom:92px/);
  assert.match(read('src/App.tsx'),/sidebar-signin-space/);
});

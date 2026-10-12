const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('navigation hides scrollbars in both states without disabling scrolling', () => {
  const css = read('src/interface-refinement.css');
  assert.match(css, /html \.desktop-workspace \.workspace-navigation \{\s*scrollbar-width: none;/);
  assert.match(css, /\.workspace-navigation::-webkit-scrollbar \{\s*display: none;/);
  assert.match(read('src/App.tsx'), /workspace-navigation min-h-0 flex-1 overflow-y-auto/);
  assert.doesNotMatch(css, /not\(:hover\).*workspace-navigation/);
});

test('footer glyphs share 44px badges, 20px glyphs and accessible names', () => {
  const css = read('src/interface-refinement.css');
  assert.match(css, /sidebar-backup > svg:first-child \{[\s\S]*?width: 44px;[\s\S]*?height: 44px;[\s\S]*?padding: 11px;[\s\S]*?border: 1px solid var\(--prism-line\);[\s\S]*?border-radius: 12px;/);
  assert.match(css, /global-signin-reminder \{\s*height: 44px;\s*border: 0;\s*background: transparent;/);
  assert.match(read('src/membership.css'), /global-signin-reminder > svg:first-child \{\s*width: 44px;\s*height: 44px;/);
  assert.match(read('src/App.tsx'), /aria-label="查看备份与操作记录"/);
  assert.match(read('src/components/GlobalSigninReminder.tsx'), /aria-label="查看今日签到状态"/);
});

test('drawer shares hover ownership with sign-in and avoids filtered clip or text travel', () => {
  const app = read('src/App.tsx');
  const css = read('src/membership.css');
  assert.match(app, /<\/aside>\s*<div className="global-signin-dock">/);
  assert.equal((app.match(/<GlobalSigninReminder /g) || []).length, 1);
  assert.match(css, /workspace-sidebar-frame:is\(:hover, :has\(:focus-visible\)\) \.workspace-sidebar/);
  assert.doesNotMatch(css + read('src/interface-refinement.css'), /filter:\s*drop-shadow/);
  assert.match(css, /contain: layout paint/);
  assert.doesNotMatch(css, /transform 650ms|clip-path 650ms/);
  assert.doesNotMatch(app, /layoutId="nav-indicator"/);
  assert.match(css, /workspace-sidebar-frame:has\(:focus-visible\) \.workspace-sidebar/);
  assert.match(css, /prefers-reduced-motion: no-preference/);
  assert.doesNotMatch(css, /transition:\s*clip-path|will-change:\s*clip-path/);
  assert.match(css, /transition: transform 300ms var\(--ease-in-out\)/);
  assert.match(css, /workspace-sidebar-frame:is\(:hover, :has\(:focus-visible\)\) \.global-signin-reminder > span/);
  assert.doesNotMatch(css, /global-signin-dock:not\(:hover\)/);
});

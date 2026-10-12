const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('public fallback contact keeps the original QR and never grants entitlement', () => {
  assert.deepEqual(fs.readFileSync(path.join(root, 'src/assets/wechat-contact.png')),
    fs.readFileSync(path.join(root, 'server/license-service/public-assets/wechat.png')));
  const fallback = read('src/lib/member-offer.ts');
  assert.match(fallback, /Tens__/);
  assert.match(fallback, /一对一系统优化/);
  assert.doesNotMatch(fallback, /required:|available:|status:|enabled:|expiresAt:/);
  const ui = read('src/components/MembershipCenter.tsx');
  assert.match(ui, /参考价格/);
  assert.match(ui, /memberOffer\(config\)/);
  assert.match(ui, /navigator\.clipboard\.writeText\(offer\.wechat\)/);
  assert.match(ui, /disabled=\{refreshing \|\| !api\?\.product\}/);
});

test('drawer animates a separate transform-only surface and supports reduced motion and keyboard access', () => {
  const style = read('src/membership.css');
  assert.match(style, /transition: transform 300ms var\(--ease-in-out\)/);
  assert.match(style, /will-change: transform/);
  assert.doesNotMatch(style, /transition: clip-path|will-change: clip-path/);
  assert.doesNotMatch(style, /filter:\s*drop-shadow/);
  assert.match(style, /round 30px/);
  assert.match(style, /hover: hover/);
  assert.match(style, /pointer: fine/);
  assert.match(style, /prefers-reduced-motion/);
  assert.match(style, /:has\(:focus-visible\)/);
  assert.doesNotMatch(style, /transition:\s*(all|width|height)/);
  assert.match(read('src/interface-refinement.css'), /data-overlay="1"/);
});

test('rail has inset ends and a shared icon lane including backup and sign-in', () => {
  const style = read('src/membership.css');
  assert.match(style, /top: 24px;\s*bottom: 24px;\s*left: 28px;/);
  assert.match(style, /\.workspace-nav-item, \.more-tools-toggle, \.sidebar-backup\) > svg:first-child/);
  assert.match(style, /left: 44px;\s*bottom: 116px;\s*width: 204px;/);
  assert.match(style, /clip-path: inset\(0 160px 0 0 round 12px\)/);
  assert.match(style, /\.global-signin-reminder > svg:first-child/);
  assert.match(read('src/App.tsx'), /data-drawer-motion=\{appearance.preferences.motion && !appearance.reducedMotion/);
  assert.match(style, /prefers-reduced-motion: no-preference/);
  assert.match(style, /data-drawer-motion="on"/);
});

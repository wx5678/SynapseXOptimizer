const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createFpsCollector } = require('../electron/fps-collector.cjs');
const target = { processId: 11, processName: 'fxgame.exe', mode: 'auto' };
const header = 'Application,ProcessID,SwapChainAddress,msBetweenPresents,Dropped\n';
function harness() {
  const children = []; let time = 1000;
  const collector = createFpsCollector({ executable: 'PresentMon.exe', exists: () => true, now: () => time,
    spawn: (_exe, args) => {
      const child = new EventEmitter(); child.args = args;
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      child.stdout.setEncoding = child.stderr.setEncoding = () => {};
      child.kill = () => { child.killed = true; }; child.unref = () => {};
      children.push(child); return child;
    } });
  return { collector, children, advance: ms => { time += ms; } };
}
test('stream accepts partial rows, isolates PID/swapchain, and counts dropped application presents', () => {
  const h = harness(); h.collector.start(target); const child = h.children[0];
  assert.deepEqual(child.args.slice(0, 3), ['--process_id', '11', '--output_stdout']);
  assert.ok(child.args.includes('--no_track_display') && child.args.includes('--no_track_gpu') && child.args.includes('--no_track_input'));
  const text = header + Array.from({ length: 90 }, (_, i) => `fxgame.exe,11,A,16.6667,${i % 2}\nfxgame.exe,22,A,33.333,0\n` + (i % 4 === 0 ? 'fxgame.exe,11,B,100,0\n' : '')).join('');
  for (let i = 0; i < text.length; i += 31) child.stdout.emit('data', text.slice(i, i + 31));
  assert.equal(h.collector.state().fps, 60);
  assert.equal(h.collector.state().targetProcessId, 11);
  h.advance(11000); assert.equal(h.collector.state().status, 'no-frame-data');
  assert.equal(h.collector.state().fps, null);
});
test('old exit and delayed cleanup cannot affect replacement; duplicate starts are idempotent', () => {
  const h = harness(); h.collector.start(target); const old = h.children[0];
  h.collector.start(target); assert.equal(h.children.length, 1);
  h.collector.start({ ...target, processId: 12 });
  const cleanup = h.children[1]; const next = h.children[2];
  assert.notEqual(old.args[old.args.indexOf('--session_name') + 1], next.args[next.args.indexOf('--session_name') + 1]);
  assert.equal(cleanup.args[2], old.args[old.args.indexOf('--session_name') + 1]);
  cleanup.emit('close', 0);
  old.emit('close', 1); old.stderr.emit('data', 'old failure');
  assert.equal(h.collector.state().running, true); assert.equal(h.collector.state().error, '');
});
test('permission failures remain visible and do not silently restart until manual retry', () => {
  const h = harness(); h.collector.start(target); h.children[0].stderr.emit('data', 'Access denied'); h.children[0].emit('close', 5);
  assert.equal(h.collector.state().status, 'permission-denied'); assert.equal(h.collector.state().running, false);
  h.collector.start(target); assert.equal(h.children.length, 1);
  h.collector.start({ ...target, retry: true }); assert.equal(h.children.length, 3);
  h.children[2].emit('error', new Error('ENOENT'));
  assert.equal(h.collector.state().status, 'collector-error');
});
test('bounded stream accepts long sessions and slow frames without file IO', () => {
  const h = harness(); h.collector.start(target);
  h.children[0].stdout.emit('data', header + 'fxgame.exe,11,A,10,0\n'.repeat(100000));
  assert.equal(h.collector.state().fps, 100);
  h.advance(4000); h.children[0].stdout.emit('data', 'fxgame.exe,11,A,1500,0\n'.repeat(3));
  assert.equal(h.collector.state().fps, 0.7);
  h.collector.stop(); assert.equal(h.collector.state().status, 'stopped');
});
test('requires an exact live-process PID', () => {
  const h = harness(); assert.equal(h.collector.start({ ...target, processId: 0 }).status, 'target-missing');
  assert.equal(h.children.length, 0);
});

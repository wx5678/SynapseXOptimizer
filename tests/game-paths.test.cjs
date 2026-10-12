const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createGamePathStore } = require('../electron/game-paths.cjs');
test('paths survive restart, merge saves, and reject invalid updates without erasing valid data', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapsex-path-test-'));
  const exe = path.join(dir, 'fxgame.exe'); const launcher = path.join(dir, 'fxlaunch.exe');
  fs.writeFileSync(exe, 'fixture'); fs.writeFileSync(launcher, 'fixture');
  try {
    const store = createGamePathStore(dir);
    await Promise.all([store.write({ gameRoot: dir }), store.write({ gpuExecutable: exe })]);
    assert.deepEqual(createGamePathStore(dir).read(), { gameRoot: dir, gpuExecutable: exe });
    await assert.rejects(store.write({ gpuExecutable: path.join(dir, 'missing.exe') }));
    await assert.rejects(store.write({ gameRoot: '' }));
    assert.deepEqual(store.read(), { gameRoot: dir, gpuExecutable: exe });
  } finally {
    for (const file of [exe, launcher, path.join(dir, 'game-paths-v1.json')]) if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(dir);
  }
});

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createAppearanceStore, normalize } = require("../electron/appearance.cjs");
test("appearance only accepts the four supported preferences", () => {
  assert.deepEqual(normalize({ skin: "other", motion: "true", particles: 1, followSystem: "false", command: "unused" }), { skin: "dark", motion: true, particles: false, followSystem: false });
});
test("theme survives a new store instance and concurrent saves are ordered", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "synapsex-appearance-test-"));
  const store = createAppearanceStore(dir);
  await Promise.all([store.write({ skin: "dark", particles: true }), store.write({ skin: "light", motion: false, followSystem: true, particles: false })]);
  assert.deepEqual(createAppearanceStore(dir).read(), { skin: "light", motion: false, followSystem: true, particles: false });
  // Remove only these explicitly named test-owned files and the empty temp folder.
  fs.unlinkSync(path.join(dir, "appearance-v1.json")); fs.rmdirSync(dir);
});

const fs = require("node:fs");
const path = require("node:path");
const defaults = Object.freeze({ skin: "dark", followSystem: false, motion: true, particles: false });
function normalize(value) {
  return { skin: value?.skin === "light" ? "light" : "dark", followSystem: value?.followSystem === true, motion: typeof value?.motion === "boolean" ? value.motion : true, particles: value?.particles === true };
}
function createAppearanceStore(directory) {
  const filename = path.join(directory, "appearance-v1.json");
  let queue = Promise.resolve();
  return {
    read() { try { return normalize(JSON.parse(fs.readFileSync(filename, "utf8"))); } catch { return { ...defaults }; } },
    write(value) {
      const settings = normalize(value);
      const operation = queue.catch(() => {}).then(async () => {
        await fs.promises.mkdir(directory, { recursive: true });
        const temp = filename + ".pending";
        await fs.promises.writeFile(temp, JSON.stringify(settings, null, 2), "utf8");
        await fs.promises.rename(temp, filename);
        return settings;
      });
      queue = operation;
      return operation;
    },
  };
}
module.exports = { createAppearanceStore, normalize };

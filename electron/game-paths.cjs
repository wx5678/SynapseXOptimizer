const fs = require('node:fs');
const path = require('node:path');

function createGamePathStore(directory) {
  const file = path.join(directory, 'game-paths-v1.json');
  let queue = Promise.resolve();
  const read = () => {
    try {
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      return { gameRoot: typeof value.gameRoot === 'string' ? value.gameRoot : '', gpuExecutable: typeof value.gpuExecutable === 'string' ? value.gpuExecutable : '' };
    } catch { return { gameRoot: '', gpuExecutable: '' }; }
  };
  return { read, write(update) {
    const operation = queue.catch(() => {}).then(async () => {
      const value = read();
      for (const key of ['gameRoot', 'gpuExecutable']) {
        if (update?.[key] === undefined) continue;
        const candidate = typeof update[key] === 'string' ? update[key].trim() : '';
        if (!candidate || !path.isAbsolute(candidate)) throw new Error('请选择有效的完整游戏路径。');
        if (key === 'gpuExecutable') {
          if (path.extname(candidate).toLowerCase() !== '.exe' || !fs.statSync(candidate).isFile()) throw new Error('游戏程序不存在。');
        } else if (!fs.statSync(path.join(candidate, 'fxlaunch.exe')).isFile()) throw new Error('请选择九阴真经安装目录。');
        value[key] = path.normalize(candidate);
      }
      await fs.promises.mkdir(directory, { recursive: true });
      await fs.promises.writeFile(file + '.pending', JSON.stringify(value, null, 2), 'utf8');
      await fs.promises.rename(file + '.pending', file);
      return value;
    });
    queue = operation;
    return operation;
  } };
}
module.exports = { createGamePathStore };

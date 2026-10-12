const fs = require('node:fs');
const path = require('node:path');
const validId = id => typeof id === 'string' && /^session-\d{8}-\d{6}-[0-9a-f]{8}$/.test(id);
function createReportOutbox(directory) {
  const root = path.join(directory, 'performance-report-outbox');
  function put(report) {
    if (!validId(report?.id) || !report.game?.processName || !report.game?.startedAt) throw Error('无效的报告缓存');
    const json = JSON.stringify(report);
    if (Buffer.byteLength(json) > 4 * 1024 * 1024) throw Error('报告缓存超过大小限制');
    fs.mkdirSync(root, { recursive: true });
    const file = path.join(root, report.id + '.json');
    fs.writeFileSync(file + '.tmp', json, { mode: 0o600 });
    fs.renameSync(file + '.tmp', file);
  }
  function list() {
    if (!fs.existsSync(root)) return [];
    return fs.readdirSync(root).filter(name => name.endsWith('.json') && validId(name.slice(0, -5))).map(name => {
      const value = JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
      if (value.id !== name.slice(0, -5)) throw Error('报告缓存标识不匹配');
      return value;
    });
  }
  function remove(id) {
    if (!validId(id)) throw Error('无效的报告标识');
    fs.rmSync(path.join(root, id + '.json'), { force: true });
  }
  return { put, list, remove };
}
module.exports = { createReportOutbox };

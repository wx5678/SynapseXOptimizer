// Read-only sequential PCK0 payload scanner for packages larger than Node's 2 GiB Buffer limit.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = 'D:/game/游戏蜗牛/9yinjh';
const patterns = {
  globalAction: /SetGlobalSpeed|SetStateSpeed|LoadAllAction|ActionPrefix/gi,
  actionSpeed: /ActionSpeed|action_speed|SetBlendActionSpeed|PlaySpeed/gi,
  actionTiming: /hitout_start_time|start_frame|prepare_time|blend_time|sync_frame/gi,
  animationLOD: /animation_lod|AnimationLod|action_lod|actor_lod/gi,
  visualPerformance: /max_display_fps|effect_quality|other_effect|grass_radius/gi,
};

for (const name of process.argv.slice(2)) {
  if (!/^[\w.-]+\.(?:package|patch)$/.test(name)) throw new Error('Invalid package name');
  const file = path.join(root, name.endsWith('.patch') ? 'patch' : 'res', name);
  const before = fs.statSync(file);
  const fd = fs.openSync(file, 'r');
  try {
    const header = Buffer.alloc(18);
    if (fs.readSync(fd, header, 0, 18, 0) !== 18 || header.toString('ascii', 0, 4) !== 'PCK0') throw new Error('Invalid PCK0 header');
    let start = header.readUInt32LE(14), readAt = start, cursor = start, buffer = Buffer.alloc(0);
    const totals = Object.fromEntries(Object.keys(patterns).map(key => [key, 0]));
    const examples = Object.fromEntries(Object.keys(patterns).map(key => [key, []]));
    let blocks = 0, rejected = 0, oversized = 0;
    function fill() {
      if (readAt >= before.size) return false;
      const next = Buffer.allocUnsafe(Math.min(8 * 1024 * 1024, before.size - readAt));
      const bytes = fs.readSync(fd, next, 0, next.length, readAt);
      if (!bytes) return false;
      buffer = Buffer.concat([buffer, next.subarray(0, bytes)]);
      readAt += bytes;
      return true;
    }
    while (cursor < before.size - 2) {
      if (cursor - start > 8 * 1024 * 1024) {
        const drop = cursor - start;
        buffer = buffer.subarray(drop);
        start = cursor;
      }
      if (buffer.length < cursor - start + 3 && !fill()) break;
      let at = buffer.indexOf(0x78, cursor - start);
      if (at < 0 || at === buffer.length - 1) {
        cursor = start + Math.max(0, buffer.length - 1);
        if (!fill()) break;
        continue;
      }
      const absolute = start + at;
      if (((buffer[at] << 8) + buffer[at + 1]) % 31 !== 0) { cursor = absolute + 1; continue; }
      let result;
      while (true) {
        try {
          result = zlib.inflateSync(buffer.subarray(at), { info: true, maxOutputLength: 64 * 1024 * 1024 });
          break;
        } catch (error) {
          if (error.code === 'Z_BUF_ERROR' && buffer.length < 96 * 1024 * 1024 && fill()) continue;
          if (error.code === 'ERR_BUFFER_TOO_LARGE') oversized++;
          rejected++;
          break;
        }
      }
      if (!result) { cursor = absolute + 1; continue; }
      blocks++;
      const decoded = result.buffer.toString('latin1');
      for (const [key, pattern] of Object.entries(patterns)) {
        pattern.lastIndex = 0;
        for (const match of decoded.matchAll(pattern)) {
          totals[key]++;
          if (examples[key].length < 8) examples[key].push({ offset: absolute, term: match[0], context: decoded.slice(Math.max(0, match.index - 32), match.index + match[0].length + 32).replace(/[\x00-\x1f\x7f]/g, ' ') });
        }
      }
      cursor = absolute + result.engine.bytesWritten;
    }
    const after = fs.statSync(file);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('Package changed during scan');
    console.log(JSON.stringify({ name, bytes: before.size, indexFlag: header.readUInt16LE(6), indexEntries: header.readUInt32LE(10), recoveredBlocks: blocks, rejectedCandidates: rejected, oversizedBlocks: oversized, totals, examples, activeIndexResolved: false }));
  } finally { fs.closeSync(fd); }
}

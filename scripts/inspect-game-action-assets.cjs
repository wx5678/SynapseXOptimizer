// Offline inspection of game assets. Reads files only; never executes recovered code.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const root = 'D:/game/游戏蜗牛/9yinjh';
const packageNames = process.argv.slice(2);
if (!packageNames.length) throw new Error('Supply package names, for example ini.package share.package');
const groups = {
  actionSpeed: /\b(?:ActionSpeed|action_speed|SetActionBaseSpeed|SetBlendActionSpeed|PlaySpeed|speedattack)\b/gi,
  actionTiming: /\b(?:start_frame|begin_time|start_time|prepare_time|blend_time|sync_frame|action_scale|base_speed|hitout_start_time)\b/gi,
  visualPerformance: /\b(?:max_display_fps|shadow_quality|grass_radius|effect_quality|self_effect|other_effect|enemy_effect)\b/gi,
  animationLOD: /\b(?:animation_lod|AnimationLod|action_lod|actor_lod|role_lod)\b/gi,
  globalAction: /\b(?:SetGlobalSpeed|SetStateSpeed|LoadAllAction|ActionPrefix|CONTROLLER_TYPE_ACTION_SPEED)\b/gi,
};
const decode = new TextDecoder('gbk');
const sha = buffer => crypto.createHash('sha256').update(buffer).digest('hex');

for (const name of packageNames) {
  if (!/^[\w.-]+\.(?:package|patch)$/.test(name)) throw new Error('Invalid package name');
  const file = path.join(root, name.endsWith('.patch') ? 'patch' : 'res', name);
  const data = fs.readFileSync(file);
  if (data.toString('ascii', 0, 4) !== 'PCK0') throw new Error('Not a PCK0 package: ' + name);
  const digest = sha(data);
  const total = {}, examples = {}, omitted = {}, hitsByBlock = [];
  for (const group of Object.keys(groups)) { total[group] = 0; examples[group] = []; omitted[group] = 0; }
  let blocks = 0, rejectedHeaders = 0;
  for (let offset = data.readUInt32LE(14); offset < data.length - 2;) {
    if (data[offset] !== 0x78 || ((data[offset] << 8) + data[offset + 1]) % 31 !== 0) { offset++; continue; }
    let inflated;
    try {
      inflated = zlib.inflateSync(data.subarray(offset), { info: true, maxOutputLength: 16 * 1024 * 1024 });
      if (!inflated.engine.bytesWritten) throw new Error('Empty zlib stream');
    } catch { rejectedHeaders++; offset++; continue; }
    blocks++;
    const content = decode.decode(inflated.buffer);
    const blockHit = [];
    for (const [group, pattern] of Object.entries(groups)) {
      pattern.lastIndex = 0;
      const found = [...content.matchAll(pattern)].map(match => match[0]);
      if (!found.length) continue;
      total[group] += found.length;
      blockHit.push(group);
      if (examples[group].length < 18) {
        pattern.lastIndex = 0;
        const sample = [...content.matchAll(pattern)].slice(0, 3).map(match =>
          content.slice(Math.max(0, match.index - 48), Math.min(content.length, match.index + match[0].length + 48))
            .replace(/[\x00-\x1f\x7f]/g, ' '));
        examples[group].push({ offset, bytes: inflated.buffer.length, signature: inflated.buffer.subarray(0, 8).toString('hex'), terms: [...new Set(found)].slice(0, 9), sample });
      } else omitted[group]++;
    }
    if (blockHit.length) hitsByBlock.push({ offset, groups: blockHit });
    offset += inflated.engine.bytesWritten;
  }
  if (sha(fs.readFileSync(file)) !== digest) throw new Error('Package changed during inspection: ' + name);
  console.log(JSON.stringify({ name, bytes: data.length, sha256: digest, indexFlag: data.readUInt16LE(6), indexEntries: data.readUInt32LE(10), recoveredBlocks: blocks, rejectedHeaders, total, examples, omitted, matchingBlocks: hitsByBlock.length, activeIndexResolved: false }));
}

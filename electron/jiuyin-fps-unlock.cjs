const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const execute = promisify(execFile);
const digest = (b) => crypto.createHash("sha256").update(b).digest("hex");
// Reviewed exact variants plus a pinned data-region family. No binaries/XML bundled.
const PROFILE = Object.freeze({
  id: "9yin-x64-skin-20260915",
  size: 4747607,
  offset: 3231222,
  length: 4312,
  xmlSize: 62584,
  original: "000f10226951d22dd8203eb192edfedf3e56bf2dd84126907aca1ae4ae2cbd29",
  dll: "16cf49b652c39b63ba0767780cc39f32ea1e50bdc683da9d5e7b2697cf95c3e8",
  family: Object.freeze({
    id: "9yin-x64-skin-data-20260915",
    header: "50434b300f000400c9b3ae0800000d04030000",
    dataOffset: 197645,
    dataHash: "1283d26bd5cd3c4dc30b7327321720de73c7ce775d5db1aa6eba9673c3a9876a",
    xmlHash: "81c4efcf72b0ec8901b4e37f8d536bac118c1c389ede9d6a763bd983346e19ca",
  }),
  known: Object.freeze({
    cbbd59d612ac846fff62dd355f30182de1f2ab4700a82e127836be3016337640: 360,
    "7a4b54ef4653cbd7e1bf73e5d7ce78ad5aedc9f3ee8c0b8bafc342fe485d839e": 999,
  }),
  knownVisual: Object.freeze({
    a63a6b79ee13c3ddff249b17dbdf269be2b5a43b42b67d9aa35d9bf8a27e6a2b: {cap:999, visualRange:450},
  }),
});
const PROFILES = Object.freeze([
  PROFILE,
  Object.freeze({
    ...PROFILE,
    id: "9yin-x64-skin-20260916-1519cb",
    original: "1519cb411d0472a9df550b745720fbcdcb11e0c9da87129b44be0d19bb260f76",
    known: Object.freeze({}),
    knownVisual: Object.freeze({}),
  }),
  Object.freeze({
    ...PROFILE,
    id: "9yin-x64-skin-20260916-7d1dbf",
    original: "7d1dbf6c25baeb941723c20008f53e45ba07d7dac35e0b2cd5fd4b5c5da21ddf",
    known: Object.freeze({}),
    knownVisual: Object.freeze({}),
  }),
]);
const slider =
  /(<control name="tbar_maxdisplayfps" entity="TrackBar"[^>]*>\s*<prop\b[^>]*\bMaximum=")(\d+)(")/g;
const visualSlider = /(<control name="visual_radius_track" entity="TrackBar"[^>]*>\s*<prop\b[^>]*\bMaximum=")(\d+)(")/g;
function identifyOriginal(bytes, profiles = PROFILES) {
  const hash = digest(bytes);
  const exact = profiles.find(p => p.size === bytes.length && p.original === hash);
  if (exact) return exact;
  for (const profile of profiles) {
    const family = profile.family;
    if (!family || bytes.length !== profile.size || bytes.length < 19) continue;
    const header = Buffer.from(family.header, "hex");
    // Only the observed reserved word (8..9) and opaque encrypted index may vary.
    // We neither decrypt/rebuild the index nor treat matching XML names as proof.
    if (!bytes.subarray(0, 8).equals(header.subarray(0, 8)) ||
        !bytes.subarray(10, 19).equals(header.subarray(10, 19)) ||
        bytes.readUInt32LE(14) !== family.dataOffset ||
        digest(bytes.subarray(family.dataOffset)) !== family.dataHash) continue;
    try {
      const xml = decode(bytes, profile);
      if (xml.maximum !== 100 || xml.visualRange !== 250 || digest(Buffer.from(xml.text)) !== family.xmlHash) continue;
      return Object.freeze({ ...profile, id: `${family.id}-${hash}`, original: hash,
        known: Object.freeze({}), knownVisual: Object.freeze({}) });
    } catch { /* Unsupported data stays read-only. */ }
  }
  return null;
}
function fail(message) {
  throw Error(message);
}
function decode(bytes, profile = PROFILE) {
  if (bytes.length !== profile.size)
    fail("资源包大小不匹配，当前游戏版本尚不支持。");
  const result = zlib.inflateSync(
    bytes.subarray(profile.offset, profile.offset + profile.length),
    { info: true, maxOutputLength: 128 * 1024 },
  );
  if (
    result.buffer.length !== profile.xmlSize ||
    result.engine.bytesWritten !== profile.length
  )
    fail("界面资源结构不匹配。");
  const text = result.buffer.toString("utf8");
  if (
    !Buffer.from(text).equals(result.buffer) ||
    /<!DOCTYPE|<!ENTITY/i.test(text)
  )
    fail("界面资源格式不受支持。");
  const hits = [...text.matchAll(slider)];
  if (hits.length !== 1) fail("无法唯一识别帧率滑条。");
  const visualHits = [...text.matchAll(visualSlider)];
  if (visualHits.length !== 1) fail("无法唯一识别视野滑条。");
  return { text, maximum: Number(hits[0][2]), visualRange: 50 + Number(visualHits[0][2]) * 2 };
}
function normalizeCap(value) {
  if (!Number.isInteger(value) || value < 60 || value > 1000)
    fail("请输入 60–1000 之间的整数。");
  return Math.floor(value / 3) * 3;
}
function sliderXml(text, cap) {
  // Preserve uncompressed resource size as well as its package block size.
  const number = String(cap / 3);
  return text.replace(slider, (_m, a, _n, b) => a + number + b + ' '.repeat(3 - number.length));
}
function normalizeVisualRange(value) {
  if (!Number.isInteger(value) || value < 50 || value > 1000) fail("请输入 50–1000 之间的视野范围整数。");
  return 50 + Math.floor((value - 50) / 2) * 2;
}
function resourceXml(text, cap, visualRange) {
  const number = String((visualRange - 50) / 2);
  return sliderXml(text, cap).replace(visualSlider, (_m,a,_n,b) => a + number + b + ' '.repeat(3-number.length));
}
async function buildCandidate(original, profile = PROFILE, requestedCap = 360, requestedVisualRange = 250) {
  const cap = normalizeCap(requestedCap);
  const visualRange = normalizeVisualRange(requestedVisualRange);
  if (digest(original) !== profile.original) fail("原版资源校验失败。");
  const decoded = decode(original, profile);
  if (decoded.maximum !== 100 || decoded.visualRange !== 250) fail("原版滑条范围不匹配。");
  if (cap === 300 && visualRange === 250) return Buffer.from(original);
  const xml = Buffer.from(
    resourceXml(decoded.text, cap, visualRange),
  );
  let compressed;
  for (const level of [6, 7, 8, 9]) {
    const normal = zlib.deflateSync(xml, { level });
    if (normal.length === profile.length) {
      compressed = normal;
      break;
    }
    const flushed = await new Promise((resolve, reject) => {
      const stream = zlib.createDeflate({ level }),
        parts = [];
      stream.on("data", (b) => parts.push(b));
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(parts)));
      stream.write(xml);
      stream.flush(zlib.constants.Z_SYNC_FLUSH, () => stream.end());
    });
    if (flushed.length === profile.length) {
      compressed = flushed;
      break;
    }
  }
  // A bounded split/flush search preserves the package index without adding
  // padding, changing other resources or altering its original block length.
  if (!compressed)
    for (const tail of Array.from({ length: 128 }, (_, i) => i + 1)) {
      for (const level of [6, 7, 8, 9]) {
        const split = xml.length - tail;
        if (split < 1) continue;
        const flushed = await new Promise((resolve, reject) => {
          const stream = zlib.createDeflate({ level }),
            parts = [];
          stream.on("data", (b) => parts.push(b));
          stream.on("error", reject);
          stream.on("end", () => resolve(Buffer.concat(parts)));
          stream.write(xml.subarray(0, split));
          stream.flush(zlib.constants.Z_SYNC_FLUSH, () =>
            stream.end(xml.subarray(split)),
          );
        });
        if (flushed.length === profile.length) {
          compressed = flushed;
          break;
        }
      }
      if (compressed) break;
    }
  // Two independent slider edits can need more space than a tail-only flush
  // search provides. Try bounded interior splits, still using ordinary zlib
  // streams with no trailing padding or changes to package directory entries.
  if (!compressed) {
    outer: for (const level of [7,8,9,6]) {
      for (let split = Math.min(128, xml.length - 1); split < xml.length; split += 128) {
        const block = await new Promise((resolve,reject)=>{
          const stream=zlib.createDeflate({level}), parts=[];
          stream.on('data',b=>parts.push(b));stream.on('error',reject);
          stream.on('end',()=>resolve(Buffer.concat(parts)));
          stream.write(xml.subarray(0,split));
          stream.flush(zlib.constants.Z_SYNC_FLUSH,()=>stream.end(xml.subarray(split)));
        });
        if (block.length === profile.length) { compressed=block; break outer; }
      }
    }
  }
  if (!compressed) fail("当前压缩器无法保持原资源长度，未修改游戏。");
  const candidate = Buffer.from(original);
  compressed.copy(candidate, profile.offset);
  if (
    !candidate
      .subarray(0, profile.offset)
      .equals(original.subarray(0, profile.offset)) ||
    !candidate
      .subarray(profile.offset + profile.length)
      .equals(original.subarray(profile.offset + profile.length))
  )
    fail("资源边界校验失败。");
  if (decode(candidate, profile).text !== xml.toString())
    fail("修改后资源校验失败。");
  return candidate;
}
function powershell() {
  return path.join(
    process.env.SystemRoot || "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
}
function commandOptions() {
  const env = { ...process.env };
  delete env.PSModulePath;
  return { windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024, env };
}
async function runningGame() {
  const { stdout } = await execute(
    powershell(),
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "@(Get-Process fxgame -ErrorAction SilentlyContinue).Count",
    ],
    commandOptions(),
  );
  if (!/^\d+$/.test(stdout.trim())) fail("无法确认游戏进程状态。");
  return Number(stdout.trim()) > 0;
}
function createJiuYinFpsUnlock({
  directory,
  authorize,
  replaceScript,
  isRunning = runningGame,
  replaceFile,
  executeCommand = execute,
  profile = PROFILE,
  profiles = profile === PROFILE ? PROFILES : [profile],
}) {
  let queue = Promise.resolve();
  const serial = (action) => {
    const result = queue.catch(() => {}).then(action);
    queue = result;
    return result;
  };
  function resolveRoot(gameRoot, importedOriginal) {
    if (
      typeof gameRoot !== "string" ||
      !path.isAbsolute(gameRoot) ||
      /[\r\n\0]/.test(gameRoot)
    )
      fail("请选择九阴真经安装目录。");
    const root = fs.realpathSync(gameRoot);
    for (const relative of [
      "res",
      "bin64",
      "bin64/fxgame.exe",
      "bin64/fxgamelogic.dll",
      "res/skin.package",
    ]) {
      const item = path.join(root, relative),
        stat = fs.lstatSync(item);
      if (stat.isSymbolicLink() || (relative.includes(".") && !stat.isFile()))
        fail("不支持链接或异常游戏路径。");
    }
    const info = {
      root,
      target: path.join(root, "res/skin.package"),
      backup: path.join(
        directory,
        digest(root.toLowerCase()),
        "original.package",
      ),
    };
    if (!profiles.some(p => p.size === fs.statSync(info.target).size))
      fail("当前资源包版本尚不支持，未修改游戏。");
    const currentBytes = fs.readFileSync(info.target), currentHash = digest(currentBytes);
    let selected = identifyOriginal(currentBytes, profiles) ||
      profiles.find(p => p.known[currentHash] || p.knownVisual?.[currentHash]);
    // Custom patches are recognized only against a verified original AND by
    // comparing every byte outside the target block in readKnown below.
    if (!selected) {
      let original = importedOriginal;
      if (!original) {
        try {
          const stat = fs.lstatSync(info.backup);
          if (stat.isFile() && !stat.isSymbolicLink() && profiles.some(p => p.size === stat.size))
            original = fs.readFileSync(info.backup);
        } catch {}
      }
      if (original) selected = identifyOriginal(original, profiles);
    }
    return {...info, profile: selected || profile};
  }
  function readKnown(info, importedOriginal) {
    const profile = info.profile;
    if (fs.statSync(info.target).size !== profile.size)
      fail("当前资源包版本尚不支持，未修改游戏。");
    const bytes = fs.readFileSync(info.target),
      hash = digest(bytes);
    const knownVisual = profile.knownVisual?.[hash];
    let cap = hash === profile.original ? 300 : knownVisual?.cap ?? profile.known[hash];
    let visualRange = knownVisual?.visualRange ?? 250;
    // A compressor variant must still contain exactly the intended XML change
    // and identical bytes outside that resource; metadata alone is not trusted.
    if (!cap)
      try {
        const original = importedOriginal || readBackup(info);
        const decoded = decode(bytes, profile), actual = decoded.maximum * 3;
        if (
          actual >= 60 &&
          actual <= 999 &&
          decoded.visualRange >= 50 && decoded.visualRange <= 1000 &&
          original &&
          bytes
            .subarray(0, profile.offset)
            .equals(original.subarray(0, profile.offset)) &&
          bytes
            .subarray(profile.offset + profile.length)
            .equals(original.subarray(profile.offset + profile.length)) &&
          decode(bytes, profile).text ===
            resourceXml(decode(original, profile).text, actual, decoded.visualRange)
        ) {
          cap = actual; visualRange = decoded.visualRange;
        }
      } catch {}
    if (!cap) fail("资源包已更新或被其他工具修改，禁止套用旧补丁。");
    if (decode(bytes, profile).maximum * 3 !== cap || decode(bytes, profile).visualRange !== visualRange)
      fail("滑条数值与资源版本不一致。");
    return { bytes, hash, cap, visualRange };
  }
  function readBackup(info) {
    const profile = info.profile;
    try {
      const stat = fs.lstatSync(info.backup);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== profile.size)
        return null;
      const b = fs.readFileSync(info.backup);
      return digest(b) === profile.original ? b : null;
    } catch {
      return null;
    }
  }
  async function state(gameRoot) {
    try {
      const info = resolveRoot(gameRoot),
        current = readKnown(info),
        backup = readBackup(info);
      const profile = info.profile;
      const compatible =
        digest(
          fs.readFileSync(path.join(info.root, "bin64/fxgamelogic.dll")),
        ) === profile.dll;
      const running = await isRunning();
      return {
        supported: compatible,
        gameRoot: info.root,
        cap: current.cap,
        visualRange: current.visualRange,
        running,
        hasBackup: !!backup,
        canApply: compatible && !running && (current.hash === profile.original || !!backup),
        canRestore: !running && current.hash !== profile.original && !!backup,
        backupPath: backup ? info.backup : "",
        message: !compatible
          ? "游戏模块版本不匹配，只允许用匹配备份恢复。"
          : current.cap > 762
            ? "当前为高帧率实验档，存在保存溢出风险。退出或保存游戏设置前，请先将游戏内滑条调回不超过 300。再次修改或恢复前需退出游戏并准备原版备份。"
            : running
              ? "请先在游戏中将帧率上限调回不超过 300，再退出游戏后应用或恢复。"
              : current.hash !== profile.original && !backup
                ? "检测到既有修改，但没有软件管理的原版备份。请先导入原版 skin.package 备份。"
                : "已核对帧率与视野资源版本。视野数值越大通常看得越远，但会增加显卡负载，可能降低帧数；实际距离受地图限制。",
      };
    } catch (error) {
      return {
        supported: false,
        gameRoot: typeof gameRoot === "string" ? gameRoot : "",
        cap: null,
        visualRange: null,
        running: false,
        hasBackup: false,
        canApply: false,
        canRestore: false,
        backupPath: "",
        message: error.message,
      };
    }
  }
  async function commit(info, current, content, action) {
    const profile = info.profile;
    const stamp = crypto.randomUUID(),
      staging = path.join(
        path.dirname(info.target),
        `.synapsex-fps-${stamp}.tmp`,
      ),
      displaced = path.join(
        path.dirname(info.target),
        `.synapsex-fps-${stamp}.previous`,
      );
    fs.writeFileSync(staging, content, { flag: "wx" });
    try {
      if (await isRunning())
        fail("游戏正在运行，本功能不会强行替换正在使用的资源。");
      const nextSettings = decode(content, profile);
      if (action === "apply" && (nextSettings.maximum * 3 > 300 || nextSettings.visualRange > 250)) await authorize("jiuyin.fps");
      if (typeof action === 'function') await action();
      if (digest(fs.readFileSync(info.target)) !== current.hash)
        fail("游戏资源刚刚发生变化，已取消。");
      const operation = {
        source: staging,
        target: info.target,
        backup: displaced,
        expectedHash: current.hash,
        newHash: digest(content),
      };
      if (replaceFile) await replaceFile(operation);
      else
        await executeCommand(
          powershell(),
          [
            "-NoProfile",
            "-NonInteractive",
            // This child only; never change the user's stored execution policy.
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            replaceScript,
            "-Source",
            staging,
            "-Target",
            info.target,
            "-Backup",
            displaced,
            "-ExpectedHash",
            current.hash,
            "-NewHash",
            operation.newHash,
          ],
          commandOptions(),
        ).catch((error) => {
          // Windows PowerShell startup errors may use a legacy code page. The
          // ASCII error identifiers remain readable even when Chinese does not.
          const detail = `${error.stderr || ""}\n${error.message || ""}`;
          if (/PSSecurityException|about_Execution_Policies|AuthorizationManager check failed|SecurityError[\s\S]*UnauthorizedAccess/i.test(detail))
            fail("Windows 安全策略阻止了资源替换脚本。软件已指定仅本次进程执行；若仍被拦截，请联系电脑管理员检查组策略或应用控制。不要关闭安全软件或更改全局执行策略。此项策略错误发生在写入前，原版备份保留。");
          throw error;
        });
      if (digest(fs.readFileSync(info.target)) !== operation.newHash)
        fail("写入后校验失败，请保留备份并恢复原版。");
      // Preserve displaced resource outside the game even when crossing volumes.
      const archived = path.join(
        path.dirname(info.backup),
        `${stamp}-${typeof action === 'function' ? 'expiry-restore' : action}.previous`,
      );
      try {
        fs.copyFileSync(displaced, archived, fs.constants.COPYFILE_EXCL);
        if (digest(fs.readFileSync(archived)) !== current.hash)
          fail("归档校验失败");
        fs.unlinkSync(displaced);
      } catch {
        return `资源已写入并校验成功；旧文件归档未完成，仍保留在 ${displaced}。原版备份未删除。`;
      }
      return "";
    } finally {
      if (fs.existsSync(staging)) fs.unlinkSync(staging);
    }
  }
  return {
    state,
    managedRoots: () => {
      if (!fs.existsSync(directory)) return [];
      return fs.readdirSync(directory, {withFileTypes:true}).filter(e=>e.isDirectory() && /^[a-f0-9]{64}$/.test(e.name)).flatMap(e=>{
        try {const m=JSON.parse(fs.readFileSync(path.join(directory,e.name,'original.package.json'),'utf8'));
          return m.managed === true && typeof m.gameRoot === 'string' && digest(fs.realpathSync(m.gameRoot).toLowerCase()) === e.name ? [m.gameRoot] : [];
        } catch {return [];}
      });
    },
    restoreExpired: (gameRoot, recheck) => serial(async()=>{
      const info=resolveRoot(gameRoot), current=readKnown(info);
      if(current.cap<=300 && current.visualRange<=250)return state(info.root);
      if(await isRunning())fail('VIP 已到期：请先把游戏内帧率调回不超过 300、视野调回不超过 250 并退出游戏，退出后自动恢复原版上限。');
      const original=readBackup(info);
      if(!original)fail('自动恢复需要经过校验的原版备份，请导入备份后重试。');
      await recheck();
      const warning=await commit(info,current,original,recheck);
      return {...await state(info.root),message:warning || 'VIP 已到期，帧率上限已恢复为 300，视野上限已恢复为 250。重新进入游戏后请检查视频设置。'};
    }),
    importBackup: ({ gameRoot, sourceFile }) =>
      serial(async () => {
        if (
          typeof sourceFile !== "string" ||
          !profiles.some(p => fs.statSync(sourceFile).size === p.size)
        )
          fail("原版备份大小不匹配。");
        const bytes = fs.readFileSync(sourceFile);
        const info = resolveRoot(gameRoot, bytes), profile = info.profile;
        if (digest(bytes) !== profile.original)
          fail("必须导入此游戏版本未经修改的原版资源备份。");
        const current = readKnown(info, bytes);
        fs.mkdirSync(path.dirname(info.backup), { recursive: true });
        if (fs.existsSync(info.backup)) {
          if (!readBackup(info)) fail("已有备份损坏，未覆盖。");
        } else fs.writeFileSync(info.backup, bytes, { flag: "wx" });
        fs.writeFileSync(info.backup + '.json', JSON.stringify({profile:profile.id,gameRoot:info.root,managed:true,actualCap:current.cap,visualRange:current.visualRange,patchedHash:current.hash,updatedAt:new Date().toISOString()}));
        return state(info.root);
      }),
    apply: (value) =>
      serial(async () => {
        const requestedCap =
          value?.confirm === "apply-jiuyin-fps-360" && value.cap === undefined
            ? 360
            : value?.cap;
        const cap = normalizeCap(requestedCap);
        if (requestedCap > 300) await authorize("jiuyin.fps");
        if (
          value?.confirm !== "apply-jiuyin-fps" &&
          !(value?.confirm === "apply-jiuyin-fps-360" && requestedCap === 360)
        )
          fail("请确认本次自定义帧率上限。");
        if (cap > 762 && value?.acknowledgeSaveRisk !== true)
          fail("高于 762 FPS 存在保存溢出风险，请明确确认后再应用。");
        const info = resolveRoot(value.gameRoot),
          current = readKnown(info);
        const profile = info.profile;
        const requestedVisualRange = value.visualRange === undefined ? current.visualRange : value.visualRange;
        const visualRange = normalizeVisualRange(requestedVisualRange);
        if (requestedCap <= 300 && requestedVisualRange > 250) await authorize('jiuyin.fps');
        if (
          digest(
            fs.readFileSync(path.join(info.root, "bin64/fxgamelogic.dll")),
          ) !== profile.dll
        )
          fail("游戏模块版本不匹配。");
        if (await isRunning()) fail("请先退出游戏后应用。");
        if (current.cap === cap && current.visualRange === visualRange) return state(info.root);
        if (
          fs.existsSync(
            path.join(
              info.root,
              "res/skin/form_stage_main/form_system/form_system_setting.xml",
            ),
          )
        )
          fail("存在独立设置 XML，请先处理该文件，避免来源冲突。");
        fs.mkdirSync(path.dirname(info.backup), { recursive: true });
        if (!fs.existsSync(info.backup) && current.hash === profile.original)
          fs.writeFileSync(info.backup, current.bytes, { flag: "wx" });
        const original = readBackup(info);
        if (!original) fail("缺少经过校验的原版备份，未修改游戏。");
        const candidate = await buildCandidate(original, profile, requestedCap, requestedVisualRange);
        const warning = await commit(info, current, candidate, "apply");
        fs.writeFileSync(info.backup + '.json', JSON.stringify({profile:profile.id,patchedHash:digest(candidate),requestedCap,actualCap:cap,requestedVisualRange,visualRange,gameRoot:info.root,managed:true,updatedAt:new Date().toISOString()}));
        return {
          ...(await state(info.root)),
          message:
            warning ||
            `已备份并应用 ${cap} FPS 上限${cap !== requestedCap ? `（输入 ${requestedCap}，按游戏 3 FPS 步进换算）` : ""}，视野范围上限 ${visualRange}。启动游戏后重新打开视频设置并调整滑条。视距增大会增加显卡负载，可能降低帧数，实际距离受地图限制。${cap > 762 ? "实验档：保存或退出前务必调回不超过 300，避免保存溢出。" : "实际帧率取决于场景与硬件。"}`,
        };
      }),
    restore: (value) =>
      serial(async () => {
        if (value?.confirm !== "restore-jiuyin-fps") fail("请确认恢复原版。");
        const info = resolveRoot(value.gameRoot),
          current = readKnown(info);
        if (await isRunning())
          fail("请先将游戏内上限调回不超过 300，并退出游戏后恢复。");
        if (current.hash === info.profile.original) return state(info.root);
        const original = readBackup(info);
        if (!original) fail("没有经过校验的原版备份。");
        fs.mkdirSync(path.dirname(info.backup), { recursive: true });
        const warning = await commit(info, current, original, "restore");
        return {
          ...(await state(info.root)),
          message:
            warning ||
            "原版资源已恢复：帧率上限 300、视野上限 250。重新进入游戏后检查两个滑条；资源恢复不会直接改写账号保存的设置。",
        };
      }),
  };
}
module.exports = {
  PROFILE,
  PROFILES,
  identifyOriginal,
  digest,
  decode,
  buildCandidate,
  normalizeCap,
  normalizeVisualRange,
  createJiuYinFpsUnlock,
};

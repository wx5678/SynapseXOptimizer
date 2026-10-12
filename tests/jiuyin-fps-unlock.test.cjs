const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const zlib = require("node:zlib");
const {
  digest,
  decode,
  buildCandidate,
  identifyOriginal,
  createJiuYinFpsUnlock,
} = require("../electron/jiuyin-fps-unlock.cjs");
const { createVipPolicy } = require("../electron/vip-policy.cjs");
const { normalizeCap, normalizeVisualRange } = require("../electron/jiuyin-fps-unlock.cjs");

test('reviewed 7d1dbf resource is an exact variant, not a wildcard or inherited patch list',()=>{
  const {PROFILE,PROFILES}=require('../electron/jiuyin-fps-unlock.cjs');
  assert.equal(new Set(PROFILES.map(p=>p.original)).size,PROFILES.length);
  const variant=PROFILES.find(p=>p.original==='7d1dbf6c25baeb941723c20008f53e45ba07d7dac35e0b2cd5fd4b5c5da21ddf');
  assert(variant);
  for(const key of ['dll','offset','length','xmlSize','size'])assert.equal(variant[key],PROFILE[key]);
  assert.deepEqual(variant.known,{});assert.deepEqual(variant.knownVisual,{});
  assert(Object.isFrozen(variant));assert(Object.isFrozen(variant.known));assert(Object.isFrozen(variant.knownVisual));
  assert(PROFILES.some(p=>p.original==='1519cb411d0472a9df550b745720fbcdcb11e0c9da87129b44be0d19bb260f76'));
});

test('visual range validates numeric inputs and preserves a true 1000 maximum',()=>{
  for(const v of [null,undefined,'1000',49,1001,250.5,Infinity,NaN])assert.throws(()=>normalizeVisualRange(v));
  for(const v of [50,250,450,750,1000])assert.equal(normalizeVisualRange(v),v);
  assert.equal(normalizeVisualRange(999),998);
});
test('legacy INI editor cannot offer an unguarded high view range',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../host/modules/visual-tradeoff-profiles.json'),'utf8'));
  const view=manifest.editableSettings.find(x=>x.id==='visual_radius');
  assert.equal(view.maximum,250);assert.equal(view.minimum,50);
  assert.match(view.description,/管理员/);
});

test('combined cap and view retain each other and share the original backup',async t=>{
  const f=await fixture(t);
  const first=await f.service.apply({gameRoot:f.root,confirm:'apply-jiuyin-fps',cap:300,visualRange:1000});
  assert.equal(first.cap,300);assert.equal(first.visualRange,1000);assert.equal(first.canRestore,true);assert.equal(f.calls,2);
  const next=await f.service.apply({gameRoot:f.root,confirm:'apply-jiuyin-fps',cap:1000,visualRange:1000,acknowledgeSaveRisk:true});
  assert.equal(next.cap,999);assert.equal(next.visualRange,1000);
  assert.equal(digest(fs.readFileSync(next.backupPath)),f.profile.original);
  const lower=await f.service.apply({gameRoot:f.root,confirm:'apply-jiuyin-fps',cap:360});
  assert.equal(lower.visualRange,1000,'legacy callers must not reset view');
  f.license(false);
  await assert.rejects(f.service.apply({gameRoot:f.root,confirm:'apply-jiuyin-fps',cap:300,visualRange:251}),/管理员/);
  await assert.rejects(f.service.apply({gameRoot:f.root,confirm:'apply-jiuyin-fps',cap:300}),/管理员/);
  const restored=await f.restore();assert.equal(restored.cap,300);assert.equal(restored.visualRange,250);
});

test('visual-only expiry restores both original limits and checks authorization twice',async t=>{
  const f=await fixture(t);
  await f.service.apply({gameRoot:f.root,confirm:'apply-jiuyin-fps',cap:300,visualRange:1000});
  let checks=0;
  const restored=await f.service.restoreExpired(f.root,async()=>checks++);
  assert.equal(checks,2);assert.equal(restored.visualRange,250);assert.equal(restored.cap,300);
});

test('view-only privileged change rechecks role at write time and never treats it as an original backup',async t=>{
  const f=await fixture(t,{expireDuringWrite:true});
  await assert.rejects(f.service.apply({gameRoot:f.root,confirm:'apply-jiuyin-fps',cap:300,visualRange:1000}),/管理员/);
  assert.equal(f.writes,0);
  const g=await fixture(t);
  const candidate=await buildCandidate(g.original,g.profile,300,1000);
  g.profile.knownVisual={[digest(candidate)]:{cap:300,visualRange:1000}};
  fs.writeFileSync(g.target,candidate);
  assert.equal((await g.service.state(g.root)).canApply,false);
  await assert.rejects(g.service.apply({gameRoot:g.root,confirm:'apply-jiuyin-fps',cap:300,visualRange:250}),/缺少经过校验/);
  const source=path.join(g.dir,'original-import.package');fs.writeFileSync(source,g.original);
  await g.service.importBackup({gameRoot:g.root,sourceFile:source});
  assert.equal((await g.service.state(g.root)).visualRange,1000);
  await g.restore();assert(fs.readFileSync(g.target).equals(g.original));
});

test('ordinary users can adjust both original ranges without privileged calls',async t=>{
  const f=await fixture(t);f.license(false);
  const next=await f.service.apply({gameRoot:f.root,confirm:'apply-jiuyin-fps',cap:60,visualRange:50});
  assert.equal(next.cap,60);assert.equal(next.visualRange,50);assert.equal(f.calls,0);
});

test("custom cap validates integers and converts 1000 to actual 999", () => {
  for (const value of [
    undefined,
    null,
    "1000",
    NaN,
    Infinity,
    59,
    1001,
    600.5,
  ])
    assert.throws(() => normalizeCap(value));
  assert.equal(normalizeCap(1000), 999);
  assert.equal(normalizeCap(763), 762);
  assert.equal(normalizeCap(600), 600);
  assert.equal(normalizeCap(60),60);
  assert.equal(normalizeCap(299),297);
});
test('non-admin can restore 300 with apply but cannot request 301 or higher',async(t)=>{
  const f=await fixture(t);await f.apply();f.license(false);
  await assert.rejects(f.service.apply({gameRoot:f.root,confirm:'apply-jiuyin-fps',cap:301}),/管理员/);
  const result=await f.service.apply({gameRoot:f.root,confirm:'apply-jiuyin-fps',cap:300});
  assert.equal(result.cap,300);
  assert.deepEqual(f.service.managedRoots(),[fs.realpathSync(f.root)]);
});
test('expiry resource restore rechecks authorization before atomic replacement and respects running game',async(t)=>{
  const f=await fixture(t);await f.apply();let checks=0;
  f.running(true);
  await assert.rejects(f.service.restoreExpired(f.root,async()=>checks++),/退出/);
  f.running(false);
  await assert.rejects(f.service.restoreExpired(f.root,async()=>{checks++;throw Error('renewed')}),/renewed/);
  assert.equal((await f.service.state(f.root)).cap,360);
  checks=0;
  assert.equal((await f.service.restoreExpired(f.root,async()=>checks++)).cap,300);
  assert.equal(checks,2);
});
test("custom 600 then 1000 retains original backup and restores without VIP", async (t) => {
  const f = await fixture(t);
  const a = await f.service.apply({
    gameRoot: f.root,
    confirm: "apply-jiuyin-fps",
    cap: 600,
  });
  assert.equal(a.cap, 600);
  await assert.rejects(
    f.service.apply({
      gameRoot: f.root,
      confirm: "apply-jiuyin-fps",
      cap: 1000,
    }),
    /保存溢出风险/,
  );
  const b = await f.service.apply({
    gameRoot: f.root,
    confirm: "apply-jiuyin-fps",
    cap: 1000,
    acknowledgeSaveRisk: true,
  });
  assert.equal(b.cap, 999);
  assert.match(b.message, /输入 1000/);
  assert.equal(digest(fs.readFileSync(b.backupPath)), f.profile.original);
  f.license(false);
  assert.equal((await f.restore()).cap, 300);
});
test("failed switch retains recognition of prior custom cap; imported original recovers custom resources", async (t) => {
  const f = await fixture(t);
  const a = await f.service.apply({
    gameRoot: f.root,
    confirm: "apply-jiuyin-fps",
    cap: 600,
  });
  fs.writeFileSync(
    a.backupPath + ".json",
    JSON.stringify({ profile: f.profile.id, patchedHash: "stale-record" }),
  );
  assert.equal((await f.service.state(f.root)).cap, 600);
  const source = path.join(f.dir, "original-import.package");
  fs.writeFileSync(source, f.original);
  fs.unlinkSync(a.backupPath);
  assert.equal((await f.service.state(f.root)).supported, false);
  await f.service.importBackup({ gameRoot: f.root, sourceFile: source });
  assert.equal((await f.service.state(f.root)).cap, 600);
  assert.equal((await f.restore()).cap, 300);
});

// Synthetic XML/package only: no game resources are copied into test fixtures.
async function fixture(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "synapsex-fps-test-"));
  t.after(() => {
    const resolved = fs.realpathSync(dir),
      parent = fs.realpathSync(os.tmpdir());
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith("synapsex-fps-test-"));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  const xml = `<form><!--100 120 200 333 475--><control name="tbar_maxdisplayfps" entity="TrackBar"><prop Maximum="100" Value="20"/></control><control name="visual_radius_track" entity="TrackBar"><prop Maximum="100" Value="50"/></control>${"fixture".repeat(10)}</form>`;
  const block = zlib.deflateSync(xml, {strategy:zlib.constants.Z_FIXED});
  const prefix = options.family ? Buffer.alloc(64, 0x31) : Buffer.from("FIXTURE-INDEX"),
    suffix = Buffer.from("OTHER-RESOURCES");
  if (options.family) {
    Buffer.from('50434b300f000400c9b3020000004000000000','hex').copy(prefix);
  }
  const original = Buffer.concat([prefix,block,suffix]);
  const dll = Buffer.from("SYNTHETIC-DLL-NOT-EXECUTABLE");
  const profile = {
    id: "synthetic-v1",
    size: original.length,
    offset: prefix.length,
    length: block.length,
    xmlSize: Buffer.byteLength(xml),
    original: digest(original),
    dll: digest(dll),
    known: {},
  };
  if (options.family) profile.family = {id:'synthetic-family', header:prefix.subarray(0,19).toString('hex'),
    dataOffset:64, dataHash:digest(original.subarray(64)), xmlHash:digest(Buffer.from(xml))};
  const patched = await buildCandidate(original,profile,360), legacy = await buildCandidate(original,profile,999);
  profile.known = {[digest(patched)]:360,[digest(legacy)]:999};
  const alternate = Buffer.from(original); alternate[options.family ? 8 : 0] ^= 1;
  if (options.family) alternate[25] ^= 1;
  const alternateProfile = {...profile, id:'synthetic-v2', original:digest(alternate), known:{}};
  const root = path.join(dir, "游戏目录 game with spaces"),
    directory = path.join(dir, "backups");
  fs.mkdirSync(path.join(root, "res"), { recursive: true });
  fs.mkdirSync(path.join(root, "bin64"));
  fs.writeFileSync(path.join(root, "bin64/fxgame.exe"), "SYNTHETIC-EXE");
  fs.writeFileSync(path.join(root, "bin64/fxgamelogic.dll"), dll);
  const target = path.join(root, "res/skin.package");
  fs.writeFileSync(target, options.alternate || options.family ? alternate : original);
  let licensed = true,
    running = false,
    calls = 0,
    writes = 0;
  const policy = createVipPolicy({
    state: () => ({
      user: { id: "test" },
      status: licensed ? "active" : "expired",
      features: ["vip"],
      administrator: licensed,
    }),
  });
  const serviceOptions = {
    directory,
    profile,
    profiles: options.alternate ? [profile,alternateProfile] : [profile],
    isRunning: async () => running,
    authorize: async (id) => {
      calls++;
      if (options.expireDuringWrite && calls === 2) licensed = false;
      policy.requireFeature(id);
    },
    replaceFile: async (o) => {
      writes++;
      if (options.failReplace) throw Error("synthetic access denied");
      assert.equal(digest(fs.readFileSync(o.target)), o.expectedHash);
      assert.equal(digest(fs.readFileSync(o.source)), o.newHash);
      fs.renameSync(o.target, o.backup);
      fs.renameSync(o.source, o.target);
    },
  };
  const service = createJiuYinFpsUnlock(serviceOptions);
  return {
    dir,
    root,
    target,
    directory,
    profile,
    original,
    alternate,
    restart: (overrides = {}) => createJiuYinFpsUnlock({...serviceOptions, ...overrides}),
    patched,
    legacy,
    service,
    apply: () =>
      service.apply({
        gameRoot: root,
        confirm: "apply-jiuyin-fps-360",
        cap: 360,
      }),
    restore: () =>
      service.restore({ gameRoot: root, confirm: "restore-jiuyin-fps" }),
    get writes() {
      return writes;
    },
    get calls() {
      return calls;
    },
    license: (v) => (licensed = v),
    running: (v) => (running = v),
  };
}

test('resource family accepts unseen index variants and preserves their own backup across restart and restore', async t => {
  const f=await fixture(t,{family:true});
  const p=identifyOriginal(f.alternate,[f.profile]);
  assert.equal(p.original,digest(f.alternate));assert.notEqual(p.original,f.profile.original);
  assert.deepEqual(p.known,{});assert.deepEqual(p.knownVisual,{});
  assert.equal((await f.service.state(f.root)).canApply,true);
  const result=await f.apply();
  assert(fs.readFileSync(result.backupPath).equals(f.alternate));
  assert(fs.readFileSync(f.target).subarray(0,64).equals(f.alternate.subarray(0,64)));
  assert.equal((await f.restart().state(f.root)).cap,360);
  await f.restart().restore({gameRoot:f.root,confirm:'restore-jiuyin-fps'});
  assert(fs.readFileSync(f.target).equals(f.alternate));
  await f.apply();let checked=0;await f.restart().restoreExpired(f.root,async()=>checked++);
  assert.equal(checked,2);assert(fs.readFileSync(f.target).equals(f.alternate));
});

test('resource family rejects changed header layout, data, XML fingerprint, size and DLL', async t => {
  const f=await fixture(t,{family:true});
  for(const pos of [0,4,6,10,14,18,64,f.alternate.length-1]) {
    const bad=Buffer.from(f.alternate);bad[pos]^=1;
    assert.equal(identifyOriginal(bad,[f.profile]),null,`position ${pos}`);
    fs.writeFileSync(f.target,bad);
    assert.equal((await f.service.state(f.root)).canApply,false);
    await assert.rejects(f.apply());assert(fs.readFileSync(f.target).equals(bad));
  }
  assert.equal(identifyOriginal(f.alternate.subarray(1),[f.profile]),null);
  assert.equal(identifyOriginal(f.alternate,[{...f.profile,family:{...f.profile.family,xmlHash:'wrong'}}]),null);
  fs.writeFileSync(f.target,f.alternate);
  fs.writeFileSync(path.join(f.root,'bin64/fxgamelogic.dll'),'DIFFERENT DLL');
  assert.equal((await f.service.state(f.root)).canApply,false);
  await assert.rejects(f.apply(),/模块版本不匹配/);assert.equal(f.writes,0);
});

test('resource family never accepts changed index on a patched file or treats patch as original', async t => {
  const f=await fixture(t,{family:true}),result=await f.apply();
  const patched=fs.readFileSync(f.target);
  assert.equal(identifyOriginal(patched,[f.profile]),null);
  for(const pos of [8,25,patched.length-1]) {
    const bad=Buffer.from(patched);bad[pos]^=1;fs.writeFileSync(f.target,bad);
    assert.equal((await f.restart().state(f.root)).supported,false);
    await assert.rejects(f.restore());assert.equal(f.writes,1);
  }
  assert(fs.readFileSync(result.backupPath).equals(f.alternate));
});

test('family patch with missing backup requires matching original import, never another index variant', async t => {
  const f=await fixture(t,{family:true}),result=await f.apply(),source=path.join(f.dir,'import.package');
  fs.unlinkSync(result.backupPath);
  assert.equal((await f.restart().state(f.root)).supported,false);
  fs.writeFileSync(source,f.original);
  await assert.rejects(f.service.importBackup({gameRoot:f.root,sourceFile:source}));
  fs.writeFileSync(source,fs.readFileSync(f.target));
  await assert.rejects(f.service.importBackup({gameRoot:f.root,sourceFile:source}));
  fs.writeFileSync(source,f.alternate);
  const state=await f.service.importBackup({gameRoot:f.root,sourceFile:source});
  assert.equal(state.cap,360);assert.equal(state.hasBackup,true);
  await f.restore();assert(fs.readFileSync(f.target).equals(f.alternate));
});

test('family path keeps running-game, administrator and backup integrity guards', async t => {
  const f=await fixture(t,{family:true});f.license(false);
  await assert.rejects(f.apply());assert.equal(f.writes,0);f.license(true);f.running(true);
  await assert.rejects(f.apply(),/退出游戏/);assert.equal(f.writes,0);f.running(false);
  const result=await f.apply();
  fs.writeFileSync(result.backupPath,f.original);
  assert.equal((await f.restart().state(f.root)).supported,false);
  await assert.rejects(f.restore());assert.equal(f.writes,1);
});

test('native replacement uses process-only policy and reports policy failures without losing the original', async t => {
  const f = await fixture(t);
  let called = 0;
  const service = f.restart({replaceFile: undefined, replaceScript: 'bundled-replacement.ps1', executeCommand: async (_file, args, options) => {
    called++;
    assert.deepEqual(args.slice(0, 6), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', 'bundled-replacement.ps1']);
    assert.equal(options.windowsHide, true);
    assert(!args.includes('-Command'), 'paths must remain separate arguments, not executable shell text');
    throw Object.assign(new Error('Command failed: unreadable localized message'), {stderr: 'SecurityError: (:) []\nFullyQualifiedErrorId : UnauthorizedAccess'});
  }});
  await assert.rejects(service.apply({gameRoot:f.root, confirm:'apply-jiuyin-fps', cap:600, visualRange:250}), /Windows 安全策略/);
  assert.equal(called, 1);
  assert(fs.readFileSync(f.target).equals(f.original));
  const state = await service.state(f.root);
  assert(fs.readFileSync(state.backupPath).equals(f.original));
  assert.equal(state.cap, 300);
  assert(!fs.readdirSync(path.dirname(f.target)).some(name => name.endsWith('.tmp')));
});

test('real Windows replacement applies and restores under inherited Restricted policy', {skip:process.platform !== 'win32'}, async t => {
  const {promisify} = require('node:util');
  const exec = promisify(require('node:child_process').execFile);
  const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const env = {...process.env, PSExecutionPolicyPreference:'Restricted'};
  delete env.PSModulePath;
  const {stdout: running} = await exec(ps, ['-NoProfile','-NonInteractive','-Command','@(Get-Process fxgame -ErrorAction SilentlyContinue).Count'], {env, windowsHide:true});
  if(Number(running.trim()) > 0) return t.skip('Native guard forbids replacement while a real game is running');
  const f = await fixture(t);
  const script = path.join(__dirname, '../host/ReplaceJiuYinFpsResource.ps1');
  // Demonstrate the old -File invocation fails before any script code runs.
  await assert.rejects(exec(ps, ['-NoProfile','-NonInteractive','-File',script], {env, windowsHide:true}), error => /UnauthorizedAccess|PSSecurityException/.test(error.stderr));
  let calls = 0;
  const service = f.restart({replaceFile:undefined, replaceScript:script, executeCommand:async (file,args,options) => {
    calls++;
    return exec(file, args, {...options, env:{...options.env, PSExecutionPolicyPreference:'Restricted'}});
  }});
  const applied = await service.apply({gameRoot:f.root, confirm:'apply-jiuyin-fps', cap:600, visualRange:250});
  assert.equal(applied.cap, 600);
  assert.equal(applied.visualRange, 250);
  assert(fs.readFileSync(applied.backupPath).equals(f.original));
  const restored = await service.restore({gameRoot:f.root, confirm:'restore-jiuyin-fps'});
  assert.equal(restored.cap, 300);
  assert(fs.readFileSync(f.target).equals(f.original));
  assert.equal(calls, 2);
});

test('second reviewed variant retains its own bytes, backup and recognition across restart and expiry',async t=>{
  const f=await fixture(t,{alternate:true});
  assert.equal((await f.service.state(f.root)).canApply,true);
  const result=await f.service.apply({gameRoot:f.root,confirm:'apply-jiuyin-fps',cap:1000,visualRange:1000,acknowledgeSaveRisk:true});
  assert.equal(result.cap,999);assert.equal(result.visualRange,1000);
  assert(fs.readFileSync(result.backupPath).equals(f.alternate));
  assert(fs.readFileSync(f.target).subarray(0,f.profile.offset).equals(f.alternate.subarray(0,f.profile.offset)));
  const restarted=f.restart();assert.equal((await restarted.state(f.root)).cap,999);
  let checks=0;await restarted.restoreExpired(f.root,async()=>checks++);
  assert.equal(checks,2);assert(fs.readFileSync(f.target).equals(f.alternate));
  assert.equal((await restarted.state(f.root)).canApply,true);
});

test('cross-variant original import is rejected, matching import recovers custom patch without metadata',async t=>{
  const f=await fixture(t,{alternate:true}), source=path.join(f.dir,'import.package');
  fs.writeFileSync(source,f.original);
  await assert.rejects(f.service.importBackup({gameRoot:f.root,sourceFile:source}),/此游戏版本/);
  const result=await f.service.apply({gameRoot:f.root,confirm:'apply-jiuyin-fps',cap:600,visualRange:750});
  fs.unlinkSync(result.backupPath);
  assert.equal((await f.restart().state(f.root)).supported,false);
  await assert.rejects(f.service.importBackup({gameRoot:f.root,sourceFile:source}),/其他工具修改/);
  fs.writeFileSync(source,f.alternate);
  assert.equal((await f.service.importBackup({gameRoot:f.root,sourceFile:source})).cap,600);
  await f.restart().restore({gameRoot:f.root,confirm:'restore-jiuyin-fps'});
  assert(fs.readFileSync(f.target).equals(f.alternate));
});

test('reviewed second variant does not permit third-party edits even with a valid backup',async t=>{
  const f=await fixture(t,{alternate:true});
  await f.apply();
  const changed=fs.readFileSync(f.target);changed[1]^=1;fs.writeFileSync(f.target,changed);
  const previousWrites=f.writes;
  assert.equal((await f.restart().state(f.root)).supported,false);
  await assert.rejects(f.apply(),/其他工具修改/);
  await assert.rejects(f.restore(),/其他工具修改/);
  assert.equal(f.writes,previousWrites);assert(fs.readFileSync(f.target).equals(changed));
});

test("candidate changes only the intended slider and indexed block", async (t) => {
  const f = await fixture(t),
    b = await buildCandidate(f.original, f.profile);
  assert.equal(b.length, f.original.length);
  assert.equal(decode(b, f.profile).maximum, 120);
  assert.ok(
    b
      .subarray(0, f.profile.offset)
      .equals(f.original.subarray(0, f.profile.offset)),
  );
  assert.ok(
    b
      .subarray(f.profile.offset + f.profile.length)
      .equals(f.original.subarray(f.profile.offset + f.profile.length)),
  );
  assert.equal(
    decode(b, f.profile).text,
    decode(f.original, f.profile).text.replace(
      'Maximum="100"',
      'Maximum="120"',
    ),
  );
  await assert.rejects(buildCandidate(f.patched, f.profile), /原版资源校验/);
  assert.throws(() => decode(f.original.subarray(1), f.profile), /大小不匹配/);
});
test("VIP apply backs up original; expired member can restore for free", async (t) => {
  const f = await fixture(t);
  const before = await f.service.state(f.root);
  assert.equal(before.canApply, true);
  const result = await f.apply();
  assert.equal(result.cap, 360);
  assert.equal(result.hasBackup, true);
  assert.equal(f.calls, 2);
  assert.equal(digest(fs.readFileSync(result.backupPath)), f.profile.original);
  f.license(false);
  assert.equal(
    (await f.service.state(f.root)).cap,
    360,
    "expiry does not secretly revert game",
  );
  await assert.rejects(f.apply(), /VIP/);
  const restored = await f.restore();
  assert.equal(restored.cap, 300);
  assert.equal(f.writes, 2);
  assert.ok(fs.readFileSync(f.target).equals(f.original));
});
test("free/expired member cannot apply; entitlement is rechecked immediately before replacement", async (t) => {
  const f = await fixture(t);
  f.license(false);
  await assert.rejects(f.apply(), /VIP/);
  assert.equal(f.writes, 0);
  const g = await fixture(t, { expireDuringWrite: true });
  await assert.rejects(g.apply(), /VIP/);
  assert.equal(g.writes, 0);
  assert.ok(fs.readFileSync(g.target).equals(g.original));
  assert.deepEqual(fs.readdirSync(path.dirname(g.target)), ["skin.package"]);
});
test("running game blocks apply and restore without touching resources", async (t) => {
  const f = await fixture(t);
  f.running(true);
  assert.equal((await f.service.state(f.root)).canApply, false);
  await assert.rejects(f.apply(), /退出游戏/);
  assert.equal(f.writes, 0);
  f.running(false);
  await f.apply();
  f.running(true);
  await assert.rejects(f.restore(), /退出游戏/);
  assert.equal(f.writes, 1);
});
test("unknown package and DLL versions are rejected; original recovery survives DLL update", async (t) => {
  const f = await fixture(t);
  const altered = Buffer.from(f.original);
  altered[0] ^= 1;
  fs.writeFileSync(f.target, altered);
  assert.equal((await f.service.state(f.root)).supported, false);
  await assert.rejects(f.apply(), /其他工具修改/);
  assert.equal(f.writes, 0);
  fs.writeFileSync(f.target, f.original);
  fs.writeFileSync(path.join(f.root, "bin64/fxgamelogic.dll"), "updated");
  await assert.rejects(f.apply(), /模块版本不匹配/);
  const g = await fixture(t);
  await g.apply();
  fs.writeFileSync(path.join(g.root, "bin64/fxgamelogic.dll"), "updated");
  assert.equal((await g.service.state(g.root)).canRestore, true);
  assert.equal((await g.restore()).cap, 300);
});
test("high caps require risk acknowledgement; recognized legacy patch requires a verified original backup", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    f.service.apply({
      gameRoot: f.root,
      confirm: "apply-jiuyin-fps",
      cap: 999,
    }),
    /保存溢出风险/,
  );
  fs.writeFileSync(f.target, f.legacy);
  assert.equal((await f.service.state(f.root)).cap, 999);
  assert.equal((await f.service.state(f.root)).canApply, false);
  await assert.rejects(f.apply(), /缺少经过校验/);
  const source = path.join(f.dir, "import.package");
  fs.writeFileSync(source, f.patched);
  await assert.rejects(
    f.service.importBackup({ gameRoot: f.root, sourceFile: source }),
    /未经修改/,
  );
  fs.writeFileSync(source, f.original);
  f.license(false);
  assert.equal(
    (await f.service.importBackup({ gameRoot: f.root, sourceFile: source }))
      .hasBackup,
    true,
  );
  assert.equal((await f.restore()).cap, 300);
  assert.equal(f.writes, 1);
});
test("corrupt backups and conflicting loose XML fail closed", async (t) => {
  const f = await fixture(t),
    applied = await f.apply();
  fs.writeFileSync(applied.backupPath, "corrupt");
  await assert.rejects(f.restore(), /备份/);
  assert.equal(f.writes, 1);
  const g = await fixture(t),
    loose = path.join(g.root, "res/skin/form_stage_main/form_system");
  fs.mkdirSync(loose, { recursive: true });
  fs.writeFileSync(path.join(loose, "form_system_setting.xml"), "fixture");
  await assert.rejects(g.apply(), /独立设置 XML/);
  assert.equal(g.writes, 0);
});
test("failed replacement leaves the original and backup intact, removes only its staging file", async (t) => {
  const f = await fixture(t, { failReplace: true });
  await assert.rejects(f.apply(), /access denied/);
  assert.ok(fs.readFileSync(f.target).equals(f.original));
  assert.deepEqual(fs.readdirSync(path.dirname(f.target)), ["skin.package"]);
  assert.equal((await f.service.state(f.root)).hasBackup, true);
});
test("concurrent applications serialize and cannot replace the original backup", async (t) => {
  const f = await fixture(t);
  const results = await Promise.all([f.apply(), f.apply()]);
  assert.equal(f.writes, 1);
  assert.ok(results.every((r) => r.cap === 360));
  assert.equal(
    digest(fs.readFileSync(results[0].backupPath)),
    f.profile.original,
  );
});
test("IPC is main-frame-only and FPS is excluded from VIP grants", () => {
  const main = fs.readFileSync(
    path.join(__dirname, "../electron/main.cjs"),
    "utf8",
  );
  assert.match(main, /Unsupported FPS settings sender/);
  assert.match(main, /authorize:requireAdministrator/);
  const policy = createVipPolicy({
    state: () => ({ status: "active", features: ["vip"] }),
  });
  assert.ok(!policy.state().features.includes("jiuyin.fps"));
  const free = createVipPolicy({
    state: () => ({ status: "unlicensed", features: [] }),
  });
  assert.throws(() => free.requireFeature("jiuyin.fps"), /VIP/);
});

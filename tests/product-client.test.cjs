const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const {
  createProductClient,
  verifyManifest,
  newer,
  downloadUrl,
} = require("../electron/product-client.cjs");
const { validateConfig } = require("../electron/licensing.cjs");
const keys = crypto.generateKeyPairSync("ed25519"),
  raw = keys.publicKey.export({ format: "der", type: "spki" }).subarray(-32),
  input = {
    endpoint: "https://example.invalid",
    publicKey: raw.toString("base64url"),
  },
  config = validateConfig(input, true);
function manifest(values = {}, revision = 0) {
  const now = Math.floor(Date.now() / 1000),
    c = {
      month_fen: 990,
      year_fen: 9900,
      wechat: "Tens__",
      qr_data: "",
      update: {
        enabled: false,
        version: "0.39.0",
        mode: "optional",
        url: "",
        sha256: "",
        size: 0,
        notes: "",
        ...values,
      },
    };
  const p = {
    iss: "synapsex-product",
    aud: "synapsex-desktop",
    iat: now,
    exp: now + 86400,
    revision,
    config: c,
  };
  const message = [{ alg: "EdDSA", typ: "JWT", kid: config.kid }, p]
    .map((x) => Buffer.from(JSON.stringify(x)).toString("base64url"))
    .join(".");
  return (
    message +
    "." +
    crypto
      .sign(null, Buffer.from(message), keys.privateKey)
      .toString("base64url")
  );
}
function fixture(
  t,
  downloadBody = Buffer.from("MZvalid fixture"),
  updates = {},
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sx-product-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let offline = false,
    current = manifest({
      enabled: true,
      url: "https://gitee.com/example/app.exe",
      size: downloadBody.length,
      sha256: crypto.createHash("sha256").update(downloadBody).digest("hex"),
      ...updates,
    }),
    opened = "";
  const opts = {
    app: { getPath: () => dir, getVersion: () => "0.38.0", isPackaged: true },
    config: input,
    shell: { showItemInFolder: (f) => (opened = f) },
    fetchImpl: async (url) => {
      if (offline) throw Error("offline");
      return url.endsWith("/v1/product")
        ? new Response(JSON.stringify({ manifest: current }))
        : new Response(downloadBody);
    },
  };
  return {
    client: createProductClient(opts),
    opts,
    setOffline: () => (offline = true),
    setManifest: (v) => (current = v),
    opened: () => opened,
    dir,
  };
}
test("manifest signature, domain separation, version ordering and URL allowlist", () => {
  const signed = manifest();
  assert.equal(
    verifyManifest(signed, config, Math.floor(Date.now() / 1000)).config
      .month_fen,
    990,
  );
  assert.throws(() =>
    verifyManifest(
      signed.slice(0, -8) + "AAAAAAAA",
      config,
      Math.floor(Date.now() / 1000),
    ),
  );
  assert.equal(newer("0.39.0", "0.9.0"), true);
  assert.equal(newer("0.39.0", "0.39.0"), false);
  for (const url of [
    "http://gitee.com/a",
    "https://gitee.com.evil.test/a",
    "https://gitee.com@evil.test/a",
    "https://127.0.0.1/a",
  ])
    assert.throws(() => downloadUrl(url));
});
test("optional download uses real byte counts and opens only verified package", async (t) => {
  const f = fixture(t);
  assert.throws(() => f.client.showDownload());
  await f.client.refresh();
  f.client.requireAccess();
  const result = await f.client.download();
  assert.equal(result.progress.phase, "ready");
  assert.equal(result.progress.received, result.progress.total);
  f.client.showDownload();
  assert.equal(fs.readFileSync(f.opened()).toString(), "MZvalid fixture");
});
test("mandatory update remains blocking offline and across restart; server can disable it", async (t) => {
  const f = fixture(t, undefined, { mode: "mandatory" });
  await f.client.refresh();
  assert.throws(() => f.client.requireAccess());
  f.setOffline();
  await f.client.refresh();
  assert.throws(() => createProductClient(f.opts).requireAccess());
  const g = fixture(t, undefined, { mode: "mandatory" });
  await g.client.refresh();
  g.setManifest(manifest({ enabled: false }, 1));
  await g.client.refresh();
  g.client.requireAccess();
});
test("wrong hash, HTML responses and oversized files fail with no runnable output", async (t) => {
  for (const [bytes, updates] of [
    [Buffer.from("MZfixture"), { sha256: "a".repeat(64) }],
    [Buffer.from("<html>"), {}],
    [Buffer.from("MZtoolarge"), { size: 1 }],
  ]) {
    const f = fixture(t, bytes, updates);
    const s = await f.client.download();
    assert.equal(s.progress.phase, "error");
    assert.throws(() => f.client.showDownload());
    assert.equal(
      fs
        .readdirSync(path.join(f.dir, "updates"))
        .filter((x) => x.endsWith(".exe") || x.endsWith(".part")).length,
      0,
    );
  }
});
test("untrusted cache cannot enable releases and older revisions cannot replace newer config", async (t) => {
  const f = fixture(t);
  f.setManifest(manifest({ mode: "mandatory" }, 4));
  await f.client.refresh();
  f.setManifest(manifest({}, 2));
  const s = await f.client.refresh();
  assert.match(s.error, /旧版/);
  fs.writeFileSync(
    path.join(f.dir, "updates/product-manifest.json"),
    JSON.stringify({ token: "forged" }),
  );
  assert.equal(createProductClient(f.opts).state().config, null);
});

test("missing server route is explicit and never fabricates entitlements or updates", async (t) => {
  const f = fixture(t);
  const c = createProductClient({ ...f.opts, fetchImpl: async () => new Response('', { status: 404 }) });
  const result = await c.refresh();
  assert.match(result.error, /服务器尚未提供/);
  assert.equal(result.config, null);
  assert.equal(result.available, false);
  assert.equal(result.required, false);
});

test('disabled, equal and older releases never prompt or block regardless of mandatory flag',async t=>{
  for(const update of [{enabled:false,mode:'mandatory'},{version:'0.38.0',mode:'mandatory'},{version:'0.37.9',mode:'mandatory'}]) {
    const f=fixture(t,undefined,update);const s=await f.client.refresh();
    assert.equal(s.available,false);assert.equal(s.required,false);f.client.requireAccess();
    assert.equal((await f.client.download()).progress.phase,'error');
  }
});

test('download rejects redirects outside the allowlist and never opens them',async t=>{
  const f=fixture(t);
  const c=createProductClient({...f.opts,fetchImpl:async(url,options)=>url.endsWith('/v1/product')?f.opts.fetchImpl(url,options):new Response(null,{status:302,headers:{location:'https://example.invalid/foreign.exe'}})});
  const s=await c.download();assert.equal(s.progress.phase,'error');assert.match(s.progress.message,/码云/);assert.throws(()=>c.showDownload());
});

test('download follows allowed redirects and handles streamed chunks with real progress',async t=>{
  const bytes=Buffer.from('MZvalid fixture'),f=fixture(t,bytes);let downloads=0;
  const c=createProductClient({...f.opts,fetchImpl:async(url,options)=>{
    if(url.endsWith('/v1/product'))return f.opts.fetchImpl(url,options);
    if(downloads++===0)return new Response(null,{status:302,headers:{location:'https://gitee.com/example/release.exe'}});
    return new Response(new ReadableStream({start(controller){controller.enqueue(bytes.subarray(0,1));controller.enqueue(bytes.subarray(1,5));controller.enqueue(bytes.subarray(5));controller.close();}}));
  }});
  const s=await c.download();assert.equal(downloads,2);assert.equal(s.progress.phase,'ready');assert.equal(s.progress.received,bytes.length);c.showDownload();assert(fs.readFileSync(f.opened()).equals(bytes));
});

test('shutdown cancels in-flight download and removes partial data',async t=>{
 const f=fixture(t);let started;
 const ready=new Promise(resolve=>started=resolve);
 const c=createProductClient({...f.opts,fetchImpl:async(url,options)=>{
   if(url.endsWith('/v1/product'))return f.opts.fetchImpl(url,options);
   return new Response(new ReadableStream({start(controller){controller.enqueue(Buffer.from('MZ'));options.signal.addEventListener('abort',()=>controller.error(Error('download cancelled')),{once:true});started();}}));
 }});
 const pending=c.download();await ready;await c.stop();const s=await pending;
 assert.equal(s.progress.phase,'error');assert.throws(()=>c.showDownload());assert(!fs.readdirSync(path.join(f.dir,'updates')).some(n=>/\.(part|exe)$/.test(n)));
});

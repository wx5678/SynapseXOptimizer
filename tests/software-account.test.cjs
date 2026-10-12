const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createSoftwareAccount } = require("../electron/software-account.cjs");
let server, config, csrf, cookie;
const directories = [];
before(async () => {
  const python = process.env.SYNAPSEX_TEST_PYTHON;
  if (!python) throw Error("Set SYNAPSEX_TEST_PYTHON");
  server = spawn(python, ["-u", path.join(__dirname, "license_fixture.py")], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  config = await new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(Error("Fixture timeout")), 15000);
    server.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.includes("\n")) {
        clearTimeout(timeout);
        resolve(JSON.parse(output.split("\n")[0]));
      }
    });
    server.on("error", reject);
  });
  const r = await fetch(config.endpoint + "/admin/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: config.endpoint },
    body: JSON.stringify({
      username: "testadmin",
      password: "local-integration-test-password",
    }),
  });
  cookie = r.headers.get("set-cookie").split(";")[0];
  csrf = (await r.json()).csrf;
});
after(() => {
  server?.kill();
  for (const dir of directories)
    fs.rmSync(dir, { recursive: true, force: true });
});
function client(overrides = {}) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "synapsex-account-test-"),
  );
  directories.push(directory);
  const key = crypto.randomBytes(32);
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (text) => {
      const iv = crypto.randomBytes(12),
        c = crypto.createCipheriv("aes-256-gcm", key, iv);
      const body = Buffer.concat([c.update(text), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), body]);
    },
    decryptString: (bytes) => {
      const d = crypto.createDecipheriv(
        "aes-256-gcm",
        key,
        bytes.subarray(0, 12),
      );
      d.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([
        d.update(bytes.subarray(28)),
        d.final(),
      ]).toString();
    },
  };
  const options = {
    app: { getPath: () => directory, isPackaged: false },
    safeStorage,
    config,
    deviceHash: crypto.randomBytes(32).toString("hex"),
    ...overrides,
  };
  return { service: createSoftwareAccount(options), options, directory };
}
async function admin(route, data) {
  const r = await fetch(config.endpoint + "/admin/api/" + route, {
    method: data ? "POST" : "GET",
    headers: {
      Cookie: cookie,
      Origin: config.endpoint,
      "X-CSRF-Token": csrf,
      "Content-Type": "application/json",
    },
    body: data
      ? JSON.stringify({
          request_id: crypto.randomUUID(),
          reason: "test only",
          ...data,
        })
      : undefined,
  });
  assert.equal(r.ok, true);
  return r.json();
}
const credentials = (name) => ({
  username: name,
  password: "synthetic-client-password-2026",
});

test('operator-created short owner login works without weakening public registration', async () => {
  const first = client(), second = client();
  await assert.rejects(first.service.register({username:'1',password:'shortx'}));
  await assert.rejects(first.service.register({username:'normalowner',password:'shortx'}));
  const result = await first.service.login({username:'1',password:'shortx'});
  assert.equal(result.administrator, true);
  assert.equal(result.user.username, '1');
  assert.equal((await second.service.login({username:'1',password:'shortx'})).administrator, true);
  const restarted = createSoftwareAccount(first.options);
  assert.equal((await restarted.sync()).administrator, true);
  const saved = fs.readFileSync(path.join(first.directory, 'software-account.enc'));
  assert.equal(saved.includes(Buffer.from('shortx')), false);
  assert.equal(first.options.safeStorage.decryptString(saved).includes('shortx'), false);
  await first.service.logout();
  await second.service.logout();
});
test('signed administrator role is device-bound, not inferred from VIP strings, and cancelled online', async()=>{
  const c=client(),s=await c.service.register(credentials('roleclient'));
  await admin('users/'+s.user.id+'/grant',{days:30,device_limit:1,features:['vip','jiuyin.fps','account.admin']});
  assert.equal((await c.service.sync()).administrator,false);
  await admin('users/'+s.user.id+'/promote',{});
  const promoted=await c.service.sync();
  assert.equal(promoted.administrator,true);
  const other=client();
  assert.equal((await other.service.login(credentials('roleclient'))).administrator,true);
  const wrongDevice=client({...c.options,deviceHash:crypto.randomBytes(32).toString('hex')});
  assert.equal(wrongDevice.service.state().administrator,false);
  await admin('users/'+s.user.id+'/demote',{});
  await assert.rejects(c.service.sync());
  assert.equal(c.service.state().administrator,false);
});
test("register, administrator grant, sync and encrypted account persistence", async () => {
  const c = client();
  let s = await c.service.register(credentials("clientone"));
  assert.equal(s.status, "unlicensed");
  assert.equal((await admin("users?q=clientone")).items[0].id, s.user.id);
  await admin("users/" + s.user.id + "/grant", {
    days: 30,
    device_limit: 1,
    features: ["test.pilot"],
  });
  s = await c.service.sync();
  assert.equal(s.status, "active");
  assert.deepEqual(s.features, ["test.pilot"]);
  assert.equal(s.enforcement, true);
  const bytes = fs.readFileSync(path.join(c.directory, "software-account.enc"));
  assert.equal(bytes.includes(Buffer.from("synthetic-client-password")), false);
  assert.equal(JSON.stringify(s).includes("session_token"), false);
  assert.equal(createSoftwareAccount(c.options).state().user.id, s.user.id);
  const saved = JSON.parse(c.options.safeStorage.decryptString(bytes));
  assert.equal(
    JSON.stringify(saved).includes("synthetic-client-password"),
    false,
  );
  await c.service.logout();
  assert.equal(c.service.state().user, null);
});
test('server signed VIP grant unlocks policy; revocation relocks after sync',async()=>{
  const {createVipPolicy}=require('../electron/vip-policy.cjs');
  const c=client();const registration=await c.service.register(credentials('vipclient'));
  await admin('users/'+registration.user.id+'/grant',{days:1,device_limit:1,features:['vip']});
  await c.service.sync();const policy=createVipPolicy(c.service);
  assert.equal(policy.state().signinLimit,3);policy.requireFeature('lab.all');
  await admin('licenses/'+c.service.state().licenseId+'/revoke',{});await c.service.sync();
  assert.equal(policy.state().signinLimit,1);assert.throws(()=>policy.requireFeature('lab.all'));
});
test("offline keeps valid permit but disabling account clears local session on sync", async () => {
  let offline = false;
  const c = client({
    fetchImpl: (...args) => {
      if (offline) throw Error("offline");
      return fetch(...args);
    },
  });
  let s = await c.service.register(credentials("clienttwo"));
  await admin("users/" + s.user.id + "/grant", {
    days: 30,
    device_limit: 1,
    features: ["test.pilot"],
  });
  await c.service.sync();
  offline = true;
  await assert.rejects(c.service.sync(), /无法连接/);
  assert.equal(c.service.state().status, "active");
  offline = false;
  await admin("users/" + s.user.id + "/disable", {});
  await assert.rejects(c.service.sync(), /失效/);
  assert.equal(c.service.state().user, null);
  assert.deepEqual(c.service.state().features, []);
});
test("expired remembered session permits logging in again and password is not persisted", async () => {
  let now = Math.floor(Date.now() / 1000);
  const c = client({ now: () => now });
  await c.service.register(credentials("clientthree"));
  now += 181 * 86400;
  assert.equal(c.service.state().user, null);
  await c.service.login(credentials("clientthree"));
  assert.equal(c.service.state().status, "logged_out");
  // Server time is authoritative for session expiry; artificial future client clock stays logged out.
  now = Math.floor(Date.now() / 1000);
  assert.equal(c.service.state().user.username, "clientthree");
});
test("encryption unavailable prevents credential transmission", async () => {
  let called = 0;
  const c = client({
    safeStorage: { isEncryptionAvailable: () => false },
    fetchImpl: () => {
      called++;
    },
  });
  await assert.rejects(
    c.service.register(credentials("nottransmitted")),
    /安全存储/,
  );
  assert.equal(called, 0);
});
test("account IPC only exposes fixed methods and passwords are cleared in the form", () => {
  const main = fs.readFileSync(
    path.join(__dirname, "../electron/main.cjs"),
    "utf8",
  );
  assert.match(main, /Unsupported account sender/);
  assert.match(main, /softwareAccount\?\.stop\(\)/);
  const ui = fs.readFileSync(
    path.join(__dirname, "../src/components/SoftwareAccountCard.tsx"),
    "utf8",
  );
  assert.match(ui, /setPassword\(["']["']\)/);
  assert.match(ui, /setRepeat\(["']["']\)/);
});

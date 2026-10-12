// Explicit deployment smoke test. Credentials stay in memory and are never printed.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const readline = require('node:readline');
const endpoint = 'https://39.96.195.192';
if (process.env.SYNAPSEX_CLOUD_SMOKE !== '1') throw Error('Explicit cloud smoke opt-in required');
let token;
const identity = {
  username: `deploytest_${Date.now().toString(36)}`,
  password: crypto.randomBytes(32).toString('base64url'),
  device_hash: crypto.randomBytes(32).toString('hex'),
};
async function request(route, body, authorized = false) {
  const response = await fetch(endpoint + route, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(authorized ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, body: await response.json() };
}
async function main() {
  assert.equal((await request('/healthz')).body.version, '0.3.0');
  assert.equal((await request('/admin/api/users')).status, 401);
  const registration = await request('/v1/account/register', identity);
  assert.equal(registration.status, 201);
  token = registration.body.session_token;
  const state = await request('/v1/account/sync', {device_hash: identity.device_hash}, true);
  assert.equal(state.body.status, 'unlicensed');
  assert.equal(state.body.license, null);
  assert.equal((await request('/v1/account/logout', {device_hash: identity.device_hash}, true)).status, 200);
  assert.equal((await request('/v1/account/sync', {device_hash: identity.device_hash}, true)).status, 401);
  const login = await request('/v1/account/login', identity);
  assert.equal(login.status, 200);
  token = login.body.session_token;
  console.log(JSON.stringify({stage:'registered_unlicensed_login_logout_passed', username:identity.username, id:login.body.user.id}));
  const lines = readline.createInterface({input: process.stdin});
  for await (const line of lines) {
    if (line === 'exit') break;
    const result = await request('/v1/account/sync', {device_hash: identity.device_hash}, true);
    if (line === 'active') {
      assert.equal(result.status, 200);
      assert.equal(result.body.status, 'active');
      assert.ok(result.body.license);
    } else if (line === 'revoked') {
      assert.equal(result.body.status, 'revoked');
      assert.equal(result.body.license, null);
    } else if (line === 'disabled') {
      assert.equal(result.status, 401);
      assert.equal((await request('/v1/account/login', identity)).status, 401);
    } else throw Error('Unknown test step');
    console.log(JSON.stringify({stage:line, result:'passed', http:result.status}));
  }
  lines.close();
}
main().catch(error => {console.error(error.message); process.exitCode = 1;});

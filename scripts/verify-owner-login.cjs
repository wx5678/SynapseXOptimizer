// Explicit operator smoke test. Receives the password on stdin, never persists or prints it.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {createSoftwareAccount} = require('../electron/software-account.cjs');
const config = require('../electron/license-config.json');
let password = '', started = false;
process.stdin.setEncoding('utf8');
process.stdin.on('data', value => { password += value; if(!started && password.includes('\n')) { started=true; process.stdin.pause(); void verify(password.trimEnd()).finally(()=>{password='';}); } });
process.stdin.on('end',()=>{if(!started){console.error('No newline-terminated password supplied on stdin; no verification performed');process.exitCode=1;}});
async function verify(secret) {
 const clients = [], directories = [];
 try {
  assert.equal(config.endpoint, 'https://39.96.195.192');
  for(let i=0;i<2;i++) {
   const dir = fs.mkdtempSync(path.join(os.tmpdir(),'synapsex-owner-smoke-'));
   directories.push(dir);
   const key = crypto.randomBytes(32);
   const safeStorage = {isEncryptionAvailable:()=>true,
    encryptString(text) {const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv); const data=Buffer.concat([c.update(text),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data]);},
    decryptString(data) {const d=crypto.createDecipheriv('aes-256-gcm',key,data.subarray(0,12));d.setAuthTag(data.subarray(12,28));return Buffer.concat([d.update(data.subarray(28)),d.final()]).toString();}};
   const options = {app:{isPackaged:true,getPath:()=>dir}, safeStorage, config, deviceHash:crypto.randomBytes(32).toString('hex')};
   const client = createSoftwareAccount(options); clients.push(client);
   const state = await client.login({username:'1',password:secret});
   assert.equal(state.administrator,true); assert.equal(state.user.username,'1'); assert.equal(state.status,'active');
   const restored = createSoftwareAccount(options);
   assert.equal((await restored.sync()).administrator,true);
   const persisted = safeStorage.decryptString(fs.readFileSync(path.join(dir,'software-account.enc')));
   assert.equal(persisted.includes(secret),false);
   console.log(JSON.stringify({device:i+1,login:true,signedAdministrator:true,sessionRestored:true,status:state.status,vipStatus:state.vipStatus}));
  }
  assert.equal((await clients[0].sync()).administrator,true);
  console.log('PASS: both device sessions remain valid; first device was not evicted');
 } catch(e) {console.error('Verification failed: '+e.message); process.exitCode=1;}
 finally {
  for(const client of clients) {try{await client.logout();}catch{console.error('Test session logout failed'); process.exitCode=1;}client.stop();}
  for(const dir of directories) {
   const resolved=path.resolve(dir);
   assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));
   assert(path.basename(resolved).startsWith('synapsex-owner-smoke-'));
   fs.rmSync(resolved,{recursive:true,force:true});
  }
  console.log('Isolated encrypted smoke-test files removed; user app data unchanged');
  process.exit(process.exitCode||0);
 }
}

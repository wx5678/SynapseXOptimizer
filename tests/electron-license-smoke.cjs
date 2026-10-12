// Run under Electron, not Node. Tests real DPAPI without opening or closing the user's app.
const { app, safeStorage } = require('electron');
const { createLicensing } = require('../electron/licensing.cjs');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const directory = fs.mkdtempSync(path.join(os.tmpdir(),'synapsex-dpapi-smoke-'));
app.setPath('userData',directory);
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  try {
    const service=createLicensing({app,safeStorage,config:JSON.parse(process.env.SYNAPSEX_LICENSE_SMOKE_CONFIG)});
    const state=await service.activate(process.env.SYNAPSEX_LICENSE_SMOKE_CODE);
    assert.equal(state.status,'active');
    const persisted=safeStorage.decryptString(fs.readFileSync(path.join(directory,'license-state.enc')));
    assert.ok(JSON.parse(persisted).refreshToken);
    assert.equal((await service.refresh()).status,'active');
    await service.deactivate();
    assert.equal(service.state().status,'inactive');
    console.log('ELECTRON_DPAPI_PASS: real machine identity, activation, encrypted persistence, refresh, deactivation');
    app.exit(0);
  } catch(error) {
    console.error('ELECTRON_DPAPI_FAIL: '+error.message);
    app.exit(1);
  }
});
app.on('will-quit',()=>{
  // Only the exact directory created by this test is eligible for cleanup.
  if(path.dirname(directory)===os.tmpdir() && path.basename(directory).startsWith('synapsex-dpapi-smoke-')) fs.rmSync(directory,{recursive:true,force:true});
});

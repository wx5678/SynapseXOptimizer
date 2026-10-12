// Real Electron sessions, isolated temporary userData, public read-only requests.
// This test never logs in and never invokes batch/sign/startup.
const { app, BrowserWindow, session, safeStorage } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict');
const {createCommunityAccounts} = require('../electron/community-accounts.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(),'synapsex-multi-smoke-'));
app.setPath('userData',directory);
app.whenReady().then(async()=>{
  let manager;
  try {
    manager=createCommunityAccounts({app,BrowserWindow,session,safeStorage,getMainWindow:()=>undefined});
    const second=await manager.addAccount({name:'隔离测试账号'});
    await manager.refreshAccounts();
    const catalog=await manager.catalog();
    const option=catalog.servers.find(s=>s.active && catalog.groups.some(g=>g.id===s.groupId));
    assert.ok(option);
    await manager.selectServer({accountId:second.accountId,serverId:option.id,groupId:option.groupId,optionKey:option.optionKey});
    const state=manager.accounts();
    assert.equal(state.accounts.length,2); assert.ok(state.accounts.every(a=>a.state?.loggedIn===false));
    assert.equal(state.accounts[0].state.choice.optionKey || '','');
    assert.equal(state.accounts[1].state.choice.optionKey,option.optionKey);
    assert.equal(state.autoSign,false);
    const encrypted=safeStorage.encryptString('synthetic-only');assert.equal(safeStorage.decryptString(encrypted),'synthetic-only');
    console.log(JSON.stringify({passed:true,accounts:2,independentSelection:true,notLoggedIn:true,groups:catalog.groups.length,servers:catalog.servers.length,encryption:true,signRequests:0}));
  } catch(e) {console.error(e.message);process.exitCode=1;}
  finally {await manager?.shutdown();app.exit(process.exitCode||0);}
});

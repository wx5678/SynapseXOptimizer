const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {RELEASE,checkedUrl,downloadInstaller,createSensorInstaller}=require('../electron/sensor-installer.cjs');
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'synapsex-installer-test-'));return {root,clean:()=>{assert.ok(root.startsWith(path.join(os.tmpdir(),'synapsex-installer-test-')));fs.rmSync(root,{recursive:true,force:true});}};}
test('driver installer uses pinned official source and blocks untrusted redirects',()=>{
 assert.equal(new URL(RELEASE.url).hostname,'github.com');assert.match(RELEASE.sha256,/^[a-f\d]{64}$/);
 for(const url of ['http://github.com/file','https://evil.test/file','https://github.com@evil.test/file','https://github.com:444/file'])assert.throws(()=>checkedUrl(url));
});
test('declining driver install downloads and executes nothing',async()=>{
 let calls=0;const installer=createSensorInstaller({directory:'unused',scriptPath:'fixed.ps1',confirm:async()=>false,download:async()=>calls++,execute:async()=>calls++});
 assert.equal((await installer.install()).status,'cancelled');assert.equal(calls,0);
});
test('bad size/hash never passes downloader verification',async()=>{
 const f=fixture();try{await assert.rejects(downloadInstaller(path.join(f.root,'bad.exe'),async()=>new Response(Buffer.alloc(RELEASE.size))),/校验失败/);
 await assert.rejects(downloadInstaller(path.join(f.root,'huge.exe'),async()=>new Response(Buffer.alloc(RELEASE.size+1))),/大小异常/);
 await assert.rejects(downloadInstaller(path.join(f.root,'redirect.exe'),async()=>new Response(null,{status:302,headers:{location:'http://evil.test/file'}})),/官方来源/);
 }finally{f.clean();}
});
test('duplicate clicks share one confirmation/download/install and fixed script only',async()=>{
 const f=fixture();let confirmed=0,downloaded=0,executed=0;
 try{const service=createSensorInstaller({directory:f.root,scriptPath:'C:/App/host/InstallSensorDriver.ps1',confirm:async()=>{confirmed++;return true;},download:async file=>{downloaded++;fs.writeFileSync(file,'fixture');},execute:async(exe,args,opts)=>{executed++;assert.equal(exe,'powershell.exe');assert.ok(args.includes('C:/App/host/InstallSensorDriver.ps1'));assert.ok(!args.includes('-silent'));assert.equal(opts.windowsHide,true);return {stdout:JSON.stringify({status:'installed',message:'fixture'})};}});
 const [a,b]=await Promise.all([service.install(),service.install()]);assert.equal(a.status,'installed');assert.deepEqual(a,b);assert.deepEqual([confirmed,downloaded,executed],[1,1,1]);assert.equal(fs.readdirSync(f.root).length,0);
 }finally{f.clean();}
});
test('download failures and installer failures are not treated as success',async()=>{
 const f=fixture();let executed=0;
 try{const failed=createSensorInstaller({directory:f.root,scriptPath:'fixed',confirm:async()=>true,download:async()=>{throw Error('download failed');},execute:async()=>executed++});await assert.rejects(failed.install(),/下载或校验/);assert.equal(executed,0);
 const bad=createSensorInstaller({directory:f.root,scriptPath:'fixed',confirm:async()=>true,download:async()=>{},execute:async()=>{throw Error('untrusted');}});await assert.rejects(bad.install(),/校验或安装未完成/);assert.equal(fs.readdirSync(f.root).length,0);
 }finally{f.clean();}
});
test('signature, hash and observed service are required; never silent, reboot or security changes',()=>{
 const script=fs.readFileSync(path.join(__dirname,'../host/InstallSensorDriver.ps1'),'utf8');
 assert.match(script,/Get-AuthenticodeSignature/);assert.match(script,/F380DCC9F706E2756A5047B832FFE719E1BC35F5/);assert.match(script,/Get-FileHash/);assert.match(script,/Get-Service -Name PawnIO/);assert.match(script,/-Verb RunAs -PassThru -Wait/);
 assert.doesNotMatch(script.replace(/^\s*#.*$/gm,''),/Restart-Computer|Set-MpPreference|bcdedit|-silent|-accept/i);
 const main=fs.readFileSync(path.join(__dirname,'../electron/main.cjs'),'utf8');assert.match(main,/monitor:sensor-install', event=>\{\s*requireMonitorMain\(event\)/);assert.match(main,/confirm: \(\)=>sensorPrompt.ask\(mainWindow\)/);
 const ui=fs.readFileSync(path.join(__dirname,'../src/components/SensorInstallDialog.tsx'),'utf8');assert.match(ui,/cancelButton.current\?\.focus\(\)/);assert.match(ui,/需要 Windows 管理员授权/);assert.match(ui,/安装可能要求重启/);assert.match(ui,/不会关闭内存完整性/);
});

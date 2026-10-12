// User-supplied resources are read only. All writes are to a validated temporary copy.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {identifyOriginal,digest,decode,createJiuYinFpsUnlock}=require('../electron/jiuyin-fps-unlock.cjs');
async function main(){
 const [packageFile,dllFile]=process.argv.slice(2);assert(packageFile&&dllFile,'Supply package and DLL paths');
 const original=fs.readFileSync(packageFile),dll=fs.readFileSync(dllFile);
 const profile=identifyOriginal(original);assert(profile,'Unknown sample');assert.equal(digest(dll),profile.dll);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'synapsex-resource-compat-'));
 try{
  const root=path.join(dir,'game'),target=path.join(root,'res','skin.package');
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.mkdirSync(path.join(root,'bin64'));
  fs.writeFileSync(target,original);fs.writeFileSync(path.join(root,'bin64','fxgamelogic.dll'),dll);
  fs.writeFileSync(path.join(root,'bin64','fxgame.exe'),'INERT TEST PLACEHOLDER');
  let checks=0;
  const options={directory:path.join(dir,'backups'),isRunning:async()=>false,authorize:async()=>checks++,
   replaceFile:async o=>{assert.equal(digest(fs.readFileSync(o.target)),o.expectedHash);assert.equal(digest(fs.readFileSync(o.source)),o.newHash);fs.renameSync(o.target,o.backup);fs.renameSync(o.source,o.target);}};
  const service=createJiuYinFpsUnlock(options);assert.equal((await service.state(root)).canApply,true);
  const combinations=[[360,250],[600,250],[1000,250],[300,1000],[1000,1000]];
  for(const [cap,visualRange] of combinations){
   const state=await service.apply({gameRoot:root,confirm:'apply-jiuyin-fps',cap,visualRange,acknowledgeSaveRisk:true});
   assert.equal(state.cap,Math.floor(cap/3)*3);assert.equal(state.visualRange,visualRange);
   const bytes=fs.readFileSync(target);assert(bytes.subarray(0,profile.offset).equals(original.subarray(0,profile.offset)));
   assert(bytes.subarray(profile.offset+profile.length).equals(original.subarray(profile.offset+profile.length)));
   assert(fs.readFileSync(state.backupPath).equals(original));assert.equal(decode(bytes,profile).maximum*3,state.cap);
   assert.equal((await createJiuYinFpsUnlock(options).state(root)).cap,state.cap);
  }
  await service.restoreExpired(root,async()=>checks++);assert(fs.readFileSync(target).equals(original));
  await service.apply({gameRoot:root,confirm:'apply-jiuyin-fps',cap:360,visualRange:450});
  await service.restore({gameRoot:root,confirm:'restore-jiuyin-fps'});assert(fs.readFileSync(target).equals(original));
  assert.equal(digest(fs.readFileSync(packageFile)),profile.original);assert.equal(digest(fs.readFileSync(dllFile)),profile.dll);
  // A matching DLL/slider does not grant permission to patch arbitrary files.
  const unknown=Buffer.from(original);unknown[profile.family.dataOffset]^=1;fs.writeFileSync(target,unknown);
  assert.equal((await service.state(root)).supported,false);
  await assert.rejects(service.apply({gameRoot:root,confirm:'apply-jiuyin-fps',cap:600,visualRange:250}),/资源包已更新或被其他工具修改/);
  assert(fs.readFileSync(target).equals(unknown));
  console.log(JSON.stringify({profile:profile.id,passed:true,combinations:combinations.length,restart:true,expiryRestore:true,manualRestore:true,unknownVariantRejected:true,authorizationChecks:checks,sourceFilesUntouched:true,gameLaunchTested:false}));
 }finally{
  assert.equal(path.dirname(fs.realpathSync(dir)),fs.realpathSync(os.tmpdir()));assert(path.basename(dir).startsWith('synapsex-resource-compat-'));
  fs.rmSync(dir,{recursive:true,force:true});
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});

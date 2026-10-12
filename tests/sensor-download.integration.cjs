// Run with Electron, not Node: exercise the same OS-proxy-aware downloader as
// the desktop app. Verification only; never start the installer or a driver.
const {app,net}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {downloadInstaller}=require('../electron/sensor-installer.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'synapsex-sensor-net-test-'));
app.setPath('userData',path.join(root,'profile'));
app.whenReady().then(async()=>{
 let exitCode=0;
 try{
  const file=path.join(root,'PawnIO_setup.exe');
  await downloadInstaller(file,(url,options)=>net.fetch(url,{...options,redirect:'follow'}));
  const result=execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'../host/InstallSensorDriver.ps1'),'-InstallerPath',file,'-VerifyOnly'],{encoding:'utf8',windowsHide:true});
  console.log('PASS: Electron official download + SHA-256 + Authenticode, NO INSTALL',result.trim());
 }catch(error){console.error(error.message);exitCode=1;}
 finally{try{fs.unlinkSync(path.join(root,'PawnIO_setup.exe'));}catch{}app.exit(exitCode);}
});

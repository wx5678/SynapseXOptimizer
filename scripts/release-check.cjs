// Reviewed allowlist: Windows reads and mock-adapter writes only. No production account or game changes.
const {spawn}=require('node:child_process'), fs=require('node:fs'), path=require('node:path');
const root=path.resolve(__dirname,'..');
const ps=path.join(process.env.WINDIR,'System32/WindowsPowerShell/v1.0/powershell.exe');
const cases=['Test-MonitorSensors','Test-QuickSystemWrites','Test-NicPropertyEditor','Test-NetworkDword','Test-ExpertAdapters','Test-ExpertSettings','Test-DeviceAdapters','Test-DeviceService','Test-AdvancedSystem','Test-BackgroundManager','Test-SystemTools','Test-RealtimeMonitorReadOnly','Test-VipHostBoundary'];
const extended=process.argv.includes('--extended');
if(extended)cases.splice(0,cases.length,'Test-PrivacyMappings','Test-RepairJobs','Test-CleanupCategories','Test-DesktopGamePicker','Test-LatencyLab','Test-SessionLab','Test-SchedulerLab','Test-SessionLabHost','Test-ReleaseAvailability');
if(process.argv.includes('--final'))cases.splice(0,cases.length,'Test-MonitorSensors','Test-RealtimeMonitorReadOnly','Test-PerformanceReports','Test-ReleaseAvailability');
const output=fs.mkdtempSync(path.join(root,'state/release-check-'));
async function run(name,exe,args,timeout=150000){
 const result=await new Promise(resolve=>{let log='';const begin=Date.now();const child=spawn(exe,args,{cwd:root,windowsHide:true,env:{...process.env,PSModulePath:'',SYNAPSEX_STATE_ROOT:path.join(output,name),SYNAPSEX_TEST_PYTHON:'D:/project/.tools/synapsex-license-venv/Scripts/python.exe'}});
 const timer=setTimeout(()=>child.kill(),timeout);child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);child.on('error',e=>log+=e);child.on('close',(code,signal)=>{clearTimeout(timer);fs.writeFileSync(path.join(output,name+'.txt'),log);resolve({name,code,signal,ms:Date.now()-begin})});});
 console.log(JSON.stringify(result));return result;
}
(async()=>{const results=[];
 if(!extended){results.push(await run('node',process.execPath,['--test',...fs.readdirSync(path.join(root,'tests')).filter(n=>n.endsWith('.test.cjs')).map(n=>'tests/'+n)]));
 results.push(await run('server','D:/project/.tools/synapsex-license-venv/Scripts/python.exe',['-m','unittest','discover','-s','server/license-service','-p','test_*.py']));}
 for(const name of cases)results.push(await run(name,ps,['-NoProfile','-ExecutionPolicy','Bypass','-Command',`[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); & './tests/${name}.ps1'`]));
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));console.log('RESULTS '+output);process.exitCode=results.some(r=>r.code!==0)?1:0;
})();

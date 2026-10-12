const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('latency uses cancellable native timers and QPC, never system/game tweaks',()=>{
 const s=read('host/modules/LatencyProbe.cs');
 for(const token of ['CreateWaitableTimerEx','WaitForMultipleObjects','Stopwatch.GetTimestamp','ThreadPriority.Normal','CancelWaitableTimer','CloseHandle','standard-fallback','mutex.ReleaseMutex','stream.Flush(true)'])assert.ok(s.includes(token),token);
 assert.doesNotMatch(s,/timeBeginPeriod|NtSetTimerResolution|SetThreadPriority|SetProcessAffinityMask|SpinWait/);
 assert.match(s,/seconds!=15 && seconds!=30 && seconds!=60/);
});
test('latency routes require explicit measurement and stop; shutdown cancels',()=>{
 const s=read('host/SynapseXHost.ps1');assert.ok((s.match(/Stop-LatencyLab/g)||[]).length>=3);
 assert.match(read('host/modules/LatencyLab.psm1'),/confirmation -cne 'MEASURE'/);
 assert.match(s,/Get-LatencyLabState\)\.Status -eq 'running'/);
});
test('latency presentation states metric boundaries and checks comparison compatibility',()=>{
 const s=read('src/components/LatencyTestPanel.tsx');
 for(const value of ['P95','P99','BoosterX','不能直接横向比较','shown.Method===base.Method','shown.TimerMode===base.TimerMode','shown.DurationSeconds===base.DurationSeconds','designPreview'])assert.ok(s.includes(value),value);
});
test('lab reminder uses durable host preference and native accessible modal',()=>{
 const s=read('src/components/LabEntryGate.tsx');assert.match(s,/showModal\(\)/);assert.match(s,/onCancel=/);assert.match(s,/以后进入不再提示/);assert.match(s,/labSession\('notice', \{ suppressed \}\)/);assert.match(s,/仅本次进入/);
 const p=read('host/modules/LatencyLab.psm1');assert.match(p,/notice-preference.json/);assert.match(p,/Flush\(\$true\)/);
});
test('sidebar flyouts have delayed hover, keyboard/click alternatives and stable overlay',()=>{
 const s=read('src/components/SidebarFlyout.tsx');for(const t of ['setTimeout(show,200)','pointerType===\'mouse\'','aria-expanded','ArrowRight','Escape','createPortal','180','onPointerLeave'])assert.ok(s.includes(t),t);
 assert.match(read('src/components/lab-experience.css'),/\.sidebar-flyout \{ position:fixed/);
 assert.match(read('src/components/SystemExtensions.tsx'),/sectionRequest/);
});

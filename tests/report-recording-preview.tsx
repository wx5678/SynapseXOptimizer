import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PerformanceReportsPanel } from '../src/components/PerformanceReports';
import { WorkspaceNavigationLayout } from '../src/components/WorkspaceNavigation';
import { createSessionRecorder } from '../src/lib/session-recorder';
import { setRecorderStatus } from '../src/lib/recorder-status';
import { hostApi, type PerformanceReport } from '../src/lib/api';
import '../src/index.css';
import '../src/workspace.css';
import '../src/skins.css';
import '../src/graphite.css';
import '../src/readability.css';
import '../src/detail-polish.css';

const light = new URLSearchParams(location.search).get('skin') === 'light';
document.documentElement.dataset.skin = light ? 'light' : 'dark';
let clock = Date.now(), running = true, failure = false;
let listFailure = new URLSearchParams(location.search).has('hostFailure');
const reports = new Map<string, PerformanceReport>();
const journal = new Map();
const target = { processId: 42, processName: 'fxgame.exe', title: '隔离测试 · 九阴真经', path: 'C:/fixture/fxgame.exe' };
hostApi.performanceReports = async () => { if (listFailure) throw Error('本地服务连接中断，请稍后刷新；若持续异常，请重新启动软件。'); return [...reports.values()]; };
const recorder = createSessionRecorder({
  now: () => clock,
  targets: async () => ({ candidates: running ? [target] : [], detected: running ? target : null }) as any,
  sample: async () => ({ game: running ? { id: 42, cpuPercent: 20, memoryMB: 1300 } : null, cpu: { totalPercent: 28 }, gpu: null, memory: { usedPercent: 45 }, latency: { reachable: true, milliseconds: 12 }, network: { downloadMbps: 0.2, uploadMbps: 0.1 } }) as any,
  fps: async () => ({ running: true, targetProcessId: 42, fps: 144 + Math.sin(clock / 10000) * 6, onePercentLow: 110, frameTimeMs: 6.94 }) as any,
  save: async report => { if (failure) throw Error('隔离测试：模拟保存失败'); const result = { ...report, schemaVersion: 1, createdAt: new Date(clock).toISOString(), source: 'automatic-session-recorder' } as const; reports.set(report.id, result); journal.delete(report.id); return result; },
  checkpoint: async report => { journal.set(report.id, report); },
  recover: async () => [],
  preferences: () => ({ enabled: localStorage.getItem('synapsex.reports.auto') !== '0', mode: 'auto', manualProcess: '' }),
  status: setRecorderStatus,
  saved: report => window.dispatchEvent(new CustomEvent('synapsex:performance-report-saved', { detail: report })),
});
function Fixture() {
  const [busy, setBusy] = useState(false);
  async function advance(kind: string) {
    setBusy(true);
    if (kind === 'fail') failure = true;
    if (kind === 'recover') failure = false;
    if (kind === 'exit') running = false;
    for (let i = 0; i < 6; i++) { clock += 3000; await recorder.tick(); }
    setBusy(false);
  }
  return <div className="desktop-workspace"><main className="workspace-main" style={{ padding: '48px 32px' }}>
    <WorkspaceNavigationLayout context={<div className="workspace-context">隔离测试 · 模拟数据，不读取游戏、不修改系统</div>}>
      <div className="mb-4 flex gap-3">{[['sample','模拟游戏运行18秒'],['fail','模拟保存失败'],['recover','恢复保存'],['exit','模拟游戏退出']].map(([key,label])=><button className="prism-button-secondary p-3" disabled={busy} key={key} onClick={()=>void advance(key)}>{label}</button>)}</div>
      <button className="prism-button-secondary p-3" onClick={()=>{listFailure=false;}}>恢复报告读取（不手动刷新）</button>
      <PerformanceReportsPanel />
    </WorkspaceNavigationLayout>
  </main></div>;
}
void recorder.tick().then(() => createRoot(document.getElementById('root')!).render(<Fixture/>));

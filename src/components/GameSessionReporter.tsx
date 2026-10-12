import { useEffect, useRef, useState } from 'react';
import { FileBarChart, X } from 'lucide-react';
import { hostApi, type PerformanceReportDraft } from '../lib/api';
import { createSessionRecorder } from '../lib/session-recorder';
import { noFpsState } from '../lib/session-report';
import { setRecorderStatus } from '../lib/recorder-status';

export function GameSessionReporter() {
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const recorder = useRef<ReturnType<typeof createSessionRecorder> | null>(null);
  useEffect(() => {
    // Keep the same recorder across StrictMode's effect setup/cleanup cycle.
    const native = window.synapsexDesktop;
    const cacheKey = 'synapsex.report-outbox.v1';
    const readBrowserCache = (): PerformanceReportDraft[] => JSON.parse(localStorage.getItem(cacheKey) || '[]');
    recorder.current ??= createSessionRecorder({
      targets: hostApi.monitorTargets,
      sample: hostApi.monitorSample,
      fps: () => native?.fpsState() ?? Promise.resolve(noFpsState),
      recover: () => native?.pendingReports?.() ?? Promise.resolve(readBrowserCache()),
      checkpoint: async report => {
        if (native?.checkpointReport) return native.checkpointReport(report);
        const reports = readBrowserCache().filter(item => item.id !== report.id);
        localStorage.setItem(cacheKey, JSON.stringify([...reports, report]));
      },
      save: async report => {
        const saved = await hostApi.savePerformanceReport(report);
        if (!native?.checkpointReport) localStorage.setItem(cacheKey, JSON.stringify(readBrowserCache().filter(item => item.id !== report.id)));
        return saved;
      },
      preferences: () => ({ enabled: localStorage.getItem('synapsex.reports.auto') !== '0', mode: localStorage.getItem('synapsex.monitor.mode') === 'manual' ? 'manual' : 'auto', manualProcess: localStorage.getItem('synapsex.monitor.manualProcess') || '' }),
      status: setRecorderStatus,
      saved: report => {
        window.dispatchEvent(new CustomEvent('synapsex:performance-report-saved', { detail: report }));
        if (report.status === 'completed') {
          setToast(`${report.game.title || report.game.processName} 的性能报告已保存`);
          clearTimeout(toastTimer.current);
          toastTimer.current = setTimeout(() => setToast(''), 8000);
        }
      },
    });
    const tick = () => { void recorder.current?.tick(); };
    tick();
    const timer = window.setInterval(tick, 3000);
    const unsubscribeShutdown = native?.onReportShutdown?.(async () => { await recorder.current?.stop(); });
    window.addEventListener('synapsex:report-preferences', tick);
    return () => { window.clearInterval(timer); clearTimeout(toastTimer.current); unsubscribeShutdown?.(); window.removeEventListener('synapsex:report-preferences', tick); };
  }, []);
  if (!toast) return null;
  return <div className="report-toast fixed bottom-5 right-5 z-[130] flex max-w-sm items-start gap-3 rounded-2xl border p-4 shadow-2xl" role="status"><FileBarChart size={19}/><span>{toast}</span><button aria-label="关闭提示" onClick={() => setToast('')}><X size={15}/></button></div>;
}

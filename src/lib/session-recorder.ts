import type { MonitorTarget, MonitorTargets, RealtimeTelemetry, PerformanceReportDraft, PerformanceReport } from './api';
import { appendSample, buildReport, createValues, noFpsState, type SessionAccumulator } from './session-report';
import { userError } from './userError';
import { selectAutoGame } from './monitorTarget';

export type RecorderStatus = { phase: 'waiting' | 'recording' | 'disabled'; id: string; title: string; samples: number; seconds: number; savedAt: number; pending: number; error: string };
export const initialRecorderStatus: RecorderStatus = { phase: 'waiting', id: '', title: '', samples: 0, seconds: 0, savedAt: 0, pending: 0, error: '' };
type Dependencies = {
  targets: () => Promise<MonitorTargets>;
  sample: (name: string, id: number) => Promise<RealtimeTelemetry>;
  fps: () => Promise<FpsCollectorState>;
  save: (report: PerformanceReportDraft) => Promise<PerformanceReport>;
  checkpoint: (report: PerformanceReportDraft) => Promise<void>;
  recover: () => Promise<PerformanceReportDraft[]>;
  preferences: () => { enabled: boolean; mode: 'auto' | 'manual'; manualProcess: string };
  status: (state: RecorderStatus) => void;
  saved: (report: PerformanceReport) => void;
  now?: () => number;
  id?: () => string;
};
const errorText = userError;
export function createSessionRecorder(deps: Dependencies) {
  const now = deps.now ?? Date.now;
  const id = deps.id ?? (() => `session-${new Date(now()).toISOString().replace(/[-:]/g, '').slice(0, 15).replace('T', '-')}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`);
  let active: (SessionAccumulator & { id: string }) | null = null;
  let busy = false, initialized = false, lastCheckpoint = 0, lastFlush = 0, savedAt = 0, stopping = false;
  let onIdle: (() => void) | undefined;
  let sampleError = '', saveError = '';
  const pending = new Map<string, PerformanceReportDraft>();
  const publish = () => deps.status({ phase: active ? 'recording' : deps.preferences().enabled ? 'waiting' : 'disabled', id: active?.id ?? '', title: active?.target.title || active?.target.processName || '', samples: active?.telemetrySamples ?? 0, seconds: active ? Math.round((active.lastSeenAt - active.startedAt) / 1000) : 0, savedAt, pending: pending.size, error: [sampleError, saveError].filter(Boolean).join('；') });
  async function checkpoint(status: PerformanceReportDraft['status'] = 'recording') {
    if (!active) return;
    const report = { ...buildReport(active), id: active.id, status };
    if (report.game.durationSeconds < 15 || report.samples.telemetry < 3) return;
    pending.set(report.id, report);
    // Write a stable native journal before discarding/changing any session state.
    await deps.checkpoint(report);
    lastCheckpoint = now();
  }
  async function finish(status: PerformanceReportDraft['status']) {
    await checkpoint(status);
    active = null;
  }
  async function flush(force = false) {
    if (!force && now() - lastFlush < 15000) return;
    lastFlush = now();
    for (const [key, report] of pending) {
      try {
        await deps.checkpoint(report);
        const saved = await deps.save(report);
        pending.delete(key);
        savedAt = now();
        deps.saved(saved);
        saveError = '';
      } catch (error) { saveError = `报告保存失败，将自动重试：${errorText(error)}`; break; }
    }
  }
  async function tick() {
    if (busy || stopping) return;
    busy = true;
    try {
      if (!initialized) {
        for (const report of await deps.recover()) pending.set(report.id, { ...report, status: report.status === 'completed' ? 'completed' : 'interrupted' });
        initialized = true;
        await flush(true);
      }
      const prefs = deps.preferences();
      if (!prefs.enabled) {
        if (active) await finish('interrupted');
      } else if (active) {
        const telemetry = await deps.sample(active.target.processName, active.target.processId);
        sampleError = '';
        if (telemetry.game?.id === active.target.processId) {
          let fps = noFpsState;
          // FPS availability must never gate CPU/GPU/session reporting.
          try { fps = await deps.fps(); } catch { sampleError = 'FPS 采集不可用，仍在记录硬件与网络数据'; }
          if (!fps?.running || fps.targetProcessId !== active.target.processId) fps = noFpsState;
          appendSample(active, telemetry, fps, now());
          if (now() - lastCheckpoint >= 15000) await checkpoint();
        } else if (++active.missed >= 3) {
          await finish('completed');
          await flush(true);
        }
      } else {
        const targets = await deps.targets();
        const eligible = (target: MonitorTarget | null) => target && target.processId > 4 && !/^(system|idle|dwm|explorer)\.exe$/i.test(target.processName) ? target : null;
        const target = prefs.mode === 'manual' ? eligible(targets.candidates.find(x => x.processName.toLowerCase() === prefs.manualProcess.toLowerCase()) ?? null) : selectAutoGame(targets);
        sampleError = '';
        if (target) {
          active = { id: id(), target, bindingMode: prefs.mode, startedAt: now(), lastSeenAt: now(), missed: 0, telemetrySamples: 0, unreachableLatency: 0, fpsSource: '', latencyTarget: '', latencyKind: '', adapter: '', gpuName: '', ownsFpsCollector: false, lastTimelineAt: 0, lastNetworkCaptureAt: 0, timeline: [], values: createValues() };
          lastCheckpoint = now();
        }
      }
    } catch (error) {
      // A timeout is not proof of process exit. Keep the accumulator for recovery.
      sampleError = `记录暂时异常：${errorText(error)}`;
    } finally {
      await flush();
      publish();
      busy = false;
      onIdle?.();
      onIdle = undefined;
    }
  }
  async function stop() {
    stopping = true;
    if (busy) await new Promise<void>(resolve => { onIdle = resolve; });
    try { await finish('interrupted'); await flush(true); }
    finally { publish(); }
  }
  return { tick, checkpoint, publish, stop };
}

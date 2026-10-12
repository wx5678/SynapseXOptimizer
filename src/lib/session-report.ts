import type { MonitorTarget, PerformanceReport, PerformanceReportStats, RealtimeTelemetry } from "./api";
type NumericKey = "fps" | "low" | "frameTime" | "systemCpu" | "gameCpu" | "gpu" | "gpuTemperature" | "gpuPower" | "gpuMemory" | "systemMemory" | "gameMemory" | "latency" | "download" | "upload";
export type SessionAccumulator = {
  target: MonitorTarget;
  bindingMode: "auto" | "manual";
  startedAt: number;
  lastSeenAt: number;
  missed: number;
  telemetrySamples: number;
  unreachableLatency: number;
  fpsSource: string;
  latencyTarget: string;
  latencyKind: string;
  adapter: string;
  gpuName: string;
  ownsFpsCollector: boolean;
  lastTimelineAt: number;
  lastNetworkCaptureAt: number;
  timeline: PerformanceReport["timeline"];
  values: Record<NumericKey, number[]>;
};

const numericKeys: NumericKey[] = ["fps", "low", "frameTime", "systemCpu", "gameCpu", "gpu", "gpuTemperature", "gpuPower", "gpuMemory", "systemMemory", "gameMemory", "latency", "download", "upload"];
export const noFpsState: FpsCollectorState = { available: false, running: false, source: "", targetProcessName: "", targetDisplayName: "", targetMode: "", fps: null, frameTimeMs: null, onePercentLow: null, sampleCount: 0, status: "stopped", error: "" };

export function createValues(): Record<NumericKey, number[]> {
  return numericKeys.reduce((result, key) => { result[key] = []; return result; }, {} as Record<NumericKey, number[]>);
}

function add(values: number[], value: number | null | undefined) {
  if (value !== null && value !== undefined && Number.isFinite(value)) values.push(value);
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function stats(values: number[]): PerformanceReportStats {
  if (!values.length) return { average: null, minimum: null, maximum: null, p95: null };
  const ordered = [...values].sort((a, b) => a - b);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { average: round(average), minimum: round(ordered[0]), maximum: round(ordered[ordered.length - 1]), p95: round(ordered[Math.floor((ordered.length - 1) * 0.95)]) };
}

function jitter(values: number[]) {
  if (values.length < 2) return null;
  let total = 0;
  for (let index = 1; index < values.length; index += 1) total += Math.abs(values[index] - values[index - 1]);
  return round(total / (values.length - 1));
}

function observations(session: SessionAccumulator) {
  const result: PerformanceReport["observations"] = [];
  const fpsAverage = stats(session.values.fps).average;
  const lowAverage = stats(session.values.low).average;
  const gpuAverage = stats(session.values.gpu).average;
  const cpuPeak = stats(session.values.systemCpu).maximum;
  const memoryPeak = stats(session.values.systemMemory).maximum;
  const latencyStats = stats(session.values.latency);
  const latencyJitter = jitter(session.values.latency);

  if (fpsAverage !== null && lowAverage !== null) {
    const ratio = fpsAverage > 0 ? lowAverage / fpsAverage : 1;
    result.push(ratio < 0.65
      ? { level: "warn", title: "帧率波动明显", detail: `会话平均 FPS 为 ${fpsAverage}，采样 1% Low 为 ${lowAverage}，两者比例 ${Math.round(ratio * 100)}%。` }
      : { level: "good", title: "帧率稳定性正常", detail: `采样 1% Low 达到平均 FPS 的 ${Math.round(ratio * 100)}%。` });
  } else {
    result.push({ level: "info", title: "没有完整帧时间数据", detail: "本次会话未获得足够的 PresentMon 帧样本，CPU、GPU 和网络部分仍可查看。" });
  }
  if (gpuAverage !== null) result.push(gpuAverage >= 90
    ? { level: "warn", title: "GPU 持续高负载", detail: `GPU 平均占用 ${gpuAverage}%，已经达到报告的高负载阈值（90%）。` }
    : { level: "info", title: "未观察到持续显卡满载", detail: `GPU 平均占用 ${gpuAverage}%，低于报告的持续高负载阈值（90%）。` });
  if (latencyStats.average !== null) result.push((latencyJitter ?? 0) >= 10
    ? { level: "warn", title: "网络延迟波动偏高", detail: `平均延迟 ${latencyStats.average} ms，平均相邻样本波动 ${latencyJitter} ms。` }
    : { level: "good", title: "网络样本较稳定", detail: `平均延迟 ${latencyStats.average} ms，平均相邻样本波动 ${latencyJitter ?? 0} ms。` });
  if ((cpuPeak ?? 0) >= 90) result.push({ level: "warn", title: "出现整机 CPU 高占用", detail: `系统 CPU 峰值达到 ${cpuPeak}%，可能与游戏之外的后台负载同时发生。` });
  if ((memoryPeak ?? 0) >= 90) result.push({ level: "warn", title: "系统内存余量较低", detail: `系统内存使用峰值达到 ${memoryPeak}%。` });
  return result;
}

export function buildReport(session: SessionAccumulator): Omit<PerformanceReport, "schemaVersion" | "id" | "createdAt" | "source"> {
  const endedAt = session.lastSeenAt || Date.now();
  const fpsCount = session.values.fps.length;
  return {
    game: { processName: session.target.processName, title: session.target.title, processId: session.target.processId, path: session.target.path, bindingMode: session.bindingMode, startedAt: new Date(session.startedAt).toISOString(), endedAt: new Date(endedAt).toISOString(), durationSeconds: Math.max(0, Math.round((endedAt - session.startedAt) / 1000)) },
    samples: { telemetry: session.telemetrySamples, fps: fpsCount, latency: session.values.latency.length, unreachableLatency: session.unreachableLatency },
    fps: fpsCount ? { average: stats(session.values.fps).average, minimum: stats(session.values.fps).minimum, maximum: stats(session.values.fps).maximum, onePercentLowAverage: stats(session.values.low).average, frameTimeAverageMs: stats(session.values.frameTime).average, frameTimeP95Ms: stats(session.values.frameTime).p95, source: session.fpsSource || "PresentMon 1.10.0（ETW，无注入）" } : null,
    cpu: { system: stats(session.values.systemCpu), game: stats(session.values.gameCpu) },
    gpu: session.values.gpu.length ? { name: session.gpuName, utilization: stats(session.values.gpu), temperature: stats(session.values.gpuTemperature), power: stats(session.values.gpuPower), memoryPeakMB: stats(session.values.gpuMemory).maximum } : null,
    memory: { systemUsedPercent: stats(session.values.systemMemory), gameMB: stats(session.values.gameMemory) },
    latency: { target: session.latencyTarget, kind: session.latencyKind, milliseconds: stats(session.values.latency), jitterMs: jitter(session.values.latency), unreachableSamples: session.unreachableLatency },
    network: { adapter: session.adapter, downloadMbps: stats(session.values.download), uploadMbps: stats(session.values.upload) },
    timeline: session.timeline.map(point => ({ ...point })),
    observations: observations(session),
  };
}

export function appendSample(session: SessionAccumulator, telemetry: RealtimeTelemetry, fps: FpsCollectorState, sampledAt = Date.now()) {
  session.telemetrySamples += 1;
  session.lastSeenAt = sampledAt;
  session.missed = 0;
  session.fpsSource = fps.source || session.fpsSource;
  session.latencyTarget = telemetry.latency.target || session.latencyTarget;
  session.latencyKind = telemetry.latency.kind || session.latencyKind;
  session.adapter = telemetry.network.adapter || session.adapter;
  session.gpuName = telemetry.gpu?.name || session.gpuName;
  if (telemetry.game?.title) session.target.title = telemetry.game.title;
  add(session.values.fps, fps.fps);
  add(session.values.low, fps.onePercentLow);
  add(session.values.frameTime, fps.frameTimeMs);
  add(session.values.systemCpu, telemetry.cpu.totalPercent);
  add(session.values.gameCpu, telemetry.game?.cpuPercent);
  add(session.values.gpu, telemetry.gpu?.utilizationPercent);
  add(session.values.gpuTemperature, telemetry.gpu?.temperatureC);
  add(session.values.gpuPower, telemetry.gpu?.powerWatts);
  add(session.values.gpuMemory, telemetry.gpu?.memoryUsedMB);
  add(session.values.systemMemory, telemetry.memory.usedPercent);
  add(session.values.gameMemory, telemetry.game?.memoryMB);
  if (telemetry.latency.reachable) add(session.values.latency, telemetry.latency.milliseconds); else session.unreachableLatency += 1;
  add(session.values.download, telemetry.network.downloadMbps);
  add(session.values.upload, telemetry.network.uploadMbps);
  const now = sampledAt;
  if (!session.lastTimelineAt || now - session.lastTimelineAt >= 5000) {
    session.timeline.push({ elapsedSeconds: Math.round((now - session.startedAt) / 1000), fps: fps.fps, onePercentLow: fps.onePercentLow, cpu: telemetry.game?.cpuPercent ?? null, gpu: telemetry.gpu?.utilizationPercent ?? null, latency: telemetry.latency.reachable ? telemetry.latency.milliseconds : null });
    session.lastTimelineAt = now;
    if (session.timeline.length > 720) session.timeline = session.timeline.filter((_, index) => index % 2 === 0);
  }
}

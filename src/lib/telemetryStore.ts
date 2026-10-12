import { useSyncExternalStore } from "react";
import type { RealtimeTelemetry } from "./api";
import { isGameIdentity } from "./workbenchPolling";

export type WorkbenchSample = {
  at: number;
  processId: number;
  processName: string;
  title: string;
  fps: number | null;
  low: number | null;
  frameTime: number | null;
  cpu: number | null;
  gpu: number | null;
};
let samples: WorkbenchSample[] = [];
const listeners = new Set<() => void>();
export function clearWorkbenchSamples() {
  if (!samples.length) return;
  samples = [];
  listeners.forEach(listener => listener());
}
const normalize = (name: string) => name.toLowerCase().replace(/\.exe$/, "");
export function publishTelemetry(
  telemetry: RealtimeTelemetry,
  fps: FpsCollectorState,
) {
  if (
    !telemetry.game ||
    !isGameIdentity(telemetry.game.id, telemetry.game.name)
  )
    return;
  const game = telemetry.game;
  const matched =
    fps.running &&
    fps.status === "capturing" &&
    fps.targetProcessId === game.id &&
    normalize(fps.targetProcessName) === normalize(game.name);
  const at = Date.now();
  if (samples.length && samples[samples.length - 1].processId !== game.id)
    samples = [];
  // Reuse existing collectors. Coalesce simultaneous reporter/monitor refreshes.
  const validFps =
    matched && Number.isFinite(fps.fps) && fps.fps! > 0 ? fps.fps : null;
  const frameTime =
    matched && Number.isFinite(fps.frameTimeMs) && fps.frameTimeMs! > 0
      ? fps.frameTimeMs
      : validFps
        ? 1000 / validFps
        : null;
  const last = samples[samples.length - 1];
  if (last && at - last.at < 900) {
    if (frameTime === null) return;
    samples = samples.slice(0, -1);
  }
  samples = [
    ...samples.filter((s) => at - s.at <= 60000),
    {
      at,
      processId: game.id,
      processName: game.name,
      title: game.title,
      fps: validFps,
      low: matched ? fps.onePercentLow : null,
      frameTime,
      cpu: telemetry.cpu.totalPercent,
      gpu: telemetry.gpu?.utilizationPercent ?? null,
    },
  ];
  listeners.forEach((listener) => listener());
}
export const useWorkbenchSamples = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => samples,
  );

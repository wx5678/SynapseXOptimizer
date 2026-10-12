import type { MonitorTargets, RealtimeTelemetry } from "./api";
import { selectAutoGame } from './monitorTarget';

export const isGameIdentity = (id: number, name: string) =>
  id > 4 &&
  !/^(system|idle|registry|memory compression|secure system|svchost|csrss|lsass|services|smss|wininit|winlogon)(\.exe)?$/i.test(
    name,
  );
export const emptyWorkbenchFps = {
  running: false,
  status: "stopped",
  targetProcessId: 0,
  targetProcessName: "",
  fps: null,
  onePercentLow: null,
  frameTimeMs: null,
} as FpsCollectorState;

/** Read existing capture only. No collector ownership, start/stop or report writes. */
export function createWorkbenchPolling(deps: {
  fps: () => Promise<FpsCollectorState>;
  targets: () => Promise<MonitorTargets>;
  sample: (name: string, id: number) => Promise<RealtimeTelemetry>;
  selection: () => { mode: string; name: string };
  publish: (sample: RealtimeTelemetry, fps: FpsCollectorState) => void;
  clear?: () => void;
  now?: () => number;
}) {
  const now = deps.now ?? Date.now;
  let disposed = false,
    reading = false,
    sampling = false,
    sampledAt = 0,
    lastRequest = 0;
  let telemetry: RealtimeTelemetry | null = null,
    latest = emptyWorkbenchFps;
  let requestKey = "";
  const matches = (sample: RealtimeTelemetry, fps: FpsCollectorState) =>
    sample.game?.id === fps.targetProcessId &&
    sample.game?.name.toLowerCase().replace(/\.exe$/, "") ===
      fps.targetProcessName.toLowerCase().replace(/\.exe$/, "");
  const requestSample = async () => {
    if (disposed || sampling || now() - lastRequest < 3000) return;
    sampling = true;
    lastRequest = now();
    const preference = deps.selection();
    try {
      let name = "",
        id = 0;
      if (preference.mode === "manual" && preference.name)
        name = preference.name;
      else {
        const targets = await deps.targets();
        if (disposed) return;
        const target = selectAutoGame(targets, latest.running ? latest.targetProcessId : 0);
        if (target && isGameIdentity(target.processId, target.processName)) {
          name = target.processName;
          id = target.processId;
        }
      }
      if (!name) {
        telemetry = null;
        deps.clear?.();
        return;
      }
      const key = `${id}:${name.toLowerCase()}`;
      const capturedId = latest.running ? latest.targetProcessId : 0;
      requestKey = key;
      const result = await deps.sample(name, id);
      if (disposed || requestKey !== key) return;
      if (
        !result.game ||
        !isGameIdentity(result.game.id, result.game.name) ||
        (id > 0 && result.game.id !== id) ||
        result.game.name.toLowerCase().replace(/\.exe$/, "") !==
          name.toLowerCase().replace(/\.exe$/, "")
      ) {
        telemetry = null;
        return;
      }
      // A collector/selection change while WMI was pending must not repaint the old game.
      if (id === capturedId && latest.running && !matches(result, latest)) return;
      const current = deps.selection();
      if (current.mode !== preference.mode || current.name !== preference.name)
        return;
      telemetry = result;
      sampledAt = now();
      deps.publish(result, latest);
    } catch {
      /* Keep only the last short-lived sample; never fabricate a replacement. */
    } finally {
      sampling = false;
    }
  };
  return {
    async tick() {
      if (disposed || reading) return;
      reading = true;
      try {
        const fps = await deps.fps();
        if (disposed) return;
        latest = fps;
        if (
          telemetry &&
          now() - sampledAt < 10000 &&
          (!fps.running || matches(telemetry, fps))
        )
          deps.publish(telemetry, fps);
      } catch {
        latest = emptyWorkbenchFps;
      } finally {
        reading = false;
      }
      if (!disposed) void requestSample();
    },
    dispose() {
      disposed = true;
      telemetry = null;
      requestKey = "";
    },
  };
}

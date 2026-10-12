import { useEffect } from "react";
import { hostApi } from "./api";
import { publishTelemetry, clearWorkbenchSamples } from "./telemetryStore";
import { createWorkbenchPolling, emptyWorkbenchFps } from "./workbenchPolling";

export function useWorkbenchPolling(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const polling = createWorkbenchPolling({
      fps: () =>
        window.synapsexDesktop?.fpsState() ??
        Promise.resolve(emptyWorkbenchFps),
      targets: () => hostApi.monitorTargets(),
      sample: (name, id) => hostApi.monitorSample(name, id),
      selection: () => ({
        mode: localStorage.getItem("synapsex.monitor.mode") ?? "auto",
        name: localStorage.getItem("synapsex.monitor.manualProcess") ?? "",
      }),
      publish: publishTelemetry,
      clear: clearWorkbenchSamples,
    });
    const tick = () => {
      if (!document.hidden) void polling.tick();
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => {
      polling.dispose();
      window.clearInterval(timer);
    };
  }, [enabled]);
}

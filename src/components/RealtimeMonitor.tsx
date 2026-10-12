import { WorkspaceNavigation } from './WorkspaceNavigation';
import { selectAutoGame } from '../lib/monitorTarget';
import { Gauge, MonitorUp, Move, RefreshCw, X, Zap } from "lucide-react";
import { userError } from '../lib/userError';
import './monitor-controls.css';
import { useEffect, useMemo, useRef, useState } from "react";
import { hostApi, type MonitorTarget, type MonitorTargets, type RealtimeTelemetry } from "../lib/api";

type MonitorPoint = { time: number; fps: number | null; cpu: number | null; gpu: number | null };

type OverlayMetricId = "fps" | "low" | "latency" | "cpu" | "gpu" | "network" | "cpuTemp" | "gpuTemp" | "frameTime" | "memory" | "gameMemory" | "gpuPower" | "gpuClock" | "vram" | "download" | "upload";
type OverlayPreferences = {
  layout: "horizontal" | "grid";
  background: "transparent" | "glass";
  scale: "small" | "medium" | "large";
  labels: boolean;
  metrics: OverlayMetricId[];
};

const overlayStorageKey = "synapsex.monitor.overlay";
const overlayMetricOptions: { id: OverlayMetricId; label: string }[] = [
  { id: "fps", label: "FPS" },
  { id: "low", label: "1% Low" },
  { id: "latency", label: "探测延迟" },
  { id: "cpu", label: "CPU" },
  { id: "gpu", label: "GPU / 显存" },
  { id: "network", label: "实时网速" },
  { id: "cpuTemp", label: "CPU 温度" },
  { id: "gpuTemp", label: "GPU 温度" },
  { id: "frameTime", label: "帧时间" },
  { id: "memory", label: "系统内存" },
  { id: "gameMemory", label: "游戏内存" },
  { id: "gpuPower", label: "GPU 功耗" },
  { id: "gpuClock", label: "GPU 频率" },
  { id: "vram", label: "显存用量" },
  { id: "download", label: "下载速度" },
  { id: "upload", label: "上传速度" },
];
const defaultOverlayPreferences: OverlayPreferences = {
  layout: "horizontal",
  background: "transparent",
  scale: "medium",
  labels: true,
  metrics: ["fps", "low", "latency", "cpu", "gpu", "network"],
};

function readOverlayPreferences(): OverlayPreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(overlayStorageKey) || "null") as Partial<OverlayPreferences> | null;
    const metrics = stored?.metrics?.filter((item): item is OverlayMetricId => overlayMetricOptions.some((option) => option.id === item));
    return {
      layout: stored?.layout === "grid" ? "grid" : "horizontal",
      background: stored?.background === "glass" ? "glass" : "transparent",
      scale: stored?.scale === "small" || stored?.scale === "large" ? stored.scale : "medium",
      labels: stored?.labels !== false,
      metrics: metrics?.length ? metrics : defaultOverlayPreferences.metrics,
    };
  } catch {
    return defaultOverlayPreferences;
  }
}

const emptyFps: FpsCollectorState = {
  available: false,
  running: false,
  source: "PresentMon 2.4.1（ETW，精简帧采集）",
  targetProcessName: "",
  targetDisplayName: "",
  targetMode: "",
  fps: null,
  frameTimeMs: null,
  onePercentLow: null,
  sampleCount: 0,
  status: "stopped",
  error: "",
};

import { publishTelemetry } from "../lib/telemetryStore";

function useRealtimeSamples(targetProcessName = "", targetProcessId = 0, followControls = false) {
  const [telemetry, setTelemetry] = useState<RealtimeTelemetry | null>(null);
  const [fps, setFps] = useState<FpsCollectorState>(emptyFps);
  const [history, setHistory] = useState<MonitorPoint[]>([]);
  const [error, setError] = useState("");
  const latestFps = useRef(fps);
  latestFps.current = fps;

  // FPS IPC must keep updating even when a slow WMI/network request blocks telemetry.
  useEffect(() => {
    let disposed = false; let busy = false;
    const sample = async () => {
      if (busy) return; busy = true;
      try {
        const next = await (window.synapsexDesktop?.fpsState() ?? Promise.resolve(emptyFps));
        if (!disposed) { latestFps.current = next; setFps(next); }
      } catch (reason) {
        if (!disposed) setFps(current => ({ ...current, status: "read-error", error: String(reason) }));
      } finally { busy = false; }
    };
    void sample(); const timer = window.setInterval(sample, 1000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let disposed = false; let busy = false;
    const sample = async () => {
      if (busy) return; busy = true;
      try {
        const captured = latestFps.current;
        let name=targetProcessName, id=targetProcessId;
        if (followControls) {
          const controls=await window.synapsexDesktop?.monitorControls();
          const targets=await hostApi.monitorTargets();
          const target=controls?.mode==='manual'
            ? targets.candidates.find(item=>item.processName.toLowerCase()===controls.manualProcess.toLowerCase())
            : selectAutoGame(targets,captured.targetProcessId);
          name=target?.processName??'';id=target?.processId??0;
          if (!target) {if(!disposed)setTelemetry(null);return;}
        }
        const nextTelemetry = await hostApi.monitorSample(name, id);
        if (disposed) return;
        const nextFps = latestFps.current;
        setTelemetry(nextTelemetry); publishTelemetry(nextTelemetry, nextFps);
        setHistory(current => [...current.slice(-44), { time: Date.now(), fps: nextFps.targetProcessId === nextTelemetry.game?.id ? nextFps.fps : null, cpu: nextTelemetry.cpu.totalPercent, gpu: nextTelemetry.gpu?.utilizationPercent ?? null }]);
        setError("");
      } catch (reason) {
        if (!disposed) setError(reason instanceof Error && reason.name === "TimeoutError" ? "系统监测响应超时；帧率采集独立运行，不受此请求影响。" : String(reason));
      } finally { busy = false; }
    };
    void sample(); const timer = window.setInterval(sample, 2000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [targetProcessName, targetProcessId, followControls]);

  return { telemetry, fps, history, error, setFps };
}

function value(value: number | null | undefined, suffix = "%", digits = 0) {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : `${value.toFixed(digits)}${suffix}`;
}

function latencyName(kind: RealtimeTelemetry["latency"]["kind"]) {
  if (kind === "game-connection") return "游戏连接延迟";
  if (kind === "default-gateway") return "本地网关延迟";
  return "公网探测延迟";
}

function statusText(status: string, target = "") {
  const labels: Record<string, string> = {
    capturing: "正在采集真实帧时间",
    "waiting-game": "等待目标游戏产生画面",
    "waiting-target": `等待 ${target || "目标进程"} 产生画面`,
    "target-missing": "尚未识别或绑定游戏进程",
    "no-recent-frames": "游戏未出帧或已最小化",
    stopped: "帧率采集尚未开启",
    "collector-missing": "PresentMon 采集器缺失",
    "unsupported-output": "采集输出格式不兼容",
    "read-error": "读取帧数据失败",
    "no-frame-data": "未收到目标进程的帧事件",
    "permission-denied": "帧率采集权限不足，请完全退出软件后以管理员身份运行",
    "collector-error": "帧率采集已中断，请查看错误详情后重试",
  };
  return labels[status] ?? status;
}

function MetricCard({ label, reading, detail, tone = "white" }: { label: string; reading: string; detail: string; tone?: "white" | "green" | "sky" }) {
  const color = tone === "green" ? "text-emerald-300" : tone === "sky" ? "text-sky-300" : "text-white";
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
      <p className="text-[12px] text-slate-500">{label}</p>
      <strong className={`mt-3 block text-[30px] font-light tracking-[-0.04em] ${color}`}>{reading}</strong>
      <p className="mt-2 min-h-9 text-[11px] leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

function MiniChart({ points }: { points: MonitorPoint[] }) {
  const values = points.map((point) => point.fps ?? 0);
  const maximum = Math.max(60, ...values);
  const path = values.map((item, index) => {
    const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 100;
    const y = 36 - Math.min(36, (item / maximum) * 34);
    return `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="monitor-fps-chart h-28 w-full overflow-visible">
      <defs><linearGradient id="fps-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7dd3fc" stopOpacity=".32" /><stop offset="1" stopColor="#7dd3fc" stopOpacity="0" /></linearGradient></defs>
      <path className="monitor-chart-grid" d="M0,36 L100,36" stroke="rgba(255,255,255,.09)" strokeWidth=".5" />
      {path && <><path d={`${path} L100,36 L0,36 Z`} fill="url(#fps-fill)" /><path className="monitor-chart-line" d={path} fill="none" stroke="#7dd3fc" strokeWidth="1.2" vectorEffect="non-scaling-stroke" /></>}
    </svg>
  );
}

function MonitorSwitch({label,detail,checked,disabled,onChange}:{label:string;detail:string;checked:boolean;disabled:boolean;onChange:()=>void}) {
  return <button type="button" role="switch" aria-label={label} aria-checked={checked} disabled={disabled} className="monitor-control" onClick={onChange}><span><strong>{label}</strong><small>{detail}</small></span><span className="monitor-toggle" aria-hidden="true"><i/></span></button>;
}

export function RealtimeMonitorPanel() {
  const [targets, setTargets] = useState<MonitorTargets | null>(null);
  const [bindingMode, setBindingMode] = useState<"auto" | "manual">(() => localStorage.getItem("synapsex.monitor.mode") === "manual" ? "manual" : "auto");
  const [manualProcessName, setManualProcessName] = useState(() => localStorage.getItem("synapsex.monitor.manualProcess") ?? "");
  const [targetMessage, setTargetMessage] = useState("");
  const [sensorInstalling, setSensorInstalling] = useState(false);
  const [sensorInstallMessage, setSensorInstallMessage] = useState("");
  const sensorInstallBusy = useRef(false);
  const [scanning, setScanning] = useState(false);
  const scanBusy = useRef(false);
  const [scanMessage, setScanMessage] = useState("");
  const [controls, setControls] = useState<MonitorControls | null>(null);
  const [controlBusy, setControlBusy] = useState(false);
  const controlsBusyRef = useRef(false);
  const controlRevision = useRef(0);
  const [overlayPreferences, setOverlayPreferences] = useState<OverlayPreferences>(readOverlayPreferences);
  const desktop = window.synapsexDesktop;
  const installSensor = async () => {
    if (!desktop?.installSensorDriver || sensorInstallBusy.current) return;
    sensorInstallBusy.current = true; setSensorInstalling(true);
    setSensorInstallMessage('请确认安装提示；确认后将下载、校验并打开官方安装窗口。');
    try { const result = await desktop.installSensorDriver(); setSensorInstallMessage(result.message); }
    catch (reason) { setSensorInstallMessage(userError(reason)); }
    finally { sensorInstallBusy.current = false; setSensorInstalling(false); }
  };
  useEffect(() => {
    if(!desktop)return;
    let alive=true, reading=false, first=true;
    const read=async()=>{
      if(reading||controlsBusyRef.current)return;reading=true;const revision=controlRevision.current;
      try {const state=await desktop.monitorControls();if(alive&&!controlsBusyRef.current&&revision===controlRevision.current){setControls(state);if(first){setBindingMode(state.mode);setManualProcessName(state.manualProcess);first=false;}}}
      catch(reason){if(alive)setTargetMessage(userError(reason));}finally{reading=false;}
    };
    void read();const timer=window.setInterval(()=>void read(),1500);
    return()=>{alive=false;window.clearInterval(timer);};
  },[desktop]);
  const saveControls=async(patch:Parameters<NonNullable<typeof desktop>['saveMonitorControls']>[0])=>{
    if(!desktop||controlsBusyRef.current)return;
    controlsBusyRef.current=true;controlRevision.current++;setControlBusy(true);
    try{
      const state=await desktop.saveMonitorControls(patch);setControls(state);setBindingMode(state.mode);setManualProcessName(state.manualProcess);setTargetMessage('');
      if((patch.mode!==undefined||patch.manualProcess!==undefined)&&fps.running&&!state.autoCapture){
        const target=state.mode==='manual'?targets?.candidates.find(item=>item.processName.toLowerCase()===state.manualProcess.toLowerCase()):selectAutoGame(targets);
        if(target?.processId)setFps(await desktop.startFps({...target,displayName:target.title||target.processName,mode:state.mode,retry:true}));
        else setFps(await desktop.stopFps());
      }
    }
    catch(reason){setTargetMessage(userError(reason));}
    finally{controlsBusyRef.current=false;setControlBusy(false);}
  };

  const selectedTarget = useMemo<MonitorTarget | null>(() => {
    if (bindingMode === "auto") return selectAutoGame(targets);
    if (!manualProcessName) return null;
    return targets?.candidates.find((item) => item.processName.toLowerCase() === manualProcessName.toLowerCase()) ?? {
      processName: manualProcessName,
      processId: 0,
      title: "等待该程序再次启动",
      path: "",
      cpuPercent: 0,
      gpuPercent: 0,
      memoryMB: 0,
      foreground: false,
      autoEligible: false,
      score: 0,
    };
  }, [bindingMode, manualProcessName, targets]);
  const { telemetry, fps, history, error, setFps } = useRealtimeSamples(selectedTarget?.processName ?? "", selectedTarget?.processId ?? 0);

  const refreshTargets = async (force = false) => {
    if (scanBusy.current) return;
    scanBusy.current = true; setScanning(true);
    if (force) setScanMessage("正在重新读取运行中的进程……");
    try {
      const next = await hostApi.monitorTargets(force); setTargets(next);
      setScanMessage(`扫描完成 · ${new Date().toLocaleTimeString()} · ${next.candidates.length} 个候选进程。${force ? "扫描只刷新进程列表，不会重启 FPS 采集。" : ""}`);
    }
    catch (reason) { setScanMessage(reason instanceof Error && reason.name === "TimeoutError" ? "扫描超时：本地服务繁忙。现有绑定已保留，请稍后重试。" : `扫描失败：${String(reason)}`); }
    finally { scanBusy.current = false; setScanning(false); }
  };

  useEffect(() => {
    void refreshTargets();
    const timer = window.setInterval(() => void refreshTargets(), 3000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem("synapsex.monitor.mode", bindingMode);
    localStorage.setItem("synapsex.monitor.manualProcess", manualProcessName);
  }, [bindingMode, manualProcessName]);

  useEffect(() => {
    localStorage.setItem(overlayStorageKey, JSON.stringify(overlayPreferences));
    void desktop?.configureOverlay({ layout: overlayPreferences.layout, scale: overlayPreferences.scale, metricCount: overlayPreferences.metrics.length });
  }, [desktop, overlayPreferences]);

  const gameState = telemetry?.game
    ? `${telemetry.game.name} · PID ${telemetry.game.id}`
    : selectedTarget ? `等待 ${selectedTarget.processName} 启动` : "尚未识别游戏";

  const toggleCapture = async () => {
    if (!desktop || controlsBusyRef.current) return;
    controlsBusyRef.current=true;setControlBusy(true);
    try {
      if(fps.running)setFps(await desktop.stopFps());
      else if(!selectedTarget?.processId)setTargetMessage('请先启动游戏或手动绑定正在运行的程序。');
      else setFps(await desktop.startFps({processName:selectedTarget.processName,processId:selectedTarget.processId,displayName:selectedTarget.title||selectedTarget.processName,mode:bindingMode,retry:true}));
    }catch(reason){setTargetMessage(userError(reason));}finally{controlsBusyRef.current=false;setControlBusy(false);}
  };

  const updateOverlayPreference = <Key extends keyof OverlayPreferences>(key: Key, next: OverlayPreferences[Key]) => {
    setOverlayPreferences((current) => ({ ...current, [key]: next }));
  };

  const toggleOverlayMetric = (metric: OverlayMetricId) => {
    setOverlayPreferences((current) => {
      const enabled = current.metrics.includes(metric);
      if (enabled && current.metrics.length === 1) return current;
      return { ...current, metrics: enabled ? current.metrics.filter((item) => item !== metric) : [...current.metrics, metric] };
    });
  };

  return (
    <div>
      <WorkspaceNavigation><section className="workspace-page-header mb-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 flex items-center gap-3 text-[12px] uppercase tracking-[0.18em] text-slate-500"><MonitorUp size={18} />游戏实时监控</div>
          <h1 className="text-[clamp(34px,5vw,58px)] font-light leading-none tracking-[-0.045em]">实时监控</h1>
          <p className="mt-4 max-w-3xl text-[13px] leading-6 text-slate-400">自动识别当前游戏，也可手动绑定任意正在运行的程序。实时查看真实 FPS、1% Low、目标连接延迟、CPU、GPU、显存、内存和网卡速率。PresentMon 通过 Windows ETW 读取呈现事件，不注入目标进程。</p>
        </div>
        <span className={`rounded-full border px-4 py-2 text-[12px] ${telemetry?.game ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-white/[0.03] text-slate-400"}`}>{gameState}</span>
      </section></WorkspaceNavigation>

      <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
        <div className="grid gap-3 lg:grid-cols-[220px_1fr_auto] lg:items-end">
          <div>
            <p className="mb-2 text-[11px] text-slate-500">识别方式</p>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/30 p-1">
              {(["auto", "manual"] as const).map((mode) => <button key={mode} disabled={controlBusy} onClick={() => desktop?void saveControls({mode}):setBindingMode(mode)} className={`rounded-lg px-3 py-2 text-[12px] transition ${bindingMode === mode ? "bg-white font-semibold text-black" : "text-slate-400 hover:text-white"}`}>{mode === "auto" ? "自动识别" : "手动绑定"}</button>)}
            </div>
          </div>
          <label className="text-[11px] text-slate-500">
            {bindingMode === "auto" ? "当前自动目标" : "绑定进程（按进程名保存，重启游戏后仍有效）"}
            {bindingMode === "auto" ? (
              <div className="mt-2 flex h-[42px] items-center rounded-xl border border-white/10 bg-black/25 px-4 text-[12px] text-slate-200">
                {selectedTarget ? `${selectedTarget.processName} · ${selectedTarget.title || "无窗口标题"} · GPU ${selectedTarget.gpuPercent}%` : "未发现高置信游戏进程"}
              </div>
            ) : (
              <select value={manualProcessName} disabled={controlBusy} onChange={(event) => { if(desktop)void saveControls({manualProcess:event.target.value});else setManualProcessName(event.target.value); }} className="mt-2 h-[42px] w-full rounded-xl border border-white/10 bg-[#090b0f] px-3 text-[12px] text-white outline-none focus:border-white/25">
                <option value="">请选择正在运行的程序</option>
                {targets?.candidates.map((item) => <option key={`${item.processName}-${item.processId}`} value={item.processName}>{item.processName} · PID {item.processId} · {item.title || "后台图形进程"} · GPU {item.gpuPercent}%</option>)}
                {manualProcessName && !targets?.candidates.some((item) => item.processName.toLowerCase() === manualProcessName.toLowerCase()) && <option value={manualProcessName}>{manualProcessName} · 当前未运行（保留绑定）</option>}
              </select>
            )}
          </label>
          <button disabled={scanning} aria-busy={scanning} onClick={() => void refreshTargets(true)} className="flex h-[42px] items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-4 text-[12px] text-white hover:bg-white/[0.09] disabled:opacity-50"><RefreshCw size={14} className={scanning ? "animate-spin" : ""} />{scanning ? "正在扫描…" : "重新扫描"}</button>
        </div>
        <p className="mt-3 text-[11px] leading-5 text-slate-500">{targets?.note ?? "正在扫描游戏进程。"} 识别不正确时，请手动选择游戏。</p>
        <p role="status" className="mt-2 text-[12px] text-slate-400">{scanMessage}</p>
      </div>

      <div className="monitor-control-grid" aria-label="监控开关">
        <MonitorSwitch label="FPS 采集" detail={fps.running?'当前会话正在采集':'手动控制当前会话'} checked={fps.running} disabled={!desktop||controlBusy||(!fps.running&&!selectedTarget?.processId)} onChange={()=>void toggleCapture()}/>
        <MonitorSwitch label="游戏悬浮窗" detail={controls?.overlayEnabled?(controls.overlayVisible?'已显示 · 下次游戏仍自动显示':'已开启 · 等待游戏启动'):'关闭后不再自动显示'} checked={!!controls?.overlayEnabled} disabled={!controls||controlBusy} onChange={()=>void saveControls({overlayEnabled:!controls?.overlayEnabled})}/>
        <MonitorSwitch label="鼠标穿透" detail="开启后不拦截游戏鼠标操作" checked={!!controls?.clickThrough} disabled={!controls||controlBusy} onChange={()=>void saveControls({clickThrough:!controls?.clickThrough})}/>
        <MonitorSwitch label="进入游戏自动采集" detail="记住偏好 · 不依赖当前页面" checked={!!controls?.autoCapture} disabled={!controls||controlBusy} onChange={()=>void saveControls({autoCapture:!controls?.autoCapture})}/>
      </div>
      <p className="mb-5 text-[12px] leading-6 text-slate-400">悬浮窗、鼠标穿透与自动采集会长期保存。首次悬浮窗显示在屏幕顶部，拖动后自动记住上次位置；如需拖动，请先关闭鼠标穿透。软件运行期间，进入游戏自动显示，退出游戏自动收起；关闭软件会同时关闭悬浮窗，但保留开关偏好和位置。悬浮窗上的 × 会关闭此开关。手动停止 FPS 后，本次游戏不会自动重启采集。开机托盘签到模式不会启动监控，请先打开工作台。</p>
      {controls?.error&&<p role="status" className="mb-5 text-[12px] text-amber-300">{controls.error}</p>}

      <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div><strong className="text-[13px]">悬浮窗显示设置</strong><p className="mt-1 text-[11px] text-slate-500">默认采用横向单行和完全透明背景；修改后立即生效。</p></div>
          <span className="text-[11px] text-emerald-300">不会修改游戏画面或配置</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div><p className="mb-2 text-[11px] text-slate-500">排列方式</p><div className="grid grid-cols-2 gap-2">{([['horizontal', '横向单行'], ['grid', '紧凑宫格']] as const).map(([id, label]) => <button key={id} onClick={() => updateOverlayPreference("layout", id)} className={`rounded-xl border px-3 py-2 text-[12px] ${overlayPreferences.layout === id ? "border-sky-300/35 bg-sky-300/10 text-sky-100" : "border-white/10 text-slate-400"}`}>{label}</button>)}</div></div>
          <div><p className="mb-2 text-[11px] text-slate-500">背景</p><div className="grid grid-cols-2 gap-2">{([['transparent', '完全透明'], ['glass', '玻璃背景']] as const).map(([id, label]) => <button key={id} onClick={() => updateOverlayPreference("background", id)} className={`rounded-xl border px-3 py-2 text-[12px] ${overlayPreferences.background === id ? "border-sky-300/35 bg-sky-300/10 text-sky-100" : "border-white/10 text-slate-400"}`}>{label}</button>)}</div></div>
          <div><p className="mb-2 text-[11px] text-slate-500">文字大小</p><div className="grid grid-cols-3 gap-2">{([['small', '小'], ['medium', '中'], ['large', '大']] as const).map(([id, label]) => <button key={id} onClick={() => updateOverlayPreference("scale", id)} className={`rounded-xl border px-3 py-2 text-[12px] ${overlayPreferences.scale === id ? "border-sky-300/35 bg-sky-300/10 text-sky-100" : "border-white/10 text-slate-400"}`}>{label}</button>)}</div></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => updateOverlayPreference("labels", !overlayPreferences.labels)} className={`rounded-lg border px-3 py-2 text-[11px] ${overlayPreferences.labels ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100" : "border-white/10 text-slate-500"}`}>{overlayPreferences.labels ? "显示指标名称" : "隐藏指标名称"}</button>
          {overlayMetricOptions.map((item) => <button key={item.id} aria-pressed={overlayPreferences.metrics.includes(item.id)} onClick={() => toggleOverlayMetric(item.id)} className={`rounded-lg border px-3 py-2 text-[11px] ${overlayPreferences.metrics.includes(item.id) ? "border-white/20 bg-white/[0.07] text-white" : "border-white/8 text-slate-600"}`}>{overlayPreferences.metrics.includes(item.id) ? "显示" : "隐藏"} · {item.label}</button>)}
        </div>
        <p className="mt-3 text-[12px] leading-6 text-slate-400">可独立选择指标，多项自动换行。CPU 温度优先读取现有传感器服务，也可使用内置 LibreHardwareMonitor 组件（需要官方 PawnIO 驱动和管理员权限）；只有主动点击并确认后才安装，不会关闭安全保护。GPU 温度、功耗和频率依赖驱动支持；多显卡时当前数据来自首张 NVIDIA 显卡。独占全屏、系统安全桌面等场景不保证覆盖显示。</p>
        <p role="status" className="mt-3 text-[12px] leading-6 text-slate-300">CPU 温度：{telemetry?.cpu.temperatureC != null ? `${value(telemetry.cpu.temperatureC,'°C',1)} · ${telemetry.cpu.temperatureSource}` : telemetry?.cpu.temperatureMessage || '正在检查传感器组件…'}</p>
        {['driver-missing','driver-stopped'].includes(telemetry?.cpu.temperatureStatus || '')&&<div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className="workbench-primary" disabled={!desktop?.installSensorDriver || sensorInstalling} onClick={()=>void installSensor()}>{sensorInstalling ? '正在处理安装，请查看安装窗口…' : '下载安装 CPU 温度驱动'}</button>
          <button type="button" className="workbench-secondary" disabled={!desktop} onClick={()=>void desktop?.openSensorHelp().catch(reason=>setSensorInstallMessage(userError(reason)))}>官方说明</button>
        </div>}
        {sensorInstallMessage&&<p role="status" className="mt-3 text-[12px] leading-6 text-slate-400">{sensorInstallMessage}</p>}
      </div>

      <div className="mb-5 rounded-2xl border border-sky-400/15 bg-sky-400/[0.055] px-5 py-4 text-[12px] leading-6 text-slate-300">
        <strong className="text-sky-200">{statusText(fps.status, fps.targetProcessName || selectedTarget?.processName || "")}</strong> · {fps.source}。当前绑定：{selectedTarget?.processName ?? "无"}。网络数字是实际 ICMP 探测结果；目标服务器拒绝 Ping 时会显示“不可达”，不会用网关延迟冒充游戏延迟。
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="实时 FPS" reading={value(fps.fps, "", 1)} detail={`平均帧时间 ${value(fps.frameTimeMs, " ms", 2)} · ${fps.sampleCount} 帧样本`} tone="sky" />
        <MetricCard label="1% Low" reading={value(fps.onePercentLow, " FPS", 1)} detail="按最近约 1.2 秒帧时间的保守尾部值估算" />
        <MetricCard label={telemetry ? latencyName(telemetry.latency.kind) : "网络延迟"} reading={telemetry?.latency.reachable ? value(telemetry.latency.milliseconds, " ms", 0) : "不可达"} detail={telemetry ? `${telemetry.latency.target} · ${telemetry.latency.status}` : "正在探测"} tone={telemetry?.latency.reachable ? "green" : "white"} />
        <MetricCard label="CPU 总占用" reading={value(telemetry?.cpu.totalPercent)} detail={`绑定进程 ${value(telemetry?.game?.cpuPercent)} · ${telemetry?.cpu.logicalProcessors ?? "—"} 线程`} />
        <MetricCard label="CPU 温度" reading={telemetry?.cpu.temperatureC != null ? value(telemetry.cpu.temperatureC,'°C',1) : '不可用'} detail={telemetry?.cpu.temperatureMessage || telemetry?.cpu.temperatureSource || '正在检查传感器'} />
        <MetricCard label="GPU 占用" reading={value(telemetry?.gpu?.utilizationPercent)} detail={`${telemetry?.gpu?.temperatureC ?? "—"}°C · ${telemetry?.gpu?.powerWatts ?? "—"}W · ${telemetry?.gpu?.graphicsClockMHz ?? "—"}MHz`} tone="green" />
        <MetricCard label="显存" reading={value(telemetry?.gpu?.memoryUsedMB, " MB", 0)} detail={`总计 ${value(telemetry?.gpu?.memoryTotalMB, " MB", 0)}`} />
        <MetricCard label="系统内存" reading={value(telemetry?.memory.usedPercent)} detail={telemetry?.memory?.usedGB != null && telemetry.memory.totalGB != null ? `${telemetry.memory.usedGB} / ${telemetry.memory.totalGB} GB` : "内存数据暂不可用"} />
        <MetricCard label="实时网络速率" reading={`↓ ${telemetry?.network.downloadMbps ?? 0} Mbps`} detail={`↑ ${telemetry?.network.uploadMbps ?? 0} Mbps · ${telemetry?.network.adapter || "等待活动网卡"}`} />
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <div className="mb-1 flex items-center justify-between"><div><p className="text-[13px] font-semibold">最近 45 秒 FPS</p><p className="mt-1 text-[11px] text-slate-500">断线或无画面时按 0 显示，不补造数据</p></div><Gauge size={20} className="text-sky-300" /></div>
        <MiniChart points={history} />
      </div>
      {(error || fps.error || targetMessage) && <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/[0.07] p-4 text-[12px] text-red-200">{error || fps.error || targetMessage}</p>}
    </div>
  );
}

export function RealtimeOverlay() {
  const { telemetry, fps } = useRealtimeSamples('', 0, true);
  const [preferences, setPreferences] = useState<OverlayPreferences>(readOverlayPreferences);
  const [columns, setColumns] = useState(() => Math.max(1, Math.floor((window.innerWidth - 80) / 140)));
  useEffect(() => {
    const resize = () => setColumns(Math.max(1, Math.floor((window.innerWidth - 80) / 140)));
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    const update = () => setPreferences(readOverlayPreferences());
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, []);

  const rows = useMemo<{ id: OverlayMetricId; label: string; reading: string; color: string }[]>(() => [
    { id: "fps", label: "FPS", reading: value(fps.fps, "", 1), color: "text-sky-300" },
    { id: "low", label: "1% LOW", reading: value(fps.onePercentLow, "", 1), color: "text-white" },
    { id: "latency", label: telemetry ? latencyName(telemetry.latency.kind) : "延迟", reading: telemetry?.latency.reachable ? value(telemetry.latency.milliseconds, " ms") : "不可达", color: telemetry?.latency.reachable ? "text-emerald-300" : "text-amber-300" },
    { id: "cpu", label: "CPU / 游戏", reading: `${value(telemetry?.cpu.totalPercent)} / ${value(telemetry?.game?.cpuPercent)}`, color: "text-white" },
    { id: "gpu", label: "GPU / 显存", reading: `${value(telemetry?.gpu?.utilizationPercent)} / ${value(telemetry?.gpu?.memoryUsedMB, " MB", 0)}`, color: "text-white" },
    { id: "network", label: "网络", reading: `↓${telemetry?.network.downloadMbps ?? 0} ↑${telemetry?.network.uploadMbps ?? 0} Mbps`, color: "text-white" },
    { id: "cpuTemp", label: "CPU 温度", reading: telemetry?.cpu.temperatureC == null ? "不可用" : value(telemetry.cpu.temperatureC, "℃", 0), color: "text-amber-300" },
    { id: "gpuTemp", label: "GPU 温度", reading: telemetry?.gpu?.temperatureC == null ? "不可用" : value(telemetry.gpu.temperatureC, "℃", 0), color: "text-amber-300" },
    { id: "frameTime", label: "帧时间", reading: value(fps.frameTimeMs, " ms", 2), color: "text-sky-300" },
    { id: "memory", label: "内存", reading: value(telemetry?.memory.usedPercent, "%", 0), color: "text-white" },
    { id: "gameMemory", label: "游戏内存", reading: value(telemetry?.game?.memoryMB, " MB", 0), color: "text-white" },
    { id: "gpuPower", label: "GPU 功耗", reading: value(telemetry?.gpu?.powerWatts, " W", 0), color: "text-white" },
    { id: "gpuClock", label: "GPU 频率", reading: value(telemetry?.gpu?.graphicsClockMHz, " MHz", 0), color: "text-white" },
    { id: "vram", label: "显存", reading: value(telemetry?.gpu?.memoryUsedMB, " MB", 0), color: "text-white" },
    { id: "download", label: "下载", reading: value(telemetry?.network.downloadMbps, " Mbps", 1), color: "text-white" },
    { id: "upload", label: "上传", reading: value(telemetry?.network.uploadMbps, " Mbps", 1), color: "text-white" },
  ], [telemetry, fps]);
  const visibleRows = rows.filter((row) => preferences.metrics.includes(row.id));
  const textSize = preferences.scale === "small" ? "text-[13px]" : preferences.scale === "large" ? "text-[20px]" : "text-[16px]";
  const shell = preferences.background === "glass" ? "rounded-xl border border-white/15 bg-[#080b10]/75 shadow-2xl backdrop-blur-md" : "bg-transparent";

  if (preferences.layout === "horizontal") {
    return (
      <div className={`overlay-surface group flex h-screen w-screen items-center gap-4 overflow-y-auto px-3 text-white ${shell}`} style={{ textShadow: "0 1px 3px #000, 0 0 7px #000, 0 0 12px rgba(0,0,0,.92)" }}>
        <span className="overlay-drag-handle" title="按住拖动，自动记住位置；开启鼠标穿透时需先关闭穿透" aria-label="拖动悬浮窗并记住位置"><Move size={14} /></span>
        <div className="grid min-w-0 flex-1 items-center gap-x-3 gap-y-4 py-1 whitespace-nowrap" style={{gridTemplateColumns: `repeat(${Math.min(columns, visibleRows.length)}, minmax(0, 1fr))`}}>
          {visibleRows.map((row) => <div key={row.id} title={`${row.label}: ${row.reading}`} className="flex min-w-0 flex-col items-start gap-0.5">{preferences.labels && <span className="max-w-full truncate text-[9px] font-bold uppercase tracking-[0.08em] text-white/65">{row.label}</span>}<strong className={`max-w-full truncate ${textSize} font-semibold leading-none ${row.color}`}>{row.reading}</strong></div>)}
        </div>
        <button type="button" className="overlay-close shrink-0 rounded bg-black/35 p-1 text-white/70 transition hover:bg-red-500/35 hover:text-white" onClick={(event) => { event.stopPropagation(); void window.synapsexDesktop?.closeOverlay(); }} aria-label="关闭悬浮窗" title="关闭悬浮窗"><X size={14} /></button>
      </div>
    );
  }

  return (
    <div className={`overlay-surface min-h-screen p-4 text-white ${shell}`} style={{ textShadow: preferences.background === "transparent" ? "0 1px 3px #000, 0 0 7px #000" : undefined }}>
      <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-3">
        <div className="overlay-drag-handle flex items-center gap-2" title="按住拖动，自动记住位置；开启鼠标穿透时需先关闭穿透"><Zap size={15} className="text-emerald-300" /><strong className="text-[12px] tracking-[0.12em]">SYNAPSEX 实时监控</strong></div>
        <button type="button" className="overlay-close rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white" onClick={(event) => { event.stopPropagation(); void window.synapsexDesktop?.closeOverlay(); }} aria-label="关闭悬浮窗"><X size={15} /></button>
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-2.5">
        {visibleRows.map((row) => <div key={row.id}>{preferences.labels && <p className="text-[9px] uppercase tracking-[0.12em] text-slate-400">{row.label}</p>}<strong className={`mt-0.5 block font-light ${textSize} ${row.color}`}>{row.reading}</strong></div>)}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3 text-[9px] text-slate-500"><span>{telemetry?.game ? `${telemetry.game.name} · ${telemetry.game.id}` : fps.targetProcessName ? `等待 ${fps.targetProcessName}` : "尚未绑定目标"}</span><span>{statusText(fps.status, fps.targetProcessName)}</span></div>
    </div>
  );
}

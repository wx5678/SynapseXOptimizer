import { WorkspaceNavigation } from './WorkspaceNavigation';
import { useRecorderStatus } from '../lib/recorder-status';
import { Activity, AlertTriangle, CheckCircle2, ChevronDown, Cpu, Download, FileBarChart, Gauge, Info, Network, RefreshCw, TimerReset, Trash2, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { hostApi, type PerformanceReport, type PerformanceReportStats } from "../lib/api";
import { requestConfirmation } from "./ConfirmationDialog";

// Chart, metric and score surfaces share the desktop theme in both appearances.
const panel = "prism-panel rounded-[24px]";
const secondaryButton = "prism-button-secondary inline-flex items-center justify-center gap-2 px-4 py-3 text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-40";

function metric(value: number | null | undefined, suffix = "", digits = 1) {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : `${value.toFixed(digits)}${suffix}`;
}

function duration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = Math.floor(seconds % 60);
  return hours ? `${hours}小时 ${minutes}分` : minutes ? `${minutes}分 ${rest}秒` : `${rest}秒`;
}

function stabilityScore(report: PerformanceReport) {
  const average = report.fps?.average;
  const low = report.fps?.onePercentLowAverage;
  if (!average || low === null || low === undefined) return null;
  const frameScore = Math.min(100, Math.max(0, (low / average) * 100));
  const networkScore = report.latency.jitterMs === null ? 100 : Math.max(0, 100 - report.latency.jitterMs * 4);
  return Math.round(frameScore * 0.8 + networkScore * 0.2);
}

function scoreLabel(score: number | null) {
  if (score === null) return "样本不足";
  if (score >= 85) return "稳定";
  if (score >= 70) return "良好";
  if (score >= 55) return "有波动";
  return "波动明显";
}

function linePath(values: Array<number | null>, maximum: number) {
  let drawing = false;
  return values.map((value, index) => {
    if (value === null || !Number.isFinite(value)) { drawing = false; return ""; }
    const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 1000;
    const y = 225 - Math.min(210, (value / maximum) * 205);
    const command = drawing ? "L" : "M";
    drawing = true;
    return `${command}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function SessionChart({ report }: { report: PerformanceReport }) {
  const points = report.timeline ?? [];
  const fpsValues = points.map((point) => point.fps);
  const lowValues = points.map((point) => point.onePercentLow);
  const numeric = [...fpsValues, ...lowValues].filter((value): value is number => value !== null && Number.isFinite(value));
  const maximum = Math.max(60, ...numeric) * 1.08;
  const fpsPath = linePath(fpsValues, maximum);
  const lowPath = linePath(lowValues, maximum);
  if (points.length < 2 || !fpsPath) return <div className="grid h-[285px] place-items-center rounded-2xl border border-dashed border-white/[0.09] bg-black/20 text-center"><div><Activity className="mx-auto text-white/15" size={34} /><p className="mt-4 text-[12px] text-slate-500">该报告没有连续趋势点</p><p className="mt-1 text-[10px] text-slate-600">新版本生成的会话会显示完整曲线</p></div></div>;
  return (
    <div className="report-chart-surface relative overflow-hidden rounded-2xl border border-white/[0.08] p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] uppercase tracking-[0.16em] text-emerald-300/60">Frame Timeline</p><h3 className="mt-1 text-[17px] font-semibold text-white">帧率稳定性曲线</h3></div><div className="flex gap-4 text-[10px] text-slate-400"><span className="flex items-center gap-2"><i className="report-legend-fps h-0.5 w-5" />FPS</span><span className="flex items-center gap-2"><i className="report-legend-low h-0.5 w-5" />1% Low</span></div></div>
      <svg viewBox="0 0 1000 250" preserveAspectRatio="none" className="h-[230px] w-full overflow-visible">
        <defs><filter id="report-glow"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter><linearGradient id="report-grid-fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity=".03" /><stop offset=".5" stopColor="#fff" stopOpacity=".09" /><stop offset="1" stopColor="#fff" stopOpacity=".03" /></linearGradient></defs>
        {[45, 105, 165, 225].map((y) => <line className="report-chart-grid" key={y} x1="0" y1={y} x2="1000" y2={y} stroke="url(#report-grid-fade)" strokeWidth="1" />)}
        <path d={fpsPath} fill="none" stroke="rgba(101,245,190,.22)" strokeWidth="9" filter="url(#report-glow)" vectorEffect="non-scaling-stroke" />
        <path className="report-chart-fps" d={fpsPath} fill="none" stroke="#7cf5be" strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
        {lowPath && <><path d={lowPath} fill="none" stroke="rgba(196,154,255,.18)" strokeWidth="8" filter="url(#report-glow)" vectorEffect="non-scaling-stroke" /><path className="report-chart-low" d={lowPath} fill="none" stroke="#c79bff" strokeWidth="1.8" vectorEffect="non-scaling-stroke" /></>}
      </svg>
      <div className="flex justify-between border-t border-white/[0.06] pt-3 text-[9px] text-slate-600"><span>00:00</span><span>{duration(report.game.durationSeconds)}</span><span>{points.length} 个趋势点</span></div>
    </div>
  );
}

function UtilizationBar({ label, value, peak, tone }: { label: string; value: number | null | undefined; peak: number | null | undefined; tone: "emerald" | "sky" | "violet" | "amber" }) {
  const width = Math.max(0, Math.min(100, value ?? 0));
  const color = tone === "emerald" ? "from-emerald-400 to-teal-200" : tone === "sky" ? "from-sky-500 to-cyan-200" : tone === "violet" ? "from-violet-500 to-fuchsia-200" : "from-amber-500 to-yellow-200";
  return <div><div className="mb-2 flex items-center justify-between text-[11px]"><span className="text-slate-400">{label}</span><span className="text-white">平均 {metric(value, "%")} <small className="ml-1 text-slate-600">峰值 {metric(peak, "%")}</small></span></div><div className="h-2 overflow-hidden rounded-full bg-white/[0.055]"><div className={`h-full rounded-full bg-gradient-to-r ${color} shadow-[0_0_18px_rgba(var(--prism-accent),.18)]`} style={{ width: `${width}%` }} /></div></div>;
}

function exportReport(report: PerformanceReport) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `SynapseX-${report.game.processName.replace(/\.exe$/i, "")}-${report.id}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DetailStat({ label, stats, suffix }: { label: string; stats: PerformanceReportStats; suffix: string }) {
  return <div className="grid grid-cols-[1fr_repeat(4,minmax(70px,auto))] gap-3 border-b border-white/[0.06] py-3 text-[11px] last:border-0"><span className="text-slate-300">{label}</span><span><small className="block text-slate-600">平均</small>{metric(stats.average, suffix)}</span><span><small className="block text-slate-600">最低</small>{metric(stats.minimum, suffix)}</span><span><small className="block text-slate-600">P95</small>{metric(stats.p95, suffix)}</span><span><small className="block text-slate-600">峰值</small>{metric(stats.maximum, suffix)}</span></div>;
}

export function PerformanceReportsPanel() {
  const recorder = useRecorderStatus();
  const [reports, setReports] = useState<PerformanceReport[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refreshing = useRef(false);
  const loadFailed = useRef(false);
  const [autoEnabled, setAutoEnabled] = useState(() => localStorage.getItem("synapsex.reports.auto") !== "0");
  const selected = useMemo(() => reports.find((item) => item.id === selectedId) ?? reports[0] ?? null, [reports, selectedId]);
  const score = selected ? stabilityScore(selected) : null;

  const refresh = async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    setLoading(true);
    try { const items = await hostApi.performanceReports(); setReports(items); setSelectedId((current) => items.some((item) => item.id === current) ? current : items[0]?.id ?? ""); loadFailed.current = false; setError(""); }
    catch (reason) { loadFailed.current = true; setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { refreshing.current = false; setLoading(false); }
  };

  useEffect(() => { void refresh(); const onSaved = () => void refresh(); window.addEventListener("synapsex:performance-report-saved", onSaved); return () => window.removeEventListener("synapsex:performance-report-saved", onSaved); }, []);
  useEffect(() => { const timer = window.setInterval(() => { if (loadFailed.current) void refresh(); }, 5000); return () => window.clearInterval(timer); }, []);

  const toggleAutomatic = () => { const next = !autoEnabled; setAutoEnabled(next); localStorage.setItem("synapsex.reports.auto", next ? "1" : "0"); window.dispatchEvent(new Event('synapsex:report-preferences')); };
  const remove = async () => { if (selected?.id === recorder.id) { setError("本次会话正在记录，请在游戏退出或关闭自动记录后删除。"); return; } if (!selected || !requestConfirmation("删除性能报告", `即将删除：${selected.game.title || selected.game.processName}\n记录时间：${new Date(selected.createdAt).toLocaleString("zh-CN", { hour12: false })}`, { confirmLabel: "删除报告", danger: true, note: "删除后无法从软件内恢复，但不会影响游戏或系统设置。" })) return; try { await hostApi.deletePerformanceReport(selected.id); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } };

  return (
    <div>
      <WorkspaceNavigation><section className="workspace-page-header mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="mb-3 flex items-center gap-3 text-[11px] text-[var(--skin-muted)]"><span className="glass-icon"><FileBarChart size={18} /></span>游戏会话</div><h1>性能报告</h1><p className="mt-4 max-w-3xl text-[13px] leading-6 text-slate-400">查看每次游戏的帧时间、硬件负载与网络记录。</p></div><div className="flex items-center gap-2"><button onClick={() => void refresh()} aria-label="刷新报告" className={secondaryButton}><RefreshCw size={14} className={loading ? "animate-spin" : ""} />刷新</button><button onClick={toggleAutomatic} className={`rounded-xl border px-4 py-3 text-[12px] font-semibold transition ${autoEnabled ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : "border-white/10 bg-white/[0.03] text-slate-400"}`}>自动记录 {autoEnabled ? "ON" : "OFF"}</button></div></section></WorkspaceNavigation>

      <section className="prism-panel mb-4 p-4 text-[13px]" aria-label="报告记录状态" aria-live="polite"><strong>{recorder.phase === "recording" ? `正在记录：${recorder.title}` : autoEnabled ? "等待识别游戏" : "自动记录已关闭"}</strong><p className="mt-2 text-[var(--skin-muted)]">{recorder.phase === "recording" ? `${recorder.samples} 次采样 · ${duration(recorder.seconds)} · 满 15 秒后每 15 秒保存一次` : "记录不依赖 FPS 开关；开启 FPS 采集后，报告才会包含帧率和帧时间。"}{recorder.savedAt > 0 && ` · 最近保存 ${new Date(recorder.savedAt).toLocaleTimeString()}`}</p>{recorder.pending > 0 && <p className="mt-2">{recorder.pending} 份记录等待保存，软件会自动重试。</p>}{recorder.error && <p role="alert" className="mt-2 text-amber-400">{recorder.error}</p>}</section>
      {reports.length > 0 && <div className="mb-4 flex gap-3 overflow-x-auto pb-2">{reports.map((report) => <button key={report.id} onClick={() => setSelectedId(report.id)} className={`min-w-[260px] rounded-2xl border p-4 text-left transition ${selected?.id === report.id ? "border-[rgba(var(--prism-accent),.32)] bg-[rgba(var(--prism-accent),.1)] shadow-[0_16px_50px_-34px_rgba(var(--prism-accent),.9)]" : "border-white/[0.07] bg-black/20 hover:bg-white/[0.04]"}`}><div className="flex items-start justify-between gap-3"><strong className="truncate text-[13px] text-white">{report.game.title || report.game.processName}</strong><span className="shrink-0 text-[9px] text-slate-500">{duration(report.game.durationSeconds)}</span></div><div className="mt-3 flex items-end justify-between"><span className="text-[10px] text-slate-500">{new Date(report.createdAt).toLocaleString("zh-CN")}</span><span className="text-[18px] font-light text-emerald-200">{metric(report.fps?.average, " FPS")}</span></div></button>)}</div>}

      {!loading && !selected && <section className={panel + " grid min-h-[520px] place-items-center overflow-hidden p-8 text-center"}><div className="relative"><div className="absolute inset-0 -z-10 scale-[3] rounded-full bg-emerald-400/[0.06] blur-3xl" /><FileBarChart className="mx-auto text-emerald-200/25" size={54} /><h2 className="mt-6 text-[22px] font-light">{recorder.phase === "recording" ? "正在生成本次报告" : "暂无已保存的报告"}</h2><p className="mx-auto mt-3 max-w-md text-[12px] leading-6 text-slate-500">保持软件开启并运行游戏，累计至少 15 秒及 3 次有效采样后自动保存。游戏中即可查看，正常退出后约 9 秒完成汇总。</p></div></section>}

      {selected && <div className="space-y-4">
        <section className={panel + " overflow-hidden p-5 sm:p-7"}>
          <div className="grid gap-7 xl:grid-cols-[1.25fr_220px_1fr] xl:items-center">
            <div><div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-emerald-300/65"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_12px_#6ee7b7]" />{recorder.id === selected.id ? "本次会话 · 正在记录" : selected.status === "recording" || selected.status === "interrupted" ? "已保存的阶段记录" : "会话已结束"}</div><h2 className="mt-4 text-[clamp(25px,4vw,42px)] font-light tracking-[-0.04em] text-white">{selected.game.title || selected.game.processName}</h2><p className="mt-3 text-[11px] text-slate-500">{new Date(selected.game.startedAt).toLocaleString("zh-CN")} · {selected.game.processName} · {selected.game.bindingMode === "manual" ? "手动绑定" : "自动识别"}</p><div className="mt-6 flex flex-wrap gap-2"><span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-[10px] text-slate-300"><TimerReset className="mr-1.5 inline" size={12} />{duration(selected.game.durationSeconds)}</span><span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-[10px] text-slate-300">{selected.samples.telemetry} 次遥测</span><span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-[10px] text-slate-300">{selected.timeline?.length ?? 0} 个趋势点</span></div></div>
            <div className="grid place-items-center"><div className="relative grid h-[176px] w-[176px] place-items-center rounded-full" style={{ background: `conic-gradient(rgb(var(--prism-accent)) ${(score ?? 0) * 3.6}deg, rgba(255,255,255,.055) 0deg)` }}><div className="report-score-surface absolute inset-[9px] rounded-full border border-white/[0.08]" /><div className="relative text-center"><span className="block text-[10px] uppercase tracking-[0.16em] text-slate-500">稳定度</span><strong className="mt-1 block text-[48px] font-light leading-none text-white">{score ?? "—"}</strong><span className="mt-2 block text-[11px] text-emerald-200">{scoreLabel(score)}</span></div></div><p className="mt-3 text-center text-[9px] leading-4 text-slate-600">80% 帧率稳定比 + 20% 延迟波动</p></div>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.08]">
              {[{ label: "平均 FPS", value: metric(selected.fps?.average, "", 1), icon: Zap, tone: "text-emerald-200" }, { label: "采样 1% Low", value: metric(selected.fps?.onePercentLowAverage, "", 1), icon: Activity, tone: "text-violet-200" }, { label: "GPU 平均", value: metric(selected.gpu?.utilization.average, "%", 1), icon: Gauge, tone: "text-sky-200" }, { label: "延迟 P95", value: metric(selected.latency.milliseconds.p95, " ms", 1), icon: Network, tone: "text-amber-100" }].map((item) => <div key={item.label} className="report-metric-surface p-4"><item.icon size={14} className={item.tone} /><p className="mt-5 text-[9px] uppercase tracking-[0.12em] text-slate-600">{item.label}</p><strong className="mt-1 block text-[24px] font-light text-white">{item.value}</strong></div>)}
            </div>
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[1.65fr_.75fr]"><SessionChart report={selected} /><section className={panel + " p-5"}><div className="flex items-center gap-2"><Cpu size={17} className="text-emerald-300" /><h3 className="text-[15px] font-semibold">负载结构</h3></div><p className="mt-2 text-[10px] leading-5 text-slate-500">用会话平均值判断资源是否长期贴近上限。</p><div className="mt-7 space-y-6"><UtilizationBar label="游戏 CPU" value={selected.cpu.game.average} peak={selected.cpu.game.maximum} tone="emerald" /><UtilizationBar label="整机 CPU" value={selected.cpu.system.average} peak={selected.cpu.system.maximum} tone="sky" /><UtilizationBar label="GPU" value={selected.gpu?.utilization.average} peak={selected.gpu?.utilization.maximum} tone="violet" /><UtilizationBar label="系统内存" value={selected.memory.systemUsedPercent.average} peak={selected.memory.systemUsedPercent.maximum} tone="amber" /></div><div className="mt-7 rounded-xl border border-white/[0.07] bg-black/20 p-4 text-[10px] leading-5 text-slate-500">显卡温度峰值 <b className="text-slate-200">{metric(selected.gpu?.temperature.maximum, "°C")}</b><br />游戏内存峰值 <b className="text-slate-200">{metric(selected.memory.gameMB.maximum, " MB")}</b><br />延迟相邻波动 <b className="text-slate-200">{metric(selected.latency.jitterMs, " ms")}</b></div></section></div>

        <section className="grid gap-3 md:grid-cols-2">{selected.observations.map((item, index) => <div key={`${item.title}-${index}`} className={`${panel} p-5`}><div className="flex items-center gap-2 text-[13px] font-semibold text-white">{item.level === "warn" ? <AlertTriangle size={16} className="text-amber-300" /> : item.level === "good" ? <CheckCircle2 size={16} className="text-emerald-300" /> : <Info size={16} className="text-sky-300" />}{item.title}</div><p className="mt-3 text-[11px] leading-5 text-slate-400">{item.detail}</p></div>)}</section>

        <details className={panel + " group overflow-hidden"}><summary className="flex cursor-pointer list-none items-center justify-between p-5 text-[13px] font-semibold text-white"><span>完整技术数据</span><ChevronDown size={16} className="text-slate-500 transition group-open:rotate-180" /></summary><div className="border-t border-white/[0.07] px-5 pb-5"><DetailStat label="整机 CPU" stats={selected.cpu.system} suffix="%" /><DetailStat label="游戏 CPU" stats={selected.cpu.game} suffix="%" /><DetailStat label="GPU 占用" stats={selected.gpu?.utilization ?? { average: null, minimum: null, maximum: null, p95: null }} suffix="%" /><DetailStat label="系统内存" stats={selected.memory.systemUsedPercent} suffix="%" /><DetailStat label="游戏内存" stats={selected.memory.gameMB} suffix=" MB" /><DetailStat label="网络延迟" stats={selected.latency.milliseconds} suffix=" ms" /><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-[10px] leading-5 text-slate-600">网络目标 {selected.latency.target || "无"} · 网卡 {selected.network.adapter || "无"} · 不可达样本 {selected.samples.unreachableLatency}</p><div className="flex gap-2"><button className={secondaryButton} onClick={() => exportReport(selected)}><Download size={14} />导出 JSON</button><button className={secondaryButton + " text-red-200"} onClick={() => void remove()}><Trash2 size={14} />删除报告</button></div></div></div></details>
      </div>}
      {error && <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/[0.07] p-4 text-[12px] text-red-200">{error}</p>}
    </div>
  );
}

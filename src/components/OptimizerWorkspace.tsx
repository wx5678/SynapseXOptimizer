import { WorkspaceNavigation } from './WorkspaceNavigation';
import { PowerLibraryCard } from './PowerLibraryCard';
import { NvidiaNipPanel } from './NvidiaNipPanel';
import { motion } from "framer-motion";
import {VipNotice} from './VipNotice';
import {ExecutablePickerButton} from './ExecutablePickerButton';
import {NicPropertyEditor} from './NicPropertyEditor';
import {
  Activity,
  ArchiveRestore,
  ArrowRight,
  Check,
  CheckCircle2,
  Cpu,
  FolderOpen,
  Gamepad2,
  Gauge,
  HardDrive,
  Info,
  Network,
  Plus,
  RefreshCw,
  Rocket,
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  Stethoscope,
  Trash2,
  Undo2,
  Wifi,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FluidMetricCard } from "./VisualAtmosphere";
import { StartupSettingsCard } from "./StartupSettingsCard";
import { DesktopSettingsCards } from "./DesktopSettingsCards";
import { LicenseSettingsCard } from "./LicenseSettingsCard";
import { requestConfirmation } from "./ConfirmationDialog";
import {
  hostApi,
  type ApplicationAudit,
  type BackupGroup,
  type DiagnosticSnapshot,
  type DisplayAdapterCatalog,
  type DnsBenchmark,
  type HostStatus,
  type GpuDriverCatalog,
  type GpuPreferenceState,
  type JiuYinConfigCatalog,
  type MtuResult,
  type NicAudit,
  type NetworkAdapterHealth,
  type NetworkQuality,
  type NetworkProbeTargets,
  type NetworkStability,
  type NetworkTrace,
  type NetworkThroughput,
  type NetworkToolkit,
  type ProfilePreview,
  type RuntimeSnapshot,
  type ServiceAudit,
  type StartupAudit,
  type SystemTweak,
  type SystemContention,
  type SystemGameReadiness,
  type ThreadPressure,
} from "../lib/api";

import { AppearanceOptions } from "./AppearancePanel";
import { BackgroundManagerPanel } from "./BackgroundManagerPanel";
import { DesktopAppsPanel } from "./MaintenancePanel";
import { SystemExtensions } from "./SystemExtensions";
import type { SectionRequest } from './SidebarFlyout';
import { SystemOverviewStrip } from "./SystemOverviewStrip";
import { RepairJobsPanel } from "./RepairJobsPanel";
import { QuickOptimizationPanel } from "./QuickOptimizationPanel";
import { JiuYinFpsUnlockCard } from "./JiuYinFpsUnlockCard";

export type WorkspacePage =
  | "overview"
  | "signin"
  | "lab"
  | "boost"
  | "jiuyin"
  | "diagnostics"
  | "monitor"
  | "runtime"
  | "system"
  | "startup"
  | "network"
  | "repair"
  | "reports"
  | "history"
  | "settings";

const systemLabels: Record<string, string> = {
  cpu: "处理器",
  physicalCores: "物理核心",
  logicalProcessors: "逻辑线程",
  memoryGB: "内存容量",
  windows: "Windows 版本",
  windowsBuild: "系统构建号",
  uptimeHours: "本次开机时长",
  systemDriveFreeGB: "系统盘可用空间",
  gpu: "显示设备与驱动",
  powerScheme: "当前电源方案",
  gameRunning: "九阴真经进程",
  gameProcessId: "游戏进程 ID",
  gamePriority: "游戏进程优先级",
  note: "检测边界",
};
const networkLabels: Record<string, string> = {
  clashRunning: "Clash / Mihomo",
  proxyEnabled: "系统代理",
  proxyServer: "代理服务器",
  autoConfigUrl: "PAC 地址",
  staleLoopbackCandidate: "残留本地代理",
  activeAdapters: "活动网卡",
  dnsServers: "DNS 服务器",
  defaultRoutes: "默认路由",
  note: "检测边界",
};
const operationLabels: Record<string, string> = {
  "optimizations-apply": "应用系统调整",
  "optimizations-restore": "恢复系统调整",
  "entries-disable": "停用启动项",
  "entries-restore": "恢复启动项",
  "stale-proxy-repair": "修复残留代理",
  "proxy-restore": "恢复代理设置",
  "profile-apply": "应用九阴配置",
  "custom-settings-apply": "应用九阴自定义配置",
  "profile-restore": "恢复九阴配置",
  "keybind-profile-save": "保存本地按键方案",
  "keybind-profile-apply": "应用按键方案到账号",
  "keybind-profile-restore": "恢复账号按键方案",
  "keybind-profile-delete": "删除本地按键方案",
  "dns-apply": "应用 DNS",
  "dns-restore": "恢复 DNS",
  "dns-flush": "刷新 DNS 缓存",
  "hosts-save": "保存 Hosts",
  "hosts-restore": "恢复 Hosts",
  "nic-latency-profile-apply": "应用网卡低延迟项",
  "nic-latency-profile-restore": "恢复网卡高级属性",
  "mtu-apply": "应用网卡 MTU",
  "mtu-restore": "恢复网卡 MTU",
  "game-priority-above-normal": "设置游戏优先级",
  "game-priority-restore": "恢复游戏优先级",
  "power-scheme-apply": "切换电源方案",
  "power-scheme-restore": "恢复电源方案",
  "cpu-power-plan-create": "创建 CPU 专属电源方案",
  "cpu-power-plan-restore": "恢复并移除 CPU 专属方案",
  "gpu-preference-apply": "指定游戏高性能 GPU",
  "gpu-preference-restore": "恢复游戏 GPU 首选项",
  "gpu-driver-profile-apply": "应用显卡驱动专项",
  "gpu-driver-profile-restore": "恢复显卡驱动专项",
  "nvidia-nip-apply": "导入 NVIDIA 全局配置",
  "nvidia-nip-restore": "恢复 NVIDIA 配置原值",
  "integrated-gpu-disable": "禁用 Intel / AMD 核显",
  "integrated-gpu-restore": "恢复 Intel / AMD 核显",
};
const panel = "prism-panel rounded-[22px]";
const inputClass =
  "prism-input px-4 py-3 text-[14px] placeholder:text-slate-500";
const primaryButton =
  "prism-button-primary px-5 py-3 text-[14px] font-bold disabled:cursor-not-allowed disabled:opacity-30";
const secondaryButton =
  "prism-button-secondary px-5 py-3 text-[14px] font-semibold disabled:cursor-not-allowed disabled:opacity-30";

type AppPreferences = {
  confirmBeforeWrite: boolean;
  defaultNetworkTarget: string;
  stabilitySampleCount: 10 | 20 | 30;
};
const defaultPreferences: AppPreferences = {
  confirmBeforeWrite: true,
  defaultNetworkTarget: "223.5.5.5",
  stabilitySampleCount: 20,
};
function loadPreferences(): AppPreferences {
  try {
    return { ...defaultPreferences, ...JSON.parse(localStorage.getItem("synapsex-preferences") ?? "{}") };
  } catch {
    return defaultPreferences;
  }
}
function persistPreferences(value: AppPreferences) {
  localStorage.setItem("synapsex-preferences", JSON.stringify(value));
}

type LocalJiuYinPreset = {
  id: string;
  name: string;
  createdAt: string;
  values: Record<string, string>;
};
const localJiuYinPresetKey = "synapsex.jiuyin.custom-presets.v1";
function loadLocalJiuYinPresets(): LocalJiuYinPreset[] {
  try {
    const value = JSON.parse(localStorage.getItem(localJiuYinPresetKey) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item) => item && typeof item.id === "string" && typeof item.name === "string" && item.values && typeof item.values === "object");
  } catch {
    return [];
  }
}
function persistLocalJiuYinPresets(value: LocalJiuYinPreset[]) {
  localStorage.setItem(localJiuYinPresetKey, JSON.stringify(value));
}

function translateError(value: unknown) {
  const text = value instanceof Error ? value.message : String(value);
  if (text.includes("fxgame.exe is running"))
    return "游戏仍在运行，请正常退出后再应用或恢复九阴配置。";
  if (text.includes("Invalid JiuYin directory"))
    return "九阴真经目录无效，请确认目录内存在启动器和 bin64 配置文件。";
  if (text.includes("No SynapseX visual-profile backup"))
    return "还没有可恢复的九阴配置备份。";
  if (text.includes("No SynapseX system backup"))
    return "还没有可恢复的系统调整备份。";
  if (text.includes("game executable does not exist"))
    return "指定的游戏程序不存在，请选择正确的 .exe 文件路径。";
  if (text.includes("No SynapseX GPU preference backup"))
    return "还没有可恢复的每游戏 GPU 首选项备份。";
  if (text.includes("No SynapseX GPU driver backup"))
    return "还没有可恢复的显卡驱动专项备份。";
  if (text.includes("AMD ADLX runtime is not installed"))
    return "AMD 显卡驱动未提供 ADLX 接口，请先确认安装的是完整 AMD 显卡驱动。";
  if (text.includes("No safely disableable integrated GPU"))
    return "当前没有可安全禁用的核显：可能未检测到独显、核显正在输出画面，或这是混合显卡笔记本。";
  if (text.includes("No SynapseX display adapter backup"))
    return "还没有可恢复的核显设备状态备份。";
  if (text.includes("Invalid network probe target") || text.includes("cannot be resolved"))
    return "探测目标无效，请输入 IP 地址或不带协议前缀的域名。";
  if (text.includes("No SynapseX startup backup"))
    return "还没有可恢复的启动项备份。";
  if (text.includes("Clash or Mihomo is running"))
    return "Clash 或 Mihomo 正在运行，退出代理软件后才能修复残留代理。";
  if (text.includes("No stale local Clash proxy"))
    return "没有检测到需要修复的本地代理残留。";
  if (text.includes("No SynapseX network backup"))
    return "还没有可恢复的网络设置备份。";
  if (text.includes("No SynapseX MTU backup"))
    return "还没有可恢复的 MTU 备份。";
  if (text.includes("No SynapseX CPU power"))
    return "还没有可恢复的 CPU 专属电源方案。";
  return text;
}
function confirmAction(title: string, detail: string) {
  if (!loadPreferences().confirmBeforeWrite) return true;
  return requestConfirmation(title, detail);
}
function displayAdapterBlockReason(reason: string) {
  const labels: Record<string, string> = {
    "already-disabled": "当前已禁用",
    "no-enabled-discrete-gpu": "没有检测到可用独显",
    "portable-hybrid-system": "混合显卡笔记本不执行设备级禁用",
    "active-display-not-verifiable": "无法确认当前画面由哪张显卡输出",
    "integrated-gpu-drives-desktop": "核显正在承担桌面或主显示器输出",
    "last-enabled-display-adapter": "这是最后一张已启用显示适配器",
  };
  return labels[reason] ?? reason;
}
function PageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: typeof Gauge;
}) {
  return (
    <WorkspaceNavigation><div className="workspace-page-header mb-7 flex items-start gap-4">
      <span className="glass-icon mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-xl">
        <Icon size={21} />
      </span>
      <div>
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-emerald-100/55">
          {eyebrow}
        </p>
        <h1 className="text-[clamp(26px,2.8vw,36px)] font-semibold leading-tight tracking-[-0.03em] text-white">
          {title}
        </h1>
        <p className="mt-3 max-w-3xl text-[14px] leading-6 text-slate-300">
          {description}
        </p>
      </div>
    </div></WorkspaceNavigation>
  );
}
function Notice({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "ok" | "warn";
}) {
  const style =
    tone === "ok"
      ? "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-100"
      : tone === "warn"
        ? "border-amber-400/25 bg-amber-400/[0.07] text-amber-100"
        : "border-sky-400/20 bg-sky-400/[0.06] text-sky-100";
  return (
    <div className={"rounded-xl border p-4 text-[13px] leading-6 " + style}>
      {children}
    </div>
  );
}
function ResultMessage({ text }: { text: string }) {
  const failed = /失败|错误|无法|未连接|不存在|请选择|仍在运行/.test(text);
  const ok = !failed && /已|完成|编号|成功/.test(text);
  return (
    <div
      className={
        "mt-4 rounded-xl border p-4 text-[13px] leading-6 " +
        (ok
          ? "border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-100"
          : "border-red-400/25 bg-red-400/[0.06] text-red-100")
      }
    >
      {text}
    </div>
  );
}
function Loading() {
  return (
    <div
      className={
        panel + " flex items-center gap-3 p-6 text-[14px] text-slate-300"
      }
    >
      <Activity size={18} className="animate-pulse" />
      正在读取本机状态…
    </div>
  );
}
function readable(value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === "")
    return <span className="text-slate-500">未设置</span>;
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value))
    return (
      <div className="space-y-2">
        {value.map((item, i) => (
          <div
            key={i}
            className="rounded-lg bg-black/30 px-3 py-2 font-mono text-[12px] leading-5"
          >
            {typeof item === "object"
              ? Object.entries(item as Record<string, unknown>)
                  .map(
                    ([k, v]) =>
                      k +
                      ": " +
                      (Array.isArray(v) ? v.join(", ") : String(v ?? "")),
                  )
                  .join(" · ")
              : String(item)}
          </div>
        ))}
      </div>
    );
  if (typeof value === "object")
    return (
      <span className="font-mono text-[12px]">{JSON.stringify(value)}</span>
    );
  const translations: Record<string, string> = {
    system_read_only_no_changes:
      "系统快照本身只读；未修改驱动、BIOS、计时器、MPO、HAGS 或显卡 Profile。",
    network_read_only_no_packet_duplication:
      "网络快照只读；不复制封包、不注入驱动、不伪造 FEC 或多网卡叠加。",
  };
  return translations[String(value)] ?? String(value);
}
function ValueRows({
  data,
  labels,
}: {
  data: Record<string, unknown> | null;
  labels: Record<string, string>;
}) {
  if (!data) return null;
  return (
    <div className={panel + " overflow-hidden"}>
      {Object.entries(data).map(([key, value]) => (
        <div
          key={key}
          className="grid gap-2 border-b border-white/[0.08] px-5 py-4 last:border-0 sm:grid-cols-[200px_1fr]"
        >
          <span className="text-[13px] font-medium text-slate-400">
            {labels[key] ?? key}
          </span>
          <div className="break-words text-[13px] leading-6 text-slate-100">
            {key === "memoryGB" || key === "systemDriveFreeGB"
              ? String(value) + " GB"
              : key === "uptimeHours"
                ? String(value) + " 小时"
                : readable(value)}
          </div>
        </div>
      ))}
    </div>
  );
}
function TweakCard({
  tweak,
  selected,
  onToggle,
}: {
  tweak: SystemTweak;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <article className="system-setting-row" data-applied={tweak.applied}>
      <div className="system-setting-main">
        <input type="checkbox" id={`system-tweak-${tweak.id}`} aria-label={tweak.title} disabled={tweak.applied} checked={tweak.applied || selected} onChange={onToggle} />
        <div><label htmlFor={`system-tweak-${tweak.id}`}>{tweak.title}</label><p>{tweak.description}</p></div>
        <span className="system-setting-state">{tweak.applied ? <><CheckCircle2 size={13} />已生效</> : selected ? "已选择" : "未应用"}</span>
      </div>
      <details className="system-setting-details">
        <summary>设置详情</summary>
        <div><p><strong>执行内容</strong>{tweak.impact}</p><p><strong>功能影响</strong>{tweak.tradeoff}</p><p className="system-setting-meta">{tweak.category} · 风险：{tweak.risk}{tweak.recommended ? " · 推荐" : ""}{tweak.restartRequired ? " · 需重新登录或重启" : ""}</p></div>
      </details>
      {tweak.restartRequired && <small className="system-restart-note">需重新登录或重启</small>}
    </article>
  );
}

export function OptimizerWorkspace({
  page,
  onNavigate,
  sectionRequest,
}: {
  page: WorkspacePage;
  onNavigate: (page: WorkspacePage) => void;
  sectionRequest?: SectionRequest;
}) {
  const [preferences, setPreferences] = useState<AppPreferences>(() => loadPreferences());
  const [status, setStatus] = useState<HostStatus | null>(null);
  const [gameRoot, setGameRoot] = useState(() => localStorage.getItem("synapsex-game-root") || "");
  const [profile, setProfile] = useState("low-loss");
  const [profilePreview, setProfilePreview] = useState<ProfilePreview | null>(
    null,
  );
  const [jiuyinConfig, setJiuYinConfig] = useState<JiuYinConfigCatalog | null>(null);
  const [jiuyinValues, setJiuYinValues] = useState<Record<string, string>>({});
  const [localJiuYinPresets, setLocalJiuYinPresets] = useState<LocalJiuYinPreset[]>(() => loadLocalJiuYinPresets());
  const [showJiuYinPresetBuilder, setShowJiuYinPresetBuilder] = useState(false);
  const [newJiuYinPresetName, setNewJiuYinPresetName] = useState("");
  const [systemAudit, setSystemAudit] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [networkAudit, setNetworkAudit] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [tweaks, setTweaks] = useState<SystemTweak[]>([]);
  const [selectedTweaks, setSelectedTweaks] = useState<string[]>([]);
  const [systemReadiness, setSystemReadiness] = useState<SystemGameReadiness | null>(null);
  const [systemContention, setSystemContention] = useState<SystemContention | null>(null);
  const [gpuExecutable, setGpuExecutable] = useState(() => localStorage.getItem("synapsex.gpu.gameExecutable") || "");
  const [gpuPreference, setGpuPreference] = useState<GpuPreferenceState | null>(null);
  const [gpuReadError, setGpuReadError] = useState("");
  const readGpuPreference = async (executable: string) => {
    if (!executable) { setGpuReadError("尚未取得游戏路径，请重新检测或选择 EXE。"); return null; }
    try { const result = await hostApi.gpuPreference(executable); setGpuReadError(""); return result; }
    catch (error) { setGpuReadError(`读取显卡首选项失败：${String(error)}`); return null; }
  };
  const [gpuDriverCatalog, setGpuDriverCatalog] = useState<GpuDriverCatalog | null>(null);
  const [displayAdapterCatalog, setDisplayAdapterCatalog] = useState<DisplayAdapterCatalog | null>(null);
  const [selectedGpuProfiles, setSelectedGpuProfiles] = useState<Record<string, string>>({});
  const [startup, setStartup] = useState<StartupAudit | null>(null);
  const [applications, setApplications] = useState<ApplicationAudit | null>(
    null,
  );
  const [services, setServices] = useState<ServiceAudit | null>(null);
  const [selectedStartup, setSelectedStartup] = useState<string[]>([]);
  const [networkQuality, setNetworkQuality] = useState<NetworkQuality | null>(
    null,
  );
  const [networkThroughput, setNetworkThroughput] =
    useState<NetworkThroughput | null>(null);
  const [networkAdapterHealth, setNetworkAdapterHealth] = useState<NetworkAdapterHealth | null>(null);
  const [networkStability, setNetworkStability] = useState<NetworkStability | null>(null);
  const [networkTrace, setNetworkTrace] = useState<NetworkTrace | null>(null);
  const [networkProbeTarget, setNetworkProbeTarget] = useState(preferences.defaultNetworkTarget);
  const [networkTargets, setNetworkTargets] = useState<NetworkProbeTargets | null>(null);
  const [networkToolkit, setNetworkToolkit] = useState<NetworkToolkit | null>(
    null,
  );
  const [dnsBenchmark, setDnsBenchmark] = useState<DnsBenchmark | null>(null);
  const [mtuResult, setMtuResult] = useState<MtuResult | null>(null);
  const [networkTab, setNetworkTab] = useState<
    "status" | "stability" | "dns" | "tcp" | "nic" | "hosts" | "mtu"
  >("status");
  useEffect(()=>{if(sectionRequest?.page==='network' && ['status','stability','dns','tcp','nic','hosts','mtu'].includes(sectionRequest.section))setNetworkTab(sectionRequest.section as typeof networkTab);},[sectionRequest]);
  const [selectedAdapter, setSelectedAdapter] = useState("");
  const [selectedDnsPreset, setSelectedDnsPreset] = useState("alidns");
  const [hostsContent, setHostsContent] = useState("");
  const [mtuTarget, setMtuTarget] = useState("223.5.5.5");
  const [nicAudit, setNicAudit] = useState<NicAudit | null>(null);
  const [runtime, setRuntime] = useState<RuntimeSnapshot | null>(null);
  const [diagnostic, setDiagnostic] = useState<DiagnosticSnapshot | null>(null);
  const [threadPressure, setThreadPressure] = useState<ThreadPressure | null>(null);
  const [selectedPower, setSelectedPower] = useState("");
  const [selectedCpuProfileId, setSelectedCpuProfileId] = useState("");
  const [backups, setBackups] = useState<BackupGroup[]>([]);
  const [operations, setOperations] = useState<
    Array<{
      timestamp: string;
      category: string;
      action: string;
      result: string;
      backupId: string;
      detail: Record<string, unknown>;
    }>
  >([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const updatePreferences = (changes: Partial<AppPreferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...changes };
      persistPreferences(next);
      return next;
    });
  };
  const connected = Boolean(status?.connected);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await operation();
    } catch (error) {
      setMessage(translateError(error));
      if (page === "runtime") {
        try { setRuntime(await hostApi.runtimeAudit()); } catch { /* Keep the original operation error visible. */ }
      }
    } finally {
      setBusy(false);
    }
  };
  const loadTweaks = async () => {
    const data = await hostApi.systemCatalog();
    setTweaks(data);
    setSelectedTweaks((current) =>
      current.length
        ? current.filter((id) =>
            data.some((item) => item.id === id && !item.applied),
          )
        : data
            .filter((item) => item.defaultSelected && !item.applied)
            .map((item) => item.id),
    );
  };
  const acceptJiuYinCatalog = (data: JiuYinConfigCatalog) => {
    setJiuYinConfig(data);
    setJiuYinValues(Object.fromEntries(data.settings.map((item) => [item.id, item.current ?? ""])));
  };
  const acceptNetworkTargets = (data: NetworkProbeTargets) => {
    setNetworkTargets(data);
    const gameTarget = data.items.find((item) => item.kind === "jiuyin-active") ?? data.items.find((item) => item.kind === "jiuyin-recent");
    if (gameTarget && (networkProbeTarget === preferences.defaultNetworkTarget || !networkProbeTarget)) {
      setNetworkProbeTarget(gameTarget.target);
    }
  };
  useEffect(() => {
    localStorage.setItem("synapsex-game-root", gameRoot);
    if (!gameRoot.trim()) return;
    const timer = window.setTimeout(() => { void window.synapsexDesktop?.saveGamePaths({ gameRoot }).catch(() => {}); }, 600);
    return () => window.clearTimeout(timer);
  }, [gameRoot]);
  useEffect(() => {
    if (gpuExecutable.trim()) localStorage.setItem("synapsex.gpu.gameExecutable", gpuExecutable.trim());
    if (gpuExecutable.trim()) void window.synapsexDesktop?.saveGamePaths({ gpuExecutable }).catch(() => {});
  }, [gpuExecutable]);
  useEffect(() => {
    const refresh = () =>
      hostApi
        .status()
        .then((next) => {
          setStatus(next);
          if (!localStorage.getItem("synapsex-game-root") && next.gameRoot) setGameRoot(next.gameRoot);
        })
        .catch(() => setStatus(null));
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    setMessage("");
    if (!connected) return;
    if (page === "overview")
      void run(async () => {
        const values = await Promise.all([hostApi.systemAudit(), loadTweaks()]);
        setSystemAudit(values[0]);
      });
    if (page === "system")
      void run(async () => {
        const savedExecutable = localStorage.getItem("synapsex.gpu.gameExecutable");
        const targetExecutable = savedExecutable || gpuExecutable || status?.gameExecutable || "";
        setGpuExecutable(targetExecutable);
        const values = await Promise.all([
          hostApi.systemAudit(),
          loadTweaks(),
          hostApi.servicesAudit(),
          hostApi.systemReadiness(),
          readGpuPreference(targetExecutable),
          hostApi.gpuDriverCatalog(targetExecutable).catch(() => null),
          hostApi.displayAdapters().catch(() => null),
        ]);
        setSystemAudit(values[0]);
        setServices(values[2]);
        setSystemReadiness(values[3]);
        setGpuPreference(values[4]);
        setGpuDriverCatalog(values[5]);
        setDisplayAdapterCatalog(values[6]);
        if (values[5]) {
          setSelectedGpuProfiles(Object.fromEntries(values[5].providers.map((provider) => [provider.vendor, provider.profiles.find((profile) => profile.recommended)?.id ?? provider.profiles[0]?.id ?? ""])));
        }
      });
    if (page === "startup")
      void run(async () => {
        const values = await Promise.all([
          hostApi.startupAudit(),
          hostApi.applicationsAudit(),
        ]);
        setStartup(values[0]);
        setApplications(values[1]);
      });
    if (page === "network")
      void run(async () => {
        const values = await Promise.all([
          hostApi.networkAudit(),
          hostApi.networkToolkit(),
          hostApi.networkAdapterHealth(),
          hostApi.networkTargets(),
        ]);
        setNetworkAudit(values[0]);
        setNetworkToolkit(values[1]);
        setNetworkAdapterHealth(values[2]);
        acceptNetworkTargets(values[3]);
        const active =
          values[1].adapters.find((item) => item.name === values[1].recommendedPhysicalAdapter) ??
          values[1].adapters.find((item) => item.isDefaultRoute) ??
          values[1].adapters.find((item) => item.status === "Up");
        setSelectedAdapter((old) => old || active?.name || "");
        setHostsContent(values[1].hosts.content);
      });
    if (page === "repair")
      void run(async () => setNetworkAudit(await hostApi.networkAudit()));
    if (page === "jiuyin")
      void run(async () => acceptJiuYinCatalog(await hostApi.jiuYinConfigCatalog(gameRoot)));
    if (page === "diagnostics")
      void run(async () => setDiagnostic(await hostApi.diagnosticAudit()));
    if (page === "runtime")
      void run(async () => {
        const data = await hostApi.runtimeAudit();
        setRuntime(data);
        setSelectedPower((old) => old || data.power.active?.guid || "");
        setSelectedCpuProfileId((old) =>
          data.power.cpuRecommendation.profiles.some((item) => item.id === old)
            ? old
            : data.power.cpuRecommendation.profileId,
        );
      });
    if (page === "history")
      void run(async () => {
        const values = await Promise.all([hostApi.backups(), hostApi.operations()]);
        setBackups(values[0]);
        setOperations(values[1]);
      });
  }, [page, connected, status?.gameExecutable]);
  const recommended = tweaks.filter((item) => item.recommended);
  const appliedRecommended = recommended.filter((item) => item.applied).length;
  const healthScore = recommended.length
    ? Math.round((appliedRecommended / recommended.length) * 100)
    : 0;
  const selectedLocalJiuYinPreset = localJiuYinPresets.find((item) => item.id === profile) ?? null;
  const profileName = useMemo(
    () => selectedLocalJiuYinPreset?.name ??
      ({
        "shadow-only": "仅降低阴影",
        "labels-only": "仅隐藏次要标签",
        "low-loss": "低损耗组合",
        "crowd-ui": "多人场景界面精简",
      })[profile] ?? profile,
    [profile, selectedLocalJiuYinPreset],
  );
  const jiuYinChanges = jiuyinConfig?.settings
    .filter((item) => (jiuyinValues[item.id] ?? item.current ?? "") !== (item.current ?? ""))
    .map((item) => ({ id: item.id, value: jiuyinValues[item.id] ?? item.current ?? "", name: item.name })) ?? [];
  const jiuYinInvalidSettings = jiuyinConfig?.settings.filter((item) => {
    const selected = jiuyinValues[item.id] ?? item.current ?? "";
    if (selected === (item.current ?? "") || item.inputType !== "integer") return false;
    const number = Number(selected);
    return selected.trim() === "" || !Number.isInteger(number) || number < (item.minimum ?? 0) || number > (item.maximum ?? Number.MAX_SAFE_INTEGER);
  }) ?? [];
  const saveLocalJiuYinPreset = () => {
    const name = newJiuYinPresetName.trim();
    if (!jiuyinConfig || !name || jiuYinInvalidSettings.length) return;
    if (localJiuYinPresets.some((item) => item.name.toLocaleLowerCase("zh-CN") === name.toLocaleLowerCase("zh-CN"))) {
      setMessage("已经存在同名的自定义预设，请换一个名称。");
      return;
    }
    const preset: LocalJiuYinPreset = {
      id: `custom-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      name,
      createdAt: new Date().toISOString(),
      values: Object.fromEntries(jiuyinConfig.settings.map((item) => [item.id, jiuyinValues[item.id] ?? item.current ?? ""])),
    };
    const next = [preset, ...localJiuYinPresets];
    persistLocalJiuYinPresets(next);
    setLocalJiuYinPresets(next);
    setProfile(preset.id);
    setNewJiuYinPresetName("");
    setShowJiuYinPresetBuilder(false);
    setMessage(`自定义预设“${name}”已保存到本机，包含 ${Object.keys(preset.values).length} 项设置。`);
  };
  const deleteSelectedLocalJiuYinPreset = () => {
    if (!selectedLocalJiuYinPreset || !requestConfirmation("删除自定义预设", `即将删除：${selectedLocalJiuYinPreset.name}`, { confirmLabel: "删除预设", danger: true, note: "只删除软件中的本地预设，不会修改当前游戏配置。" })) return;
    const next = localJiuYinPresets.filter((item) => item.id !== selectedLocalJiuYinPreset.id);
    persistLocalJiuYinPresets(next);
    setLocalJiuYinPresets(next);
    setProfile("low-loss");
    setProfilePreview(null);
    setMessage("自定义预设已删除，当前尚未应用的编辑值保持不变。");
  };
  const toggleTweak = (id: string) =>
    setSelectedTweaks((old) =>
      old.includes(id) ? old.filter((item) => item !== id) : [...old, id],
    );
  const cpuPowerProfiles = runtime?.power.cpuRecommendation.profiles ?? [];
  const activeCpuPowerProfile =
    cpuPowerProfiles.find((item) => item.id === selectedCpuProfileId) ??
    cpuPowerProfiles.find((item) => item.recommended) ??
    cpuPowerProfiles[0];
  const selectedCpuPlanActive = Boolean(activeCpuPowerProfile && runtime?.power.active?.name === activeCpuPowerProfile.name);
  const pendingRecommended = recommended.filter((item) => !item.applied);
  const selectGpuPath = (path: string) => {
    setGpuExecutable(path);
    setGpuPreference(null);
    setGpuDriverCatalog(null);
    setSelectedGpuProfiles({});
  };
  const loadGpuTarget = async (executablePath: string, sourceLabel = "所选游戏") => {
    const normalized = executablePath.trim();
    if (!normalized) throw new Error("请先选择游戏主程序 exe。");
    const [preference, driver] = await Promise.all([
      hostApi.gpuPreference(normalized),
      hostApi.gpuDriverCatalog(normalized),
    ]);
    setGpuExecutable(normalized);
    setGpuPreference(preference);
    setGpuDriverCatalog(driver);
    setSelectedGpuProfiles(Object.fromEntries(driver.providers.map((provider) => [provider.vendor, provider.profiles.find((profile) => profile.recommended)?.id ?? provider.profiles[0]?.id ?? ""])));
    setMessage(`${sourceLabel}已设为显卡优化目标：${normalized}`);
  };
  const browseGpuTarget = async () => {
    const selected = await window.synapsexDesktop?.selectGameExecutable();
    if (selected) await loadGpuTarget(selected, "手动选择的游戏");
  };
  const useDetectedGpuTarget = async () => {
    const targets = await hostApi.monitorTargets();
    const savedMode = localStorage.getItem("synapsex.monitor.mode") === "manual" ? "manual" : "auto";
    const savedProcess = localStorage.getItem("synapsex.monitor.manualProcess") ?? "";
    const manualTarget = savedProcess ? targets.candidates.find((item) => item.processName.toLowerCase() === savedProcess.toLowerCase()) : null;
    const target = savedMode === "manual" ? manualTarget : targets.detected;
    if (!target?.path) throw new Error(savedMode === "manual" ? "实时监控绑定的游戏当前未运行，无法取得 exe 路径。请启动游戏或点击“浏览 EXE”。" : "当前没有自动识别到正在运行的游戏。请启动游戏或点击“浏览 EXE”。");
    await loadGpuTarget(target.path, savedMode === "manual" ? "实时监控绑定游戏" : "自动识别游戏");
  };

  if (!connected && page !== "settings")
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <PageHeader
          eyebrow="本地服务"
          title="桌面服务未连接"
          description="请通过打包后的 SynapseX 桌面程序启动。浏览器预览模式不会获得系统或游戏文件权限。"
          icon={Info}
        />
        <Notice tone="warn">所有检测、应用和恢复操作已锁定。</Notice>
      </motion.div>
    );

  if (page === "overview")
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <section className="prism-panel workspace-welcome mb-5 overflow-hidden rounded-[22px] p-7">
          <div className="grid gap-6 lg:grid-cols-[1fr_220px] lg:items-center">
            <div>
              <p className="text-[12px] font-semibold tracking-[0.12em] text-[var(--prism-accent-strong)]">
                SYNAPSEX / 游戏工作台
              </p>
              <h1 className="mt-3 text-[clamp(26px,3vw,36px)] font-semibold leading-tight tracking-tight">
                让每一次优化，都有据可查。
              </h1>
              <p className="mt-3 max-w-xl text-[14px] leading-6 text-slate-400">
                游戏配置、系统调校与网络诊断，集中管理。先看当前状态，再选择适合自己的改动。
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button className="prism-button-primary flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold" onClick={() => onNavigate("boost")}><Rocket size={16} />查看优化建议<ArrowRight size={15} /></button>
                <button className="prism-button-secondary flex items-center gap-2 px-4 py-2.5 text-[13px]" onClick={() => onNavigate("jiuyin")}><Gamepad2 size={16} />九阴配置中心</button>
              </div>
            </div>
            <div className="welcome-session">
              <Gamepad2 size={24} strokeWidth={1.5} />
              <p className="mt-4 text-[12px] text-slate-400">九阴真经 · 当前会话</p>
              <h2 className="mt-1 text-[21px] font-semibold">{status?.gameRunning ? "游戏正在运行" : "等待游戏启动"}</h2>
              <p className="mt-2 text-[12px] leading-5 text-slate-400">
                {status?.gameRunning ? "界面已切换为低占用，监控可手动开启。" : "现在可以管理配置；进入游戏后可进行性能诊断。"}
              </p>
            </div>
          </div>
        </section>
        <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FluidMetricCard eyebrow="优化完成度" value={healthScore} unit="%" detail={`${appliedRecommended}/${recommended.length} 项系统建议已生效`} />
          <FluidMetricCard eyebrow="待执行建议" value={pendingRecommended.length} unit="项" detail={pendingRecommended.length ? "可在一键优化中备份并应用" : "当前推荐设置已经完成"} accent="blue" />
          <FluidMetricCard eyebrow="游戏进程" value={status?.gameRunning ? "在线" : "待机"} detail={status?.gameRunning ? "已自动切换为低占用界面" : "启动游戏后开放线程诊断"} accent="violet" />
          <FluidMetricCard eyebrow="本地执行服务" value={connected ? "正常" : "断开"} detail="检测、写入与恢复均在本机完成" />
        </section>
        <div className="mb-4 mt-7 flex items-center justify-between"><h2 className="text-[16px] font-semibold">常用工具</h2><span className="text-[12px] text-slate-400">按需选择 · 独立应用 · 保留记录</span></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[
            {
              id: "boost" as const,
              icon: Rocket,
              title: "一键优化",
              text: "扫描建议项，只勾选尚未生效且可精确恢复的改动。",
              tag: recommended.every((x) => x.applied)
                ? "当前已完成"
                : "有可应用项目",
            },
            {
              id: "jiuyin" as const,
              icon: Gamepad2,
              title: "九阴真经专项",
              text: "读取并自定义九阴显示配置，支持预设叠加、应用前备份和一键恢复。",
              tag: status?.gameRunning ? "游戏运行中" : "可预览",
            },
            {
              id: "diagnostics" as const,
              icon: Activity,
              title: "性能诊断",
              text: "测量 fxgame 最忙线程、GPU 状态、后台任务和系统余量，给出证据化结论。",
              tag: status?.gameRunning ? "可测主线程" : "系统快照",
            },
            {
              id: "runtime" as const,
              icon: Cpu,
              title: "游戏进程会话",
              text: "查看游戏进程、电源方案和后台占用。",
              tag: status?.gameRunning ? "可建立会话" : "等待游戏",
            },
            {
              id: "network" as const,
              icon: Wifi,
              title: "网络优化",
              text: "应用 TCP 档位、游戏 QoS、DNS、网卡低延迟、Hosts 和 MTU。",
              tag: "网络工具",
            },
            {
              id: "system" as const,
              icon: Gauge,
              title: "系统调整",
              text: "逐项查看当前值、性能作用、功能代价和风险等级。",
              tag: tweaks.length + " 个项目",
            },
            {
              id: "startup" as const,
              icon: HardDrive,
              title: "启动项管理",
              text: "管理当前用户、整机注册表和启动文件夹的自启项目，保存原始设置。",
              tag: "带备份",
            },
            {
              id: "repair" as const,
              icon: Stethoscope,
              title: "修复中心",
              text: "受控修复 Clash 退出后的本地代理残留，不重置整个网络。",
              tag: "精确修复",
            },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={
                panel +
                " workspace-tool-card acrylic-card group flex min-h-[192px] flex-col p-5 text-left"
              }
            >
              <div className="flex items-start justify-between">
                <span className="tool-card-icon"><item.icon size={20} strokeWidth={1.6} /></span>
                <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-slate-400">
                  {item.tag}
                </span>
              </div>
              <div className="min-h-4 flex-1" />
              <h2 className="text-[17px] font-semibold">{item.title}</h2>
              <p className="mt-2 text-[13px] leading-6 text-slate-400">
                {item.text}
              </p>
              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-[13px] text-slate-300">
                <span>打开功能</span>
                <ArrowRight size={16} />
              </div>
            </button>
          ))}
        </div>
      </motion.div>
    );

  if (page === "boost")
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <PageHeader eyebrow="快速方案" title="一键优化" description="基础、最佳、最大三档，按当前电脑生成改动清单，确认后逐项备份和应用。" icon={Rocket} />
        <QuickOptimizationPanel />
        <div className="quick-related" aria-label="相关设置">
          <span>独立配置</span>
          <button onClick={() => onNavigate("system")}>显卡与系统设置<ArrowRight size={13} /></button>
          <button onClick={() => onNavigate("runtime")}>CPU 电源方案<ArrowRight size={13} /></button>
          <button onClick={() => onNavigate("network")}>网络优化<ArrowRight size={13} /></button>
          <button onClick={() => onNavigate("history")}>备份与恢复<ArrowRight size={13} /></button>
        </div>
      </motion.div>
    );

  if (page === "jiuyin")
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <PageHeader
          eyebrow="游戏配置"
          title="九阴真经配置中心"
          description="读取当前配置，逐项调整画面选项。也可以加载预设、保存自己的方案，应用前会创建备份。"
          icon={Gamepad2}
        />
        <div className={panel + " p-6"}>
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-end">
            <label className="block text-[13px] font-medium text-slate-300">游戏目录<input value={gameRoot} onChange={(e) => { setGameRoot(e.target.value); setJiuYinConfig(null); setProfilePreview(null); }} className={inputClass + " mt-2 font-mono"} /></label>
            <button className={primaryButton} disabled={busy || !gameRoot} onClick={() => void run(async () => acceptJiuYinCatalog(await hostApi.jiuYinConfigCatalog(gameRoot)))}><RefreshCw size={16} className="mr-2 inline" />读取当前配置</button>
            <button className={secondaryButton} disabled={busy || !window.synapsexDesktop} onClick={() => void run(async () => {
              const selected = await window.synapsexDesktop?.selectGameDirectory();
              if (!selected) return;
              const catalog = await hostApi.jiuYinConfigCatalog(selected);
              await window.synapsexDesktop?.saveGamePaths({ gameRoot: selected });
              setGameRoot(selected); acceptJiuYinCatalog(catalog); setMessage("游戏目录已保存。");
            })}>选择游戏目录</button>
          </div>
        </div>
        <JiuYinFpsUnlockCard gameRoot={gameRoot} />
        <div className={panel + " mt-5 p-6"}>
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
            <select
              value={profile}
              onChange={(e) => { setProfile(e.target.value); setProfilePreview(null); }}
              className={inputClass}
            >
              <optgroup label="内置预设">
                <option value="shadow-only">仅降低阴影</option>
                <option value="labels-only">仅隐藏次要标签</option>
                <option value="low-loss">低损耗组合</option>
                <option value="crowd-ui">多人场景界面精简</option>
              </optgroup>
              {localJiuYinPresets.length > 0 && <optgroup label="我的预设">{localJiuYinPresets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>}
            </select>
            <button className={primaryButton} disabled={busy || !jiuyinConfig} onClick={() => void run(async () => {
              if (selectedLocalJiuYinPreset) {
                const base = Object.fromEntries((jiuyinConfig?.settings ?? []).map((item) => [item.id, item.current ?? ""]));
                for (const item of jiuyinConfig?.settings ?? []) {
                  if (Object.prototype.hasOwnProperty.call(selectedLocalJiuYinPreset.values, item.id)) base[item.id] = selectedLocalJiuYinPreset.values[item.id];
                }
                setJiuYinValues(base);
                setProfilePreview(null);
                setMessage(`已加载自定义预设“${selectedLocalJiuYinPreset.name}”，可以继续逐项修改或预览下方差异。`);
                return;
              }
              const preview = await hostApi.previewProfile(gameRoot, profile);
              const base = Object.fromEntries((jiuyinConfig?.settings ?? []).map((item) => [item.id, item.current ?? ""]));
              for (const change of preview.changes) base[change.key] = change.proposed;
              setJiuYinValues(base);
              setProfilePreview(preview);
            })}>加载预设到当前配置</button>
            <button className={secondaryButton} disabled={busy || !jiuyinConfig} onClick={() => setShowJiuYinPresetBuilder((value) => !value)}><Plus size={16} className="mr-2 inline" />新增我的预设</button>
            <button className={secondaryButton} disabled={busy || !jiuyinConfig} onClick={() => { if (jiuyinConfig) acceptJiuYinCatalog(jiuyinConfig); setProfilePreview(null); }}>撤销未应用改动</button>
          </div>
          {showJiuYinPresetBuilder && <div className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.045] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <label className="min-w-0 flex-1"><span className="mb-2 block text-[12px] text-slate-300">自定义预设名称</span><input maxLength={32} className={inputClass + " w-full"} placeholder="例如：驻地战清晰布局" value={newJiuYinPresetName} onChange={(event) => setNewJiuYinPresetName(event.target.value)} /></label>
              <button className={primaryButton} disabled={!newJiuYinPresetName.trim() || jiuYinInvalidSettings.length > 0} onClick={saveLocalJiuYinPreset}><Save size={16} className="mr-2 inline" />保存当前 15 项编辑值</button>
              <button className={secondaryButton} onClick={() => { setShowJiuYinPresetBuilder(false); setNewJiuYinPresetName(""); }}>取消</button>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-slate-400">保存的是“应用后设置”列中的全部值，不会立即写入游戏；以后从“我的预设”选择并加载即可。</p>
          </div>}
          {selectedLocalJiuYinPreset && <div className="mt-4 flex flex-col gap-3 rounded-xl border border-violet-300/15 bg-violet-300/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between"><div><strong className="text-[13px] text-violet-100">我的预设：{selectedLocalJiuYinPreset.name}</strong><p className="mt-1 text-[11px] text-slate-400">包含 {Object.keys(selectedLocalJiuYinPreset.values).length} 项设置 · 保存于 {new Date(selectedLocalJiuYinPreset.createdAt).toLocaleString("zh-CN", { hour12: false })}</p></div><button className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300/20 px-4 py-2.5 text-[12px] text-rose-100 transition hover:bg-rose-300/10" onClick={deleteSelectedLocalJiuYinPreset}><Trash2 size={15} />删除此预设</button></div>}
          {profilePreview && (
            <div className="mt-4 rounded-xl border border-sky-300/20 bg-sky-300/[0.06] p-4 text-[12px] leading-6 text-sky-100">
              已加载“{profileName}”：{profilePreview.expectedTarget}。{profilePreview.tradeoff}。你仍可在下方逐项修改。
            </div>
          )}
        </div>
        {busy && !jiuyinConfig ? <div className="mt-5"><Loading /></div> : jiuyinConfig && <>
          <div className={panel + " mt-5 overflow-hidden"}>
            <div className="flex flex-col gap-2 border-b border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-[17px] font-semibold">当前可控游戏配置</h2><p className="mt-1 text-[12px] text-slate-500">读取时间：{jiuyinConfig.capturedAt} · 已选择修改 {jiuYinChanges.length} 项</p></div><span className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-slate-300">当前值来自游戏 INI</span></div>
            <div className="hidden grid-cols-[minmax(140px,1fr)_minmax(160px,1.4fr)_100px_150px] gap-4 bg-white/[0.05] px-5 py-3 text-[11px] font-semibold text-slate-300 lg:grid"><span>选项</span><span>作用说明</span><span>当前设置</span><span>应用后设置</span></div>
            {jiuyinConfig.settings.map((item) => {
              const selected = jiuyinValues[item.id] ?? item.current ?? "";
              const currentLabel = item.values.find((option) => option.value === item.current)?.label ?? `数值 ${item.current ?? "缺失"}`;
              const changed = selected !== (item.current ?? "");
              const invalid = jiuYinInvalidSettings.some((invalidItem) => invalidItem.id === item.id);
              return <div key={item.id} className="grid gap-3 border-t border-white/[0.08] px-5 py-5 lg:grid-cols-[minmax(140px,1fr)_minmax(160px,1.4fr)_100px_150px] lg:items-center lg:gap-4"><div><div className="flex flex-wrap items-center gap-2"><p className="text-[14px] font-semibold">{item.name}</p>{item.advanced && <span className="rounded-full border border-amber-300/20 bg-amber-300/[0.06] px-2 py-0.5 text-[10px] text-amber-100">高级自定义</span>}</div></div><p className="text-[12px] leading-5 text-slate-300">{item.description}{item.inputType === "integer" && <span className="mt-1 block text-[11px] text-slate-500">允许整数：{item.minimum}–{item.maximum}</span>}</p><span className="w-fit rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-[12px]">{item.inputType === "integer" ? item.current ?? "—" : currentLabel}</span>{item.inputType === "integer" ? <div><input aria-label={`${item.name}：应用后设置`} type="number" min={item.minimum ?? undefined} max={item.maximum ?? undefined} step={item.step ?? 1} className={inputClass + (invalid ? " border-red-400/60" : changed ? " border-emerald-300/40" : "")} value={selected} onChange={(event) => { setJiuYinValues((old) => ({ ...old, [item.id]: event.target.value })); setProfilePreview(null); }} />{invalid && <p className="mt-1 text-[10px] text-red-300">请输入 {item.minimum}–{item.maximum} 的整数</p>}</div> : <select aria-label={`${item.name}：应用后设置`} className={inputClass + (changed ? " border-emerald-300/40" : "")} value={selected} onChange={(event) => { setJiuYinValues((old) => ({ ...old, [item.id]: event.target.value })); setProfilePreview(null); }}>{item.current !== null && !item.values.some((option) => option.value === item.current) && <option value={item.current}>保留当前设置</option>}{item.values.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}</div>;
            })}
          </div>
          <div className={panel + " mt-5 p-6"}>
            <Notice tone="ok">{jiuyinConfig.note}</Notice>
            <div className="mt-4"><Notice tone="warn">视野范围、扩展视野、同屏对象数量和最大镜头距离已开放自定义；预设不会主动改动这四项，只有数值与当前值不同时才会写入。</Notice></div>
            {status?.gameRunning && <div className="mt-4"><Notice tone="warn">游戏正在运行。当前配置可以读取和编辑，但应用与恢复会锁定，防止游戏退出时覆盖文件。</Notice></div>}
            <div className="mt-4 flex flex-wrap gap-3"><button className={primaryButton} disabled={busy || status?.gameRunning || jiuYinChanges.length === 0 || jiuYinInvalidSettings.length > 0} onClick={() => {
              const names = jiuYinChanges.map((item) => item.name).join("、");
              if (!confirmAction("应用自定义九阴配置", `将修改 ${jiuYinChanges.length} 项：${names}。应用前会自动备份当前配置。`)) return;
              void run(async () => { const result = await hostApi.applyCustomJiuYinSettings(gameRoot, jiuYinChanges.map(({ id, value }) => ({ id, value }))); acceptJiuYinCatalog(result.catalog); setProfilePreview(null); setMessage(`九阴配置已应用 ${result.changedCount} 项，备份编号：${result.backupId}`); });
            }}>备份并应用所选改动（{jiuYinChanges.length}）</button><button className={secondaryButton} disabled={busy || status?.gameRunning} onClick={() => {
              if (!confirmAction("恢复九阴配置", "将恢复最近一次由 SynapseX 创建的九阴配置备份。")) return;
              void run(async () => { const result = await hostApi.restoreLatest(gameRoot); acceptJiuYinCatalog(await hostApi.jiuYinConfigCatalog(gameRoot)); setProfilePreview(null); setMessage("已恢复九阴备份：" + result.backupId); });
            }}><Undo2 size={16} className="mr-2 inline" />恢复最近备份</button></div>
            {jiuYinChanges.length === 0 && <p className="mt-3 text-[12px] text-slate-500">当前没有尚未应用的改动。可以逐项选择，或先加载上方预设。</p>}
            {jiuYinInvalidSettings.length > 0 && <p className="mt-3 text-[12px] text-red-300">有 {jiuYinInvalidSettings.length} 个数值超出允许范围，修正后才能应用。</p>}
          </div>
        </>}
        {message && <ResultMessage text={message} />}
      </motion.div>
    );

  if (page === "diagnostics")
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <PageHeader
          eyebrow="九阴真经"
          title="性能诊断"
          description="从总 CPU、GPU、内存进一步下钻到 fxgame 的线程 CPU 时间。最忙线程接近 100% 时，即使总 CPU 看起来不高，游戏也可能已经被主线程限制。"
          icon={Activity}
        />
        {busy && !diagnostic ? (
          <Loading />
        ) : (
          diagnostic && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="系统总 CPU" value={diagnostic.cpu.totalUtilizationPercent === null ? "—" : `${diagnostic.cpu.totalUtilizationPercent}%`} />
                <Metric label="内存占用" value={`${diagnostic.memory.usedPercent}%`} />
                <Metric label="GPU 占用" value={diagnostic.gpu ? `${diagnostic.gpu.gpuUtilizationPercent}%` : "未识别"} />
                <Metric label="fxgame" value={diagnostic.game ? `运行中 · ${diagnostic.game.threads} 线程` : "未运行"} />
              </div>
              <div className="mt-4"><Notice>{diagnostic.note}</Notice></div>
              {diagnostic.pendingReboot.pending && <div className="mt-4"><Notice tone="warn">系统存在待重启操作。更新、驱动或文件替换尚未收尾时，性能对比可能不稳定。</Notice></div>}
              <div className={panel + " mt-5 p-6"}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="text-[18px] font-semibold">三秒主线程压力测量</h2><p className="mt-2 text-[13px] leading-6 text-slate-400">请站在需要比较的人多场景，镜头保持不动。测量过程只读取线程 CPU 时间，不注入游戏、不抓取封包。</p></div><div className="flex shrink-0 flex-wrap gap-3"><button className={primaryButton} disabled={busy || !diagnostic.game} onClick={() => void run(async () => setThreadPressure(await hostApi.measureThreadPressure(3)))}>测量主线程压力</button><button className={secondaryButton} disabled={busy} onClick={() => void run(async () => setDiagnostic(await hostApi.diagnosticAudit()))}><RefreshCw size={16} className="mr-2 inline" />刷新系统快照</button></div></div>
                {!diagnostic.game && <div className="mt-4"><Notice tone="warn">打开九阴真经后才能测量 fxgame 线程；系统快照仍然有效。</Notice></div>}
              </div>
              {threadPressure && (
                <div className="mt-5 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Metric label="最忙线程占一个核心" value={threadPressure.measurementValid ? `${threadPressure.hottestThread?.oneCoreUtilizationPercent ?? 0}%` : "采样无效"} />
                    <Metric label="游戏等效使用核心" value={threadPressure.equivalentCpuCoresUsed} />
                    <Metric label="最忙线程占游戏 CPU" value={threadPressure.measurementValid ? `${threadPressure.dominantThreadCpuSharePercent}%` : "—"} />
                    <Metric label="同期 GPU 占用" value={threadPressure.gpu ? `${threadPressure.gpu.gpuUtilizationPercent}%` : "未识别"} />
                  </div>
                  <Notice tone={!threadPressure.measurementValid || threadPressure.classification === "main-thread-saturated" ? "warn" : "info"}>
                    <b>{!threadPressure.measurementValid ? "线程采样无效：" : threadPressure.classification === "main-thread-saturated" ? "主线程饱和：" : threadPressure.classification === "main-thread-heavy" ? "主线程偏重：" : "本样本未饱和："}</b>
                    {threadPressure.explanation}
                    <span className="mt-1 block text-[11px] opacity-70">线程明细覆盖进程 CPU：{threadPressure.threadCpuAccountedPercent}% · 可读线程 {threadPressure.readableThreadCount} 个 · 活跃线程 {threadPressure.activeThreadCount} 个</span>
                  </Notice>
                  {threadPressure.measurementValid && (
                    <div className={panel + " overflow-hidden"}>
                      <div className="grid grid-cols-[1fr_1fr_1fr] gap-3 bg-white/[0.05] px-5 py-3 text-[12px] font-semibold text-slate-300"><span>线程 ID</span><span>单核心占用</span><span>CPU 时间增量</span></div>
                      {threadPressure.topThreads.map((item) => <div key={item.id} className="grid grid-cols-[1fr_1fr_1fr] gap-3 border-t border-white/[0.08] px-5 py-3 text-[12px]"><span className="font-mono">{item.id}</span><span>{item.oneCoreUtilizationPercent}%</span><span>{item.cpuMilliseconds} ms</span></div>)}
                    </div>
                  )}
                  <Notice>{threadPressure.limitation}</Notice>
                </div>
              )}
              <div className="mt-5 grid gap-4 xl:grid-cols-3"><div className={panel + " p-5"}><p className="text-[12px] text-slate-400">处理器</p><p className="mt-2 text-[15px] font-semibold">{diagnostic.cpu.name}</p><p className="mt-2 text-[12px] text-slate-500">{diagnostic.cpu.physicalCores} 核 · {diagnostic.cpu.logicalProcessors} 线程</p></div><div className={panel + " p-5"}><p className="text-[12px] text-slate-400">显示设备</p><p className="mt-2 text-[15px] font-semibold">{diagnostic.gpu?.name ?? "未识别 NVIDIA GPU"}</p><p className="mt-2 text-[12px] text-slate-500">{diagnostic.gpu ? `${diagnostic.gpu.temperatureC}°C · ${diagnostic.gpu.memoryUsedMB}/${diagnostic.gpu.memoryTotalMB} MB` : "—"}</p></div><div className={panel + " p-5"}><p className="text-[12px] text-slate-400">游戏盘余量</p><p className="mt-2 text-[15px] font-semibold">{diagnostic.gameDrive.name} · {diagnostic.gameDrive.freeGB ?? "—"} GB 可用</p><p className="mt-2 text-[12px] text-slate-500">磁盘余量过低会影响缓存和更新，但通常不是人多掉帧的主因。</p></div></div>
              <div className="mt-5 grid gap-4 xl:grid-cols-3"><details className={panel + " p-5"}><summary className="cursor-pointer text-[15px] font-semibold">fxgame IFEO：{diagnostic.ifeo.found ? "检测到" : "未检测到"}</summary><p className="mt-3 text-[12px] leading-5 text-slate-400">{diagnostic.ifeo.note}</p></details><details className={panel + " p-5"}><summary className="cursor-pointer text-[15px] font-semibold">第三方计划任务：{diagnostic.scheduledTasks.count}</summary><p className="mt-3 text-[12px] leading-5 text-slate-400">{diagnostic.scheduledTasks.note}</p><div className="mt-3 max-h-64 space-y-2 overflow-auto">{diagnostic.scheduledTasks.items.map((item) => <p key={item.taskPath + item.taskName} className="rounded-lg bg-black/25 px-3 py-2 text-[11px]">{item.taskPath}{item.taskName} · {item.state}</p>)}</div></details><details className={panel + " p-5"}><summary className="cursor-pointer text-[15px] font-semibold">当前用户 AppX：{diagnostic.appx.count}</summary><p className="mt-3 text-[12px] leading-5 text-slate-400">{diagnostic.appx.note}</p><div className="mt-3 max-h-64 space-y-2 overflow-auto">{diagnostic.appx.items.map((item) => <p key={item.name} className="rounded-lg bg-black/25 px-3 py-2 text-[11px]">{item.name} · {item.version}</p>)}</div></details></div>
            </>
          )
        )}
        {message && <ResultMessage text={message} />}
      </motion.div>
    );

  if (page === "runtime")
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <PageHeader
          eyebrow="进程与电源"
          title="游戏进程会话"
          description="查看游戏进程状态，选择和管理 Windows 电源方案。"
          icon={Cpu}
        />
        {busy && !runtime ? (
          <Loading />
        ) : (
          runtime && (
            <>
              {!runtime.game ? (
                <Notice tone="warn">
                  当前没有检测到
                  fxgame.exe。打开游戏后点击“重新检测”，即可查看进程状态。
                </Notice>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric label="游戏进程 ID" value={runtime.game.id} />
                  <Metric label="逻辑处理器" value={runtime.game.logicalProcessorCount} />
                  <Metric
                    label="进程内存"
                    value={`${runtime.game.workingSetMB} MB`}
                  />
                  <Metric
                    label="本次运行"
                    value={runtime.game.ageMinutes == null ? "无法读取" : `${runtime.game.ageMinutes} 分钟`}
                  />
                </div>
              )}
              <div className="mt-5">
                <div className={panel + " p-6"}>
                  <div className="flex items-center gap-3">
                    <Gauge size={20} />
                    <h2 className="text-[17px] font-semibold">
                      Windows 电源方案
                    </h2>
                  </div>
                  <p className="mt-3 text-[13px] leading-6 text-slate-300">
                    当前：
                    <b className="text-white">
                      {runtime.power.active?.name ?? "未识别"}
                    </b>
                    。选择本机已有方案时会保存原 GUID，可精确恢复。
                  </p>
                  <select
                    className={inputClass + " mt-4"}
                    value={selectedPower}
                    onChange={(event) => setSelectedPower(event.target.value)}
                  >
                    {runtime.power.items.map((item) => (
                      <option key={item.guid} value={item.guid}>
                        {item.name}
                        {item.active ? "（当前）" : ""}
                      </option>
                    ))}
                  </select>
                  <p className="mt-3 text-[12px] leading-5 text-slate-400">
                    {runtime.power.note}
                  </p>
                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <button
                      className={primaryButton}
                      disabled={
                        busy ||
                        !selectedPower ||
                        selectedPower === runtime.power.active?.guid
                      }
                      onClick={() => {
                        const planName = runtime.power.items.find((item) => item.guid === selectedPower)?.name ?? selectedPower;
                        if (!confirmAction("切换 Windows 电源方案", `将从“${runtime.power.active?.name ?? "当前方案"}”切换到“${planName}”。`)) return;
                        void run(async () => {
                          const result =
                            await hostApi.applyPowerScheme(selectedPower);
                          setRuntime((old) =>
                            old ? { ...old, power: result.power } : old,
                          );
                          setMessage(
                            "电源方案已切换，备份编号：" + result.backupId,
                          );
                        });
                      }}
                    >
                      备份并切换
                    </button>
                    <button
                      className={secondaryButton}
                      disabled={busy}
                      onClick={() => {
                        if (!confirmAction("恢复之前的电源方案", "将切回最近一次切换前保存的电源方案。")) return;
                        void run(async () => {
                          const result = await hostApi.restorePowerScheme();
                          setRuntime((old) =>
                            old ? { ...old, power: result.power } : old,
                          );
                          setSelectedPower(result.power.active?.guid ?? "");
                          setMessage(
                            "已恢复之前的电源方案：" + result.backupId,
                          );
                        });
                      }}
                    >
                      恢复之前方案
                    </button>
                  </div>
                  {selectedPower === runtime.power.active?.guid && <p className="mt-3 text-[12px] text-slate-500">当前下拉框选择的就是正在使用的方案，因此“备份并切换”无需执行。</p>}
                </div>
              </div>
              <PowerLibraryCard library={runtime.power.library} busy={busy} onApply={(plan, full, risk) => {
                if (!confirmAction("导入并启用原始电源计划", `将备份“${runtime.power.active?.name ?? "当前方案"}”，再启用“${plan.name}”。这是整套原始计划，包含电池与设备参数；未验证本机适配。`)) return;
                void run(async () => {
                  const result = await hostApi.applyPowerLibraryPlan(plan.id, full, risk);
                  setRuntime(old => old ? { ...old, power: result.power } : old);
                  setSelectedPower(result.power.active?.guid ?? "");
                  setMessage(`已导入并启用“${plan.name}”，备份编号：${result.backupId}`);
                });
              }} onRestore={() => {
                if (!confirmAction("恢复之前的电源方案", "将切回最近一次手动切换或导入前保存的方案。已导入的计划会保留在 Windows 列表中。")) return;
                void run(async () => {
                  const result = await hostApi.restorePowerScheme();
                  setRuntime(old => old ? { ...old, power: result.power } : old);
                  setSelectedPower(result.power.active?.guid ?? "");
                  setMessage("已恢复之前的电源方案：" + result.backupId);
                });
              }} />
              <div className={panel + " mt-5 overflow-hidden"}>
                <div className="border-b border-white/[0.08] p-5 sm:p-6">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04]"><Cpu size={19} /></span>
                        <div>
                          <h2 className="text-[17px] font-semibold">CPU 专属电源方案</h2>
                          <p className="mt-1 truncate text-[12px] text-slate-400">{runtime.power.cpuRecommendation.cpuName} · {runtime.power.cpuRecommendation.physicalCores} 核 / {runtime.power.cpuRecommendation.logicalProcessors} 线程</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[11px]">
                      <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-3 py-1.5 text-emerald-100">{runtime.power.cpuRecommendation.architectureLabel} · {runtime.power.cpuRecommendation.confidence}</span>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-slate-300">{runtime.power.cpuRecommendation.basePlan}</span>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-slate-300">仅修改插电 CPU</span>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3"><span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">拓扑匹配</span><p className="mt-1 text-[14px] font-semibold text-white">{cpuPowerProfiles.length} 个本机适配方案</p></div>
                    <div className="rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3"><span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">保留机制</span><p className="mt-1 text-[14px] font-semibold text-white">{runtime.power.cpuRecommendation.retainedMechanisms ?? "保留平台默认"}</p></div>
                    <div className="rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3"><span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">回滚方式</span><p className="mt-1 text-[14px] font-semibold text-white">恢复原 GUID 并删除副本</p></div>
                  </div>
                  <details className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-3">
                    <summary className="cursor-pointer text-[12px] font-semibold text-slate-300">适配信息与调整范围</summary>
                    <div className="mt-3 grid gap-2 text-[12px] leading-5 text-slate-400 lg:grid-cols-2">
                      <p>{runtime.power.cpuRecommendation.reason}</p>
                      <p>{runtime.power.cpuRecommendation.analysisSummary}</p>
                      <p>{runtime.power.cpuRecommendation.rejectedSummary}</p>
                      <p>{runtime.power.cpuRecommendation.skippedPolicy} 作用范围：{runtime.power.cpuRecommendation.scope}</p>
                    </div>
                  </details>
                </div>
                <div className="grid gap-3 border-b border-white/[0.08] bg-black/10 p-5 lg:grid-cols-2">
                  {cpuPowerProfiles.map((profile) => {
                    const selected = activeCpuPowerProfile?.id === profile.id;
                    return (
                      <button
                        key={profile.id}
                        type="button"
                        disabled={busy}
                        onClick={() => setSelectedCpuProfileId(profile.id)}
                        className={`relative rounded-xl border p-4 text-left transition ${selected ? "border-emerald-300/45 bg-emerald-300/[0.09] shadow-[0_0_30px_rgba(52,211,153,0.06)]" : "border-white/[0.09] bg-black/20 hover:border-white/20 hover:bg-white/[0.025]"}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2"><CheckCircle2 size={15} className={selected ? "shrink-0 text-emerald-300" : "shrink-0 text-slate-600"} /><strong className="truncate text-[14px] text-white">{profile.name}</strong></div>
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] ${profile.recommended ? "bg-emerald-300/10 text-emerald-200" : "bg-amber-300/10 text-amber-100"}`}>{profile.badge}</span>
                        </div>
                        <p className="mt-3 min-h-10 text-[12px] leading-5 text-slate-300">{profile.description}</p>
                        <div className="mt-3 border-t border-white/[0.07] pt-3">
                          <p className="text-[11px] leading-5 text-slate-500">{profile.tradeoff}</p>
                          <p className="mt-2 text-[10px] leading-4 text-cyan-100/65">{profile.source}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="p-5 sm:p-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div><p className="text-[13px] font-semibold text-white">所选方案的具体参数</p><p className="mt-1 text-[11px] text-slate-500">共 {activeCpuPowerProfile?.settings.length ?? runtime.power.cpuRecommendation.settings.length} 项；表格内部可滚动。</p></div>
                    <span className="w-fit rounded-lg border border-emerald-300/15 bg-emerald-300/[0.06] px-3 py-2 text-[11px] text-emerald-100">{activeCpuPowerProfile?.name ?? runtime.power.cpuRecommendation.planName}</span>
                  </div>
                  <div className="mt-4 max-h-[420px] overflow-y-auto rounded-xl border border-white/[0.09] bg-black/20">
                    <div className="config-table-heading sticky top-0 z-10 hidden grid-cols-[minmax(145px,0.8fr)_minmax(115px,0.5fr)_minmax(240px,1.35fr)_minmax(210px,1fr)] gap-3 border-b border-white/[0.09] px-4 py-3 text-[11px] font-semibold text-slate-300 backdrop-blur lg:grid">
                      <span>参数</span><span>应用后</span><span>作用</span><span>注意事项</span>
                    </div>
                    {(activeCpuPowerProfile?.settings ?? runtime.power.cpuRecommendation.settings).map((setting) => (
                      <div key={setting.key} className="grid grid-cols-1 gap-1.5 border-t border-white/[0.06] px-4 py-3 text-[12px] leading-5 first:border-t-0 lg:grid-cols-[minmax(145px,0.8fr)_minmax(115px,0.5fr)_minmax(240px,1.35fr)_minmax(210px,1fr)] lg:gap-3">
                        <span className="font-semibold text-white">{setting.name}</span>
                        <span className="font-mono text-emerald-200">{setting.valueLabel}</span>
                        <span className="text-slate-300">{setting.purpose}</span>
                        <span className="text-slate-500">{setting.tradeoff}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-col gap-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.035] p-4 xl:flex-row xl:items-center xl:justify-between">
                    <p className="max-w-2xl text-[11px] leading-5 text-amber-100/80">这些是按 CPU 拓扑匹配的候选参数，并非已验证的提帧方案。请固定场景对比帧时间、1% Low、功耗与温度；不适合时可恢复原方案。</p>
                    <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
                    <button className={primaryButton} disabled={busy || selectedCpuPlanActive || !activeCpuPowerProfile} onClick={() => {
                      if (!activeCpuPowerProfile || !confirmAction("创建 CPU 专属电源方案", `将创建并启用“${activeCpuPowerProfile.name}”，复制${runtime.power.cpuRecommendation.basePlan}并写入表格中的 ${activeCpuPowerProfile.settings.length} 个插电处理器参数。未列参数（含电池）继承基准，可能不同于当前方案；支持恢复。`)) return;
                      void run(async () => {
                      const result = await hostApi.applyCpuPowerPlan(activeCpuPowerProfile.id);
                      setRuntime((old) => old ? { ...old, power: result.power } : old);
                      setSelectedPower(result.power.active?.guid ?? "");
                      setMessage(`已创建并切换 CPU 专属方案，写入 ${result.appliedSettings.length} 项，备份编号：${result.backupId}${result.skippedSettings.length ? `；另有 ${result.skippedSettings.length} 项因系统不支持而跳过` : ""}`);
                      });
                    }}>{selectedCpuPlanActive ? "当前正在使用此方案" : activeCpuPowerProfile ? "创建并切换所选方案" : "本机暂无兼容方案"}</button>
                    <button className={secondaryButton} disabled={busy} onClick={() => {
                      if (!confirmAction("恢复并移除 CPU 专属方案", "将切回创建前的电源方案，并只删除最近由 SynapseX 创建的方案副本。")) return;
                      void run(async () => {
                      const result = await hostApi.restoreCpuPowerPlan();
                      setRuntime((old) => old ? { ...old, power: result.power } : old);
                      setSelectedPower(result.power.active?.guid ?? "");
                      setMessage(`已恢复创建前的方案${result.removed ? "，并删除 SynapseX 创建的副本" : ""}：${result.backupId}`);
                      });
                    }}>恢复并移除最近方案</button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                <InfoCard
                  icon={Cpu}
                  title="为什么不强制绑核"
                  text={runtime.guidance.affinity}
                />
                <InfoCard
                  icon={Info}
                  title="预期上限"
                  text={runtime.guidance.expectation}
                />
              </div>
              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                <details className={panel + " p-5"}>
                  <summary className="cursor-pointer text-[15px] font-semibold">
                    覆盖层与常驻组件（{runtime.overlays.length} 类）
                  </summary>
                  <div className="mt-4 space-y-2">
                    {runtime.overlays.length ? (
                      runtime.overlays.map((item) => (
                        <div
                          key={item.processName}
                          className="flex justify-between rounded-lg bg-black/25 px-3 py-3 text-[12px]"
                        >
                          <span>
                            {item.displayName} · {item.count} 个
                          </span>
                          <span className="text-slate-400">
                            {item.totalWorkingSetMB} MB
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-[13px] text-slate-500">
                        未发现已知覆盖层进程
                      </p>
                    )}
                  </div>
                </details>
                <details className={panel + " p-5"}>
                  <summary className="cursor-pointer text-[15px] font-semibold">
                    大内存后台进程（{runtime.largeBackgroundProcesses.length}）
                  </summary>
                  <div className="mt-4 space-y-2">
                    {runtime.largeBackgroundProcesses.map((item) => (
                      <div
                        key={item.id}
                        className="flex justify-between rounded-lg bg-black/25 px-3 py-3 text-[12px]"
                      >
                        <span>
                          {item.processName} · PID {item.id}
                        </span>
                        <span className="text-slate-400">
                          {item.workingSetMB} MB
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            </>
          )
        )}
        <div className="mt-5">
          <button
            className={secondaryButton}
            disabled={busy}
            onClick={() =>
              void run(async () => setRuntime(await hostApi.runtimeAudit()))
            }
          >
            <RefreshCw size={16} className="mr-2 inline" />
            重新检测
          </button>
        </div>
        {message && <ResultMessage text={message} />}
      </motion.div>
    );

  if (page === "system")
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <SystemExtensions sectionRequest={sectionRequest} header={<PageHeader
          eyebrow="Windows 设置"
          title="系统调整"
          description="管理游戏、系统与设备设置。修改前备份，支持恢复原值。"
          icon={Gauge}
        />}>
        <SystemOverviewStrip data={systemAudit} loading={busy}>
            {busy && !systemAudit ? (
              <Loading />
            ) : (
              <ValueRows data={systemAudit} labels={systemLabels} />
            )}
        </SystemOverviewStrip>
        <section className="system-preferences" aria-labelledby="game-preferences-title">
          <header className="system-section-heading"><div><h2 id="game-preferences-title">Windows 偏好设置</h2><p>游戏、后台与桌面设置，选择后统一应用。</p></div><span>{tweaks.filter(item => item.applied).length} / {tweaks.length} 已生效</span></header>
            <div className="system-preferences-list">
              {tweaks.map((item) => (
                <TweakCard
                  key={item.id}
                  tweak={item}
                  selected={selectedTweaks.includes(item.id)}
                  onToggle={() => toggleTweak(item.id)}
                />
              ))}
            </div>
        <div className="system-selection-footer">
          <div className="flex flex-col gap-3 xl:flex-row">
            <button
              className={primaryButton}
              disabled={busy || !selectedTweaks.length}
              onClick={() => {
                if (!confirmAction("应用系统调整", `将应用已选择的 ${selectedTweaks.length} 项设置。`)) return;
                void run(async () => {
                  const result = await hostApi.applySystem(selectedTweaks);
                  setTweaks(result.catalog);
                  setSelectedTweaks([]);
                  setMessage("系统调整已应用，备份编号：" + result.backupId);
                });
              }}
            >
              备份并应用{selectedTweaks.length > 0 ? `（${selectedTweaks.length}）` : ""}
            </button>
            <button
              className={secondaryButton}
              disabled={busy}
              onClick={() => {
                if (!confirmAction("恢复系统调整", "将恢复最近一次系统调整备份中的原始值。")) return;
                void run(async () => {
                  const result = await hostApi.restoreSystem();
                  setTweaks(result.catalog);
                  setMessage("系统调整已恢复：" + result.backupId);
                });
              }}
            >
              <RotateCcw size={16} className="mr-2 inline" />
              恢复最近一次
            </button>
          </div>
          {!selectedTweaks.length && <p className="mt-3 text-[12px] text-slate-500">选择项目后可应用；已生效项目无需重复修改。</p>}
          {message && <ResultMessage text={message} />}
        </div>
        </section>
        {systemReadiness && (
          <div className="mt-5 space-y-5">
            <details className="system-diagnostics">
            <summary><Activity size={16} /><span>运行诊断<small>分页文件、磁盘健康与后台占用</small></span><span>展开查看</span></summary>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="分页文件" value={systemReadiness.memory.pageFiles.length ? `${systemReadiness.memory.pageFiles.reduce((sum, item) => sum + item.allocatedMB, 0)} MB` : "未检测到"} />
              <Metric label="磁盘健康" value={systemReadiness.disks.every((item) => item.health === "Healthy") ? "正常" : "需要检查"} />
              <Metric label="SSD TRIM" value={systemReadiness.trim.enabled ? "已启用" : "未确认"} />
              <Metric label="DPC / 中断" value={`${systemReadiness.scheduler.dpcPercent ?? "—"}% / ${systemReadiness.scheduler.interruptPercent ?? "—"}%`} />
            </div>
            <Notice>{systemReadiness.recommendations.join(" ")} {systemReadiness.note}</Notice>
            <div className="space-y-4">
              <div className={panel + " p-6"}>
                <div className="flex items-center justify-between gap-3"><div><h2 className="text-[17px] font-semibold">三秒后台抢占采样</h2><p className="mt-2 text-[12px] leading-5 text-slate-400">测量游戏之外的 CPU、DPC 和硬件中断占用，用来发现驱动尖峰或后台程序抢占。</p></div><button className={secondaryButton} disabled={busy} onClick={() => void run(async () => setSystemContention(await hostApi.systemContention(3)))}>开始采样</button></div>
                {systemContention && <div className="mt-4"><div className="grid grid-cols-3 gap-2"><Metric label="平均 CPU" value={`${systemContention.averageCpuPercent ?? "—"}%`} /><Metric label="平均 DPC" value={`${systemContention.averageDpcPercent ?? "—"}%`} /><Metric label="平均中断" value={`${systemContention.averageInterruptPercent ?? "—"}%`} /></div><p className="mt-3 text-[12px] leading-5 text-slate-400">结论：{systemContention.classification === "driver-interrupt-pressure" ? "驱动／中断压力偏高" : systemContention.classification === "cpu-contention" ? "系统 CPU 竞争明显" : "本次未发现明显系统抢占"}。{systemContention.note}</p><div className="mt-3 max-h-52 space-y-1 overflow-auto">{systemContention.topProcesses.slice(0, 8).map((item) => <div key={`${item.processId}-${item.processName}`} className="flex justify-between rounded-lg bg-black/25 px-3 py-2 text-[11px]"><span>{item.processName} · PID {item.processId}</span><span className="text-slate-400">整机 {item.machineCpuPercent}% · 单核 {item.oneCorePercent}%</span></div>)}</div></div>}
              </div>
            </div>
            </details>
            <header className="system-section-heading"><div><h2>显卡与显示</h2><p>选择游戏程序，调整显卡偏好和驱动设置。</p></div></header>
            <div className="space-y-4">
              <div className={panel + " p-6"}>
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between"><div><h2 className="text-[17px] font-semibold">指定游戏使用高性能 GPU</h2><p className="mt-2 max-w-3xl text-[12px] leading-5 text-slate-400">让 Windows 为指定游戏程序优先选择高性能显卡。此项适用于同时存在核显、独显或虚拟显示设备的电脑。</p></div>{gpuPreference && <span className="w-fit rounded-full border border-white/10 px-3 py-1 text-[11px] text-slate-300">{gpuPreference.applied ? "高性能 GPU 已指定" : gpuPreference.mode === "power-saving" ? "当前为节能 GPU" : "Windows 自动选择"}</span>}</div>
                <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-end">
                  <label className="min-w-0 flex-1 text-[12px] text-slate-400">游戏程序路径<input className={inputClass + " mt-2 font-mono text-[12px]"} value={gpuExecutable} disabled={busy} onChange={(event) => selectGpuPath(event.target.value)} placeholder="选择或粘贴游戏 .exe 完整路径" /></label>
                  <div className="flex flex-wrap gap-2">
                    <ExecutablePickerButton className={secondaryButton} disabled={busy} onSelect={selectGpuPath} onError={setMessage}/>
                    <button type="button" className={secondaryButton} disabled={busy || !gpuExecutable.trim()} onClick={() => void run(async () => setGpuPreference(await hostApi.gpuPreference(gpuExecutable.trim())))}>检查当前状态</button>
                  </div>
                </div>
                <p className="mt-2 text-[12px] text-slate-400">点击“浏览 EXE”，进入游戏安装文件夹后选择游戏主程序；选择后可检查状态，不会自动应用设置。</p>
                {gpuPreference && <div className="mt-3"><Notice tone={gpuPreference.applied ? "ok" : "info"}>{gpuPreference.note}</Notice></div>}
                <div className="mt-4 flex flex-wrap gap-2"><button className={primaryButton} disabled={busy || !gpuExecutable} onClick={() => { if (!confirmAction("指定高性能 GPU", `将为 ${gpuExecutable} 写入 Windows 每应用高性能 GPU 首选项。`)) return; void run(async () => { const result = await hostApi.applyGpuPreference(gpuExecutable); setGpuPreference(result.state); setMessage("高性能 GPU 首选项已应用，备份编号：" + result.backupId); }); }}>备份并应用</button><button className={secondaryButton} disabled={busy} onClick={() => { if (!confirmAction("恢复 GPU 首选项", "将恢复最近一次每游戏 GPU 首选项备份。")) return; void run(async () => { const result = await hostApi.restoreGpuPreference(); setGpuExecutable(result.state.executablePath); setGpuPreference(result.state); setMessage("GPU 首选项已恢复：" + result.backupId); }); }}>恢复最近设置</button></div>
              </div>
              <div className={panel + " p-6"}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div><h2 className="text-[17px] font-semibold">独显电脑禁用核显</h2><p className="mt-2 max-w-3xl text-[12px] leading-5 text-slate-400">识别 Intel 核显和 AMD APU 核显。只有同时存在已启用独显、核显未承担桌面输出且不是混合显卡笔记本时，才允许执行。操作只禁用 Windows 显示设备，不卸载驱动、不修改 BIOS。</p></div>
                  <button className={secondaryButton} disabled={busy} onClick={() => void run(async () => setDisplayAdapterCatalog(await hostApi.displayAdapters()))}><RefreshCw size={15} className="mr-2 inline" />重新检测</button>
                </div>
                {!displayAdapterCatalog ? (
                  <p className="mt-5 text-[13px] text-slate-500">正在读取显示适配器状态。</p>
                ) : (
                  <div className="mt-5 space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      {displayAdapterCatalog.adapters.filter((item) => item.kind === "integrated" || item.kind === "discrete").map((item) => (
                        <div key={item.instanceId} className="rounded-xl border border-white/[0.08] bg-black/20 p-4">
                          <div className="flex flex-wrap items-center gap-2"><strong className="text-[14px] text-white">{item.name}</strong><span className={`rounded-full border px-2 py-0.5 text-[10px] ${item.kind === "integrated" ? "border-amber-300/20 text-amber-100" : "border-emerald-300/20 text-emerald-100"}`}>{item.kind === "integrated" ? "核显" : "独显"}</span><span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-slate-400">{item.enabled ? "已启用" : "已禁用"}</span>{item.attachedToDesktop && <span className="rounded-full border border-sky-300/20 px-2 py-0.5 text-[10px] text-sky-100">正在输出画面</span>}</div>
                          <p className="mt-2 break-all font-mono text-[10px] text-slate-600">{item.instanceId}</p>
                          {item.kind === "integrated" && item.blockedReasons?.length ? <p className="mt-2 text-[11px] leading-5 text-amber-200">{item.blockedReasons.map(displayAdapterBlockReason).join("；")}</p> : item.kind === "integrated" ? <p className="mt-2 text-[11px] text-emerald-200">已通过独显、显示输出和设备状态检查，可以禁用。</p> : null}
                        </div>
                      ))}
                    </div>
                    {!displayAdapterCatalog.adapters.some((item) => item.kind === "integrated") && <Notice>未检测到可识别的 Intel 或 AMD 核显；当前电脑无需执行此项。</Notice>}
                    {displayAdapterCatalog.isPortable && <Notice tone="warn">检测到便携式／笔记本设备。混合显卡通常负责内屏输出和电源管理，因此不提供设备级禁用。</Notice>}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-[11px] leading-5 text-slate-500">禁用后建议重启一次。若游戏原本已经使用独显，禁用核显通常不会提高平均帧数；它主要用于防止程序选错 GPU，并减少闲置核显驱动参与。</p><div className="flex flex-wrap gap-2"><button className={primaryButton} disabled={busy || !displayAdapterCatalog.canDisableIntegratedGpu} onClick={() => { const names = displayAdapterCatalog.adapters.filter((item) => item.eligible).map((item) => item.name).join("、"); if (!confirmAction("禁用核显", `将禁用：${names}。显示器必须连接在独立显卡接口上；完成后建议重启。`)) return; void run(async () => { const result = await hostApi.disableIntegratedGpu(); setDisplayAdapterCatalog(result.catalog); setMessage(`已禁用 ${result.changedCount} 个核显设备，备份编号：${result.backupId}。建议重启。`); }); }}>备份并禁用核显</button><button className={secondaryButton} disabled={busy} onClick={() => { if (!confirmAction("恢复核显", "将按照最近一次备份重新启用被 SynapseX 禁用的核显设备，完成后建议重启。")) return; void run(async () => { const result = await hostApi.restoreIntegratedGpu(); setDisplayAdapterCatalog(result.catalog); setMessage(`已恢复 ${result.changedCount} 个核显设备：${result.backupId}。建议重启。`); }); }}><RotateCcw size={15} className="mr-2 inline" />恢复核显</button></div></div>
                  </div>
                )}
              </div>
              <div className={panel + " p-6"}>
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div><h2 className="text-[17px] font-semibold">NVIDIA / AMD 显卡驱动专项</h2><p className="mt-2 max-w-3xl text-[12px] leading-5 text-slate-400">自动识别显卡厂商并读取驱动真实状态。NVIDIA 使用每游戏 Profile；AMD 使用 ADLX 全局 3D 设置，两者都会在应用前保存可恢复原值。</p></div>
                  <button className={secondaryButton} disabled={busy || !gpuExecutable} onClick={() => void run(async () => setGpuDriverCatalog(await hostApi.gpuDriverCatalog(gpuExecutable)))}><RefreshCw size={15} className="mr-2 inline" />刷新驱动状态</button>
                </div>
                <div className="mt-5 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.045] p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                    <label className="min-w-0 flex-1 text-[11px] text-emerald-100/70">
                      当前优化目标（NVIDIA 按这个游戏独立生效）
                      <input className={inputClass + " mt-2 font-mono text-[12px]"} value={gpuExecutable} onChange={(event) => { setGpuExecutable(event.target.value); setGpuPreference(null); setGpuDriverCatalog(null); }} placeholder="请选择游戏主程序 .exe" />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={secondaryButton} disabled={busy} onClick={() => void run(useDetectedGpuTarget)}><Gamepad2 size={15} className="mr-2 inline" />使用当前识别游戏</button>
                      <button type="button" className={secondaryButton} disabled={busy || !window.synapsexDesktop} onClick={() => void run(browseGpuTarget)}><FolderOpen size={15} className="mr-2 inline" />浏览 EXE</button>
                      <button type="button" className={primaryButton} disabled={busy || !gpuExecutable.trim()} onClick={() => void run(async () => loadGpuTarget(gpuExecutable, "输入的游戏"))}>确认并读取</button>
                    </div>
                  </div>
                  <p className="mt-3 text-[11px] leading-5 text-slate-500">切换目标后会立即读取该 exe 的 Windows GPU 首选项和 NVIDIA 游戏 Profile。AMD 驱动专项属于全局设置，界面会明确标注“全局生效”。</p>
                </div>
                <NvidiaNipPanel />
                {!gpuDriverCatalog ? (
                  <p className="mt-5 text-[13px] text-slate-500">请选择游戏并点击“确认并读取”，随后显示该目标可执行的驱动项目。</p>
                ) : gpuDriverCatalog.providers.length === 0 ? (
                  <div className="mt-5"><Notice tone="warn">{gpuDriverCatalog.note}</Notice></div>
                ) : (
                  <div className="mt-5 space-y-5">
                    {gpuDriverCatalog.providers.map((provider) => {
                      const selectedId = selectedGpuProfiles[provider.vendor] || provider.profiles[0]?.id || "";
                      const selectedProfile = provider.profiles.find((item) => item.id === selectedId) ?? provider.profiles[0];
                      const targetByKey = Object.fromEntries((selectedProfile?.targets ?? []).map((target) => [target.key, target]));
                      const visibleItems = provider.items.filter((item) => item.supported && targetByKey[item.key]);
                      const pendingCount = visibleItems.filter((item) => String(item.currentValue) !== String(targetByKey[item.key]?.value)).length;
                      return (
                        <div key={provider.vendor} className="overflow-hidden rounded-xl border border-white/[0.09] bg-black/20">
                          <div className="flex flex-col gap-3 border-b border-white/[0.08] p-4 lg:flex-row lg:items-center lg:justify-between">
                            <div><div className="flex flex-wrap items-center gap-2"><h3 className="text-[15px] font-semibold text-white">{provider.vendorName} · {provider.gpuName}</h3><span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-slate-400">驱动 {provider.driverVersion}</span><span className="rounded-full border border-sky-300/15 bg-sky-300/[0.05] px-2.5 py-1 text-[10px] text-sky-100">{provider.scopeLabel}</span></div>{!provider.available && <p className="mt-2 text-[12px] text-red-200">不可执行：{provider.error || "驱动接口不可用"}</p>}</div>
                            <select className={inputClass + " max-w-sm"} value={selectedId} disabled={!provider.available} onChange={(event) => setSelectedGpuProfiles((old) => ({ ...old, [provider.vendor]: event.target.value }))}>{provider.profiles.map((item) => <option key={item.id} value={item.id}>{item.name}{item.recommended ? "（推荐）" : ""}</option>)}</select>
                          </div>
                          {selectedProfile && <div className="border-b border-white/[0.07] px-4 py-3 text-[12px] leading-5"><p className="text-slate-200">{selectedProfile.description}</p><p className={"mt-1 " + (selectedProfile.recommended ? "text-emerald-200" : "text-amber-200")}>画面与功能影响：{selectedProfile.qualityCost}</p></div>}
                          <div className="hidden grid-cols-[minmax(150px,0.7fr)_minmax(130px,0.55fr)_minmax(130px,0.55fr)_minmax(260px,1.3fr)] gap-3 border-b border-white/[0.08] bg-white/[0.025] px-4 py-3 text-[11px] font-semibold text-slate-400 lg:grid"><span>驱动参数</span><span>当前值</span><span>应用后</span><span>具体作用</span></div>
                          {visibleItems.map((item) => <div key={item.key} className="grid gap-2 border-b border-white/[0.06] px-4 py-3 text-[12px] leading-5 last:border-b-0 lg:grid-cols-[minmax(150px,0.7fr)_minmax(130px,0.55fr)_minmax(130px,0.55fr)_minmax(260px,1.3fr)] lg:gap-3"><span className="font-semibold text-white">{item.name}</span><span className="text-slate-400">{item.currentLabel}<small className="block text-[10px] text-slate-600">{item.source}</small></span><span className={String(item.currentValue) === String(targetByKey[item.key]?.value) ? "text-emerald-200" : "font-semibold text-amber-200"}>{targetByKey[item.key]?.label}{String(item.currentValue) === String(targetByKey[item.key]?.value) ? "（已生效）" : ""}</span><span className="text-slate-300">{item.description}</span></div>)}
                          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-[11px] text-slate-500">当前方案可执行 {visibleItems.length} 项，待改变 {pendingCount} 项。{provider.scope === "global" ? "AMD 设置会同时影响其他游戏。" : "下次启动该游戏时完整生效。"}</p><button className={primaryButton} disabled={busy || !provider.available || !selectedProfile || !visibleItems.length || pendingCount === 0} onClick={() => { if (!selectedProfile || !confirmAction(`应用 ${selectedProfile.name}`, `${provider.scopeLabel}。将修改 ${pendingCount} 个不同于当前值的驱动参数，并保存完整恢复记录。\n\n${selectedProfile.description}\n影响：${selectedProfile.qualityCost}`)) return; void run(async () => { const result = await hostApi.applyGpuDriverProfile(gpuExecutable, provider.vendor, selectedProfile.id); setGpuDriverCatalog(result.catalog); setMessage(`${selectedProfile.name}已应用 ${result.changedCount} 项，备份编号：${result.backupId}`); }); }}>{pendingCount === 0 ? "所选方案已生效" : "备份并应用所选方案"}</button></div>
                        </div>
                      );
                    })}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-[11px] leading-5 text-slate-500">恢复按钮按最近一次驱动专项备份执行，NVIDIA 会恢复原游戏 Profile 值，AMD 会恢复原全局开关。</p><button className={secondaryButton} disabled={busy} onClick={() => { if (!confirmAction("恢复显卡驱动专项", "将恢复最近一次 NVIDIA 或 AMD 驱动专项修改前的原值。")) return; void run(async () => { const result = await hostApi.restoreGpuDriverProfile(); setGpuDriverCatalog(result.catalog); setMessage(`显卡驱动专项已恢复：${result.backupId}`); }); }}><RotateCcw size={15} className="mr-2 inline" />恢复最近驱动设置</button></div>
                  </div>
                )}
              </div>
            </div>
            <details className={panel + " p-5"}><summary className="cursor-pointer text-[15px] font-semibold">磁盘与分页文件详情</summary><div className="mt-4 grid gap-2 lg:grid-cols-2">{systemReadiness.disks.map((item) => <div key={item.name} className="rounded-lg bg-black/25 px-3 py-3 text-[12px]"><b>{item.name}</b><p className="mt-1 text-slate-400">{item.mediaType} · {item.busType} · {item.sizeGB} GB · {item.health} / {item.operationalStatus}</p></div>)}{systemReadiness.memory.pageFiles.map((item) => <div key={item.name} className="rounded-lg bg-black/25 px-3 py-3 text-[12px]"><b>{item.name}</b><p className="mt-1 text-slate-400">分配 {item.allocatedMB} MB · 当前 {item.currentUsageMB} MB · 峰值 {item.peakUsageMB} MB</p></div>)}</div></details>
          </div>
        )}
        {services && (
          <details className={panel + " mt-5 p-5"}>
            <summary className="cursor-pointer text-[15px] font-semibold">
              自动启动服务审计：{services.runningCount}/{services.totalCount}{" "}
              正在运行
            </summary>
            <p className="mt-3 text-[13px] leading-6 text-slate-400">
              {services.note}
            </p>
            <div className="mt-4 grid gap-2 lg:grid-cols-2">
              {services.items
                .filter((item) => !item.systemComponent)
                .slice(0, 20)
                .map((item) => (
                  <div
                    key={item.name}
                    className="rounded-lg bg-black/25 px-3 py-3"
                  >
                    <p className="text-[13px] font-semibold">
                      {item.displayName}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-slate-500">
                      {item.name} · {item.state}
                    </p>
                  </div>
                ))}
            </div>
          </details>
        )}
        </SystemExtensions>
      </motion.div>
    );

  if (page === "startup")
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <PageHeader
          eyebrow="应用与后台"
          title="应用与启动项"
          description="管理当前用户与整机启动项、启动文件夹和商店应用。逐项确认后执行，设置与操作记录保存在本机。"
          icon={HardDrive}
        />
        {busy && !startup ? (
          <Loading />
        ) : (
          startup && (
            <>
              <div className="mb-4 grid gap-3 sm:grid-cols-4">
                <Metric label="启动项总数" value={startup.totalCount} />
                <Metric label="可管理启动项" value={startup.manageableCount} />
                <Metric label="已选择" value={selectedStartup.length} />
                <Metric
                  label="已安装应用"
                  value={applications?.totalCount ?? 0}
                />
              </div>
              <Notice>{startup.note}</Notice>
              <div className={panel + " mt-4 overflow-x-auto"}>
                <div className="grid min-w-[850px] grid-cols-[42px_180px_1fr_150px] gap-3 border-b border-white/10 bg-white/[0.05] px-4 py-3 text-[12px] font-semibold text-slate-300">
                  <span></span>
                  <span>程序名称</span>
                  <span>启动命令</span>
                  <span>范围</span>
                </div>
                {startup.items.map((item) => (
                  <label
                    key={item.id || item.command}
                    className="grid min-w-[850px] grid-cols-[42px_180px_1fr_150px] gap-3 border-b border-white/[0.08] px-4 py-4 last:border-0"
                  >
                    <input
                      type="checkbox"
                      disabled={!item.manageable}
                      checked={selectedStartup.includes(item.id)}
                      onChange={() =>
                        setSelectedStartup((old) =>
                          old.includes(item.id)
                            ? old.filter((id) => id !== item.id)
                            : [...old, item.id],
                        )
                      }
                      className="mt-1 h-4 w-4 accent-white"
                    />
                    <span className="break-words text-[13px] font-semibold">
                      {item.name}
                    </span>
                    <span className="break-all font-mono text-[11px] leading-5 text-slate-400">
                      {item.command}
                    </span>
                    <span className="text-[12px] text-slate-400">
                      {item.scope}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )
        )}
        <div className={panel + " mt-5 p-5"}>
          <div className="flex flex-col gap-3 xl:flex-row">
            <button
              className={primaryButton}
              disabled={busy || !selectedStartup.length}
              onClick={() => {
                if (!confirmAction("停用启动项", `将停用已勾选的 ${selectedStartup.length} 个启动项；全体用户项目会影响其他账户。程序将不再从这些条目自动启动，不结束当前进程。`)) return;
                void run(async () => {
                  const items =
                    startup?.items.filter((item) =>
                      selectedStartup.includes(item.id),
                    ) ?? [];
                  const result = await hostApi.disableStartup(items);
                  setStartup(result.audit);
                  setSelectedStartup([]);
                  setMessage("已停用所选启动项，备份编号：" + result.backupId);
                });
              }}
            >
              备份并停用
            </button>
            <button
              className={secondaryButton}
              disabled={busy}
              onClick={() => {
                if (!confirmAction("恢复启动项", "将恢复最近一次由 SynapseX 停用的启动项。")) return;
                void run(async () => {
                  const result = await hostApi.restoreStartup();
                  setStartup(result.audit);
                  setMessage("启动项已恢复：" + result.backupId);
                });
              }}
            >
              恢复最近一次
            </button>
          </div>
          {!selectedStartup.length && <p className="mt-3 text-[12px] text-slate-500">请勾选需要停用的注册表启动项；启动文件夹在下方单独管理。</p>}
          {message && <ResultMessage text={message} />}
        </div>
        <BackgroundManagerPanel />
        <DesktopAppsPanel />
      </motion.div>
    );

  if (page === "network")
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <WorkspaceNavigation><div className="section-navigation-shell">
        <PageHeader
          eyebrow="网络设置与诊断"
          title="网络工具箱"
          description="检测连接质量，调整 DNS、TCP、QoS、网卡、Hosts 和 MTU，或修复残留代理。"
          icon={Network}
        />
        {networkToolkit && <nav aria-label="网络优化分类" className="section-tabs">
          {([["status", "连接状态"], ["stability", "稳定性 / 路由"], ["dns", "DNS"], ["tcp", "TCP / QoS"], ["nic", "网卡高级"], ["hosts", "Hosts"], ["mtu", "MTU"]] as const).map(([id, label]) => <button key={id} aria-current={networkTab === id ? "page" : undefined} onClick={() => { setNetworkTab(id); window.scrollTo({ top: 0, behavior: "instant" }); }}>{label}</button>)}
        </nav>}
        </div></WorkspaceNavigation>
        {networkToolkit && <div className="mb-5"><Notice tone={networkToolkit.elevated ? "ok" : "warn"}>{networkToolkit.elevated ? "管理员权限已启用。修改网络设置前会自动备份。" : "修改网络设置需要管理员权限。请完全退出软件，再右键选择“以管理员身份运行”。"}</Notice></div>}
        {networkToolkit?.hosts.available === false && networkTab !== "hosts" && <div className="mb-5"><Notice tone="warn">Hosts 暂不可读取，不影响其他网络工具。可切换到 Hosts 查看具体原因。</Notice></div>}
        {busy && !networkToolkit ? (
          <Loading />
        ) : (
          networkToolkit && (
            <>
              {networkTab === "status" && (
                <div className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Metric
                      label="活动网卡"
                      value={networkToolkit.activeAdapterCount}
                    />
                    <Metric
                      label="已建立 TCP 连接"
                      value={networkToolkit.establishedTcpConnections}
                    />
                    <Metric
                      label="加速／代理进程"
                      value={networkToolkit.acceleratorProcesses.length}
                    />
                  </div>
                  <div className={panel + " p-5"}>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><h2 className="text-[16px] font-semibold">加速器与代理适配</h2><p className="mt-2 text-[12px] leading-5 text-slate-400">{networkToolkit.acceleratorCompatibility.note}</p></div><span className={(networkToolkit.acceleratorCompatibility.detected ? "border-emerald-300/25 bg-emerald-300/[0.07] text-emerald-100" : "border-white/10 text-slate-400") + " w-fit rounded-full border px-3 py-1 text-[11px]"}>{networkToolkit.acceleratorCompatibility.detected ? "已自动适配" : "未检测到运行中的加速器"}</span></div>
                    {networkToolkit.acceleratorCompatibility.items.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{networkToolkit.acceleratorCompatibility.items.map((item) => <span key={item.name} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[12px]">{item.name} · {item.processes.join("、")}</span>)}</div>}
                    {networkToolkit.recommendedPhysicalAdapter && <p className="mt-3 text-[12px] text-slate-500">网卡高级优化默认目标：{networkToolkit.recommendedPhysicalAdapter}</p>}
                  </div>
                  <ValueRows data={networkAudit} labels={networkLabels} />
                  <div className={panel + " overflow-x-auto"}>
                    <div className="grid min-w-[880px] grid-cols-[160px_1fr_120px_90px_170px] gap-3 border-b border-white/10 bg-white/[0.05] px-4 py-3 text-[12px] font-semibold text-slate-300">
                      <span>网卡</span>
                      <span>设备</span>
                      <span>链路</span>
                      <span>MTU</span>
                      <span>DNS</span>
                    </div>
                    {networkToolkit.adapters.map((item) => (
                      <div
                        key={item.interfaceIndex}
                        className="grid min-w-[880px] grid-cols-[160px_1fr_120px_90px_170px] gap-3 border-b border-white/[0.08] px-4 py-4 text-[12px] last:border-0"
                      >
                        <span className="font-semibold">
                          {item.name}
                          {item.isDefaultRoute && (
                            <small className="ml-2 text-sky-300">默认路由</small>
                          )}
                          <small
                            className={
                              "mt-1 block " +
                              (item.status === "Up"
                                ? "text-emerald-300"
                                : "text-slate-500")
                            }
                          >
                            {item.status}
                          </small>
                        </span>
                        <span className="text-slate-300">
                          {item.description}
                        </span>
                        <span>{item.linkSpeed || "—"}</span>
                        <span>{item.mtu ?? "—"}</span>
                        <span className="font-mono text-[11px] text-slate-400">
                          {item.dnsServers.join(", ") || "自动／未设置"}
                        </span>
                      </div>
                    ))}
                  </div>
                  {networkQuality && (
                    <div className="grid gap-4 lg:grid-cols-2">
                      <PingCard
                        title="本地网关"
                        value={networkQuality.gateway}
                      />
                      <PingCard
                        title="公网节点 223.5.5.5"
                        value={networkQuality.public}
                      />
                      <div className="lg:col-span-2">
                        <Notice>
                          {networkQuality.note} 测试时间：
                          {networkQuality.testedAt}
                        </Notice>
                      </div>
                    </div>
                  )}
                  {networkThroughput && (
                    <div className={panel + " p-5"}>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Metric label="实时下载" value={`${networkThroughput.totalDownloadMbps} Mbps`} />
                        <Metric label="实时上传" value={`${networkThroughput.totalUploadMbps} Mbps`} />
                        <Metric label="TCP 连接" value={networkThroughput.establishedTcpConnections} />
                      </div>
                      <div className="mt-4 space-y-2 text-[12px] text-slate-400">
                        {networkThroughput.items.map((item) => (
                          <div key={item.interfaceIndex} className="flex flex-wrap justify-between gap-3 border-t border-white/[0.08] pt-2">
                            <span>{item.name}</span>
                            <span>下载 {item.downloadMbps} Mbps · 上传 {item.uploadMbps} Mbps</span>
                          </div>
                        ))}
                        <p className="pt-2">{networkThroughput.note} 采样时间：{networkThroughput.sampledAt}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={secondaryButton}
                      disabled={busy}
                      onClick={() =>
                        void run(async () =>
                          setNetworkQuality(await hostApi.networkTest()),
                        )
                      }
                    >
                      运行延迟与丢包测试
                    </button>
                    <button
                      className={secondaryButton}
                      disabled={busy}
                      onClick={() =>
                        void run(async () =>
                          setNetworkThroughput(await hostApi.networkThroughput()),
                        )
                      }
                    >
                      采样实时网速（1 秒）
                    </button>
                  </div>
                </div>
              )}

              {networkTab === "stability" && (
                <div className="space-y-5">
                  <Notice>这里测量连续丢包、抖动、P95 延迟和网卡错误计数。它比单次 Ping 更适合判断游戏延迟波动；不会生成下载流量，也不会修改路由、TCP 或网卡。</Notice>
                  <div className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_minmax(260px,1fr)_auto_auto_auto]">
                    <label className="text-[12px] text-slate-400">选择测试目标<select className={inputClass + " mt-2"} value={networkTargets?.items.some((item) => item.target === networkProbeTarget) ? networkProbeTarget : "custom"} onChange={(event) => { if (event.target.value !== "custom") setNetworkProbeTarget(event.target.value); }}><option value="custom">自定义 IP 或域名</option>{networkTargets?.items.map((item) => <option key={`${item.kind}-${item.target}`} value={item.target}>{item.label}</option>)}</select></label>
                    <label className="text-[12px] text-slate-400">当前目标<input className={inputClass + " mt-2"} value={networkProbeTarget} onChange={(event) => setNetworkProbeTarget(event.target.value)} placeholder="例如 223.5.5.5" /></label>
                    <button className={secondaryButton + " self-end"} disabled={busy || !networkProbeTarget} onClick={() => void run(async () => setNetworkStability(await hostApi.networkStability(networkProbeTarget, preferences.stabilitySampleCount)))}>连续测试 {preferences.stabilitySampleCount} 次</button>
                    <button className={secondaryButton + " self-end"} disabled={busy || !networkProbeTarget} onClick={() => void run(async () => setNetworkTrace(await hostApi.networkTrace(networkProbeTarget)))}>跟踪网络路由</button>
                    <button className={secondaryButton + " self-end"} disabled={busy} onClick={() => void run(async () => { const values = await Promise.all([hostApi.networkTargets(), hostApi.networkAdapterHealth()]); acceptNetworkTargets(values[0]); setNetworkAdapterHealth(values[1]); })}><RefreshCw size={15} className="mr-2 inline" />抓取／更新九阴地址</button>
                  </div>
                  {networkTargets && <Notice tone={networkTargets.gameConnectionCount > 0 || networkTargets.cachedConnectionCount > 0 ? "ok" : "info"}>{networkTargets.note} 抓取时间：{networkTargets.capturedAt}</Notice>}
                  {networkStability && <div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label="平均延迟" value={networkStability.averageMs === null ? "超时" : `${networkStability.averageMs} ms`} /><Metric label="P95 延迟" value={networkStability.p95Ms === null ? "—" : `${networkStability.p95Ms} ms`} /><Metric label="最大延迟" value={networkStability.maximumMs === null ? "—" : `${networkStability.maximumMs} ms`} /><Metric label="平均抖动" value={networkStability.jitterMs === null ? "—" : `${networkStability.jitterMs} ms`} /><Metric label="丢包率" value={`${networkStability.lossPercent}%`} /></div><div className="mt-4"><Notice tone={networkStability.classification === "stable" ? "ok" : "warn"}>结论：{networkStability.classification === "stable" ? "本次链路稳定" : networkStability.classification === "packet-loss" ? "检测到 ICMP 丢包或目标拒绝响应" : networkStability.classification === "high-jitter" ? "延迟抖动偏高" : "存在明显延迟尖峰"}。{networkStability.note} 测试时间：{networkStability.testedAt}</Notice></div></div>}
                  {networkAdapterHealth && <div className={panel + " overflow-x-auto"}><div className="grid min-w-[900px] grid-cols-[160px_1fr_120px_110px_110px] gap-3 border-b border-white/10 bg-white/[0.05] px-4 py-3 text-[12px] font-semibold text-slate-300"><span>网卡</span><span>设备</span><span>链路</span><span>错误包</span><span>丢弃包</span></div>{networkAdapterHealth.items.map((item) => <div key={item.name} className="grid min-w-[900px] grid-cols-[160px_1fr_120px_110px_110px] gap-3 border-b border-white/[0.08] px-4 py-3 text-[12px] last:border-0"><span className={item.status === "Up" ? "font-semibold text-white" : "text-slate-500"}>{item.name}<small className="mt-1 block">{item.status}</small></span><span className="text-slate-300">{item.description}</span><span>{item.linkSpeed}</span><span className={item.receivedErrors + item.outboundErrors ? "text-amber-200" : "text-emerald-300"}>{item.receivedErrors + item.outboundErrors}</span><span className={item.receivedDiscards + item.outboundDiscards ? "text-amber-200" : "text-emerald-300"}>{item.receivedDiscards + item.outboundDiscards}</span></div>)}<p className="border-t border-white/[0.08] px-4 py-3 text-[11px] leading-5 text-slate-500">{networkAdapterHealth.note}</p></div>}
                  {networkTrace && <div className={panel + " p-5"}><h2 className="text-[16px] font-semibold">到 {networkTrace.target} 的路由</h2><pre className="mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl bg-black/35 p-4 font-mono text-[12px] leading-6 text-slate-300">{networkTrace.raw.join("\n")}</pre><p className="mt-3 text-[12px] leading-5 text-slate-400">{networkTrace.note} 跟踪时间：{networkTrace.tracedAt}</p></div>}
                </div>
              )}

              {networkTab === "dns" && (
                <div className="space-y-5">
                  <Notice>
                    DNS
                    只影响域名解析阶段，不会降低游戏连接建立后的网络往返延迟。测速用于选择可达且响应稳定的解析器。
                  </Notice>
                  <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
                    <label className="text-[12px] text-slate-400">
                      活动网卡
                      <select
                        className={inputClass + " mt-2"}
                        value={selectedAdapter}
                        onChange={(event) =>
                          setSelectedAdapter(event.target.value)
                        }
                      >
                        {networkToolkit.adapters
                          .filter((item) => item.status === "Up")
                          .map((item) => (
                            <option key={item.interfaceIndex} value={item.name}>
                              {item.isDefaultRoute ? "默认路由 · " : ""}
                              {item.name} · {item.description}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="text-[12px] text-slate-400">
                      DNS 方案
                      <select
                        className={inputClass + " mt-2"}
                        value={selectedDnsPreset}
                        onChange={(event) =>
                          setSelectedDnsPreset(event.target.value)
                        }
                      >
                        {networkToolkit.dnsPresets.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} · {item.primary}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className={secondaryButton + " self-end"}
                      disabled={busy}
                      onClick={() =>
                        void run(async () =>
                          setDnsBenchmark(await hostApi.dnsBenchmark()),
                        )
                      }
                    >
                      测速全部 DNS
                    </button>
                  </div>
                  {dnsBenchmark && (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      {dnsBenchmark.items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setSelectedDnsPreset(item.id)}
                          className={
                            panel +
                            " p-5 text-left transition hover:bg-white/[0.05] " +
                            (selectedDnsPreset === item.id
                              ? "border-white/30"
                              : "")
                          }
                        >
                          <p className="text-[13px] font-semibold">
                            {item.name}
                          </p>
                          <p className="mt-3 text-[26px] font-semibold">
                            {item.averageMs ?? "超时"}
                            <span className="ml-1 text-[12px] text-slate-400">
                              ms
                            </span>
                          </p>
                          <p className="mt-2 font-mono text-[11px] text-slate-500">
                            {item.primary}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                  {!networkToolkit.elevated && (
                    <Notice tone="warn">
                      切换或恢复 DNS 需要管理员权限。请右键以管理员身份运行
                      SynapseX；测速和刷新缓存仍可使用。
                    </Notice>
                  )}
                  <div className={panel + " p-5"}>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <button
                        className={primaryButton}
                        disabled={
                          busy ||
                          !networkToolkit.elevated ||
                          !selectedAdapter
                        }
                        onClick={() => {
                          const preset = networkToolkit.dnsPresets.find((item) => item.id === selectedDnsPreset);
                          if (!confirmAction("切换 DNS", `将“${selectedAdapter}”的 IPv4 DNS 切换为 ${preset?.name ?? selectedDnsPreset}。`)) return;
                          void run(async () => {
                            const result = await hostApi.applyDns(
                              selectedAdapter,
                              selectedDnsPreset,
                            );
                            const next = await hostApi.networkToolkit();
                            setNetworkToolkit(next);
                            setMessage(
                              "DNS 已应用，备份编号：" + result.backupId,
                            );
                          });
                        }}
                      >
                        备份并应用 DNS
                      </button>
                      <button
                        className={secondaryButton}
                        disabled={
                          busy ||
                          !networkToolkit.elevated
                        }
                        onClick={() => {
                          if (!confirmAction("恢复 DNS", "将恢复最近一次 DNS 切换前保存的服务器地址。")) return;
                          void run(async () => {
                            const result = await hostApi.restoreDns();
                            setNetworkToolkit(await hostApi.networkToolkit());
                            setMessage("DNS 已恢复：" + result.backupId);
                          });
                        }}
                      >
                        恢复最近 DNS
                      </button>
                      <button
                        className={secondaryButton}
                        disabled={busy}
                        onClick={() => {
                          if (!requestConfirmation("刷新 Windows DNS 缓存", "只清理本机 DNS 解析缓存，不会改变当前 DNS 服务器。", { confirmLabel: "立即刷新", note: "此操作不会修改网卡、路由或 DNS 服务器地址。" })) return;
                          void run(async () => {
                            const result = await hostApi.flushDns();
                            setMessage("DNS 缓存已刷新：" + result.completedAt);
                          });
                        }}
                      >
                        刷新 DNS 缓存
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {networkTab === "tcp" && (
                <div className="space-y-5">
                  <VipNotice feature="network.tcp" title="TCP / QoS"/>
                  <Notice>选择联网网卡后可直接应用方案。软件会备份完整 TCP 全局命令和相关注册表原值，写入后立即复检；恢复按钮还原最近一次应用前的状态。</Notice>
                  <div className={panel + " p-6"}>
                    <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                      <label className="text-[12px] text-slate-400">
                        应用网卡
                        <select className={inputClass + " mt-2"} value={selectedAdapter} onChange={(event) => setSelectedAdapter(event.target.value)}>
                          {networkToolkit.adapters.filter((item) => item.status === "Up").map((item) => <option key={item.interfaceIndex} value={item.name}>{item.isDefaultRoute ? "默认路由 · " : ""}{item.name} · {item.description}</option>)}
                        </select>
                      </label>
                      <button className={secondaryButton + " self-end"} disabled={busy || !networkToolkit.elevated} onClick={() => {
                        if (!confirmAction("恢复 TCP 设置", "恢复最近一次 SynapseX TCP 方案应用前保存的全部 TCP 全局参数和注册表值。")) return;
                        void run(async () => {
                          const result = await hostApi.restoreTcpProfile();
                          setNetworkToolkit(await hostApi.networkToolkit());
                          setMessage("TCP 设置已恢复，恢复记录：" + result.backupId);
                        });
                      }}><RotateCcw size={15} className="mr-2 inline" />恢复最近 TCP</button>
                    </div>
                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                      {networkToolkit.tcp.optimization.profiles.map((profile) => {
                        const matched = profile.itemIds.filter((id) => networkToolkit.tcp.optimization.items.find((item) => item.id === id)?.matches).length;
                        return <div key={profile.id} className="rounded-xl border border-white/10 bg-black/25 p-5">
                          <div className="flex items-center justify-between gap-3"><h2 className="text-[16px] font-semibold">{profile.name}</h2><span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-slate-300">{matched}/{profile.itemIds.length} 已生效</span></div>
                          <p className="mt-3 min-h-[60px] text-[12px] leading-5 text-slate-400">{profile.description}</p>
                          <button className={primaryButton + " mt-4 w-full"} disabled={busy || !networkToolkit.elevated || !selectedAdapter} onClick={() => {
                            if (!confirmAction("应用" + profile.name, "将对“" + selectedAdapter + "”应用 " + profile.itemIds.length + " 项 TCP 设置，并自动保存原值。")) return;
                            void run(async () => {
                              const result = await hostApi.applyTcpProfile(selectedAdapter, profile.id);
                              setNetworkToolkit(await hostApi.networkToolkit());
                              setMessage(profile.name + "已应用并复检通过，备份：" + result.backupId);
                            });
                          }}>备份并应用</button>
                        </div>;
                      })}
                    </div>
                  </div>
                  <div>
                    <h2 className="text-[18px] font-semibold">TCP 独立参数</h2>
                    <p className="mt-1 text-[12px] text-slate-400">每项都可单独应用，不需要输入确认文字。</p>
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      {networkToolkit.tcp.optimization.items.map((item) => <div key={item.id} className={panel + " p-5"}>
                        <div className="flex items-start justify-between gap-4"><div><h3 className="text-[14px] font-semibold">{item.name}</h3><p className="mt-2 text-[12px] leading-5 text-slate-300">{item.description}</p></div><span className={"shrink-0 rounded-full px-3 py-1 text-[11px] " + (item.matches ? "bg-emerald-400/10 text-emerald-200" : "bg-amber-400/10 text-amber-200")}>{item.matches ? "当前已生效" : "可应用"}</span></div>
                        <div className="mt-3 rounded-lg bg-black/25 px-3 py-2 font-mono text-[11px] text-slate-400">当前：{item.currentValue || "未设置"}　目标：{item.desiredValue}</div>
                        <p className="mt-3 text-[11px] leading-5 text-slate-500">影响：{item.tradeoff}</p>
                        <button className={secondaryButton + " mt-3"} disabled={busy || !networkToolkit.elevated || item.matches || !selectedAdapter} onClick={() => {
                          if (!confirmAction("应用单项 TCP 参数", item.name + "\n\n" + item.description)) return;
                          void run(async () => {
                            const result = await hostApi.applyTcpProfile(selectedAdapter, "custom", [item.id]);
                            setNetworkToolkit(await hostApi.networkToolkit());
                            setMessage(item.name + "已应用并复检通过，备份：" + result.backupId);
                          });
                        }}>单独备份并应用</button>
                      </div>)}
                    </div>
                  </div>
                  <div className={panel + " p-6"}>
                    <h2 className="text-[17px] font-semibold">游戏程序 QoS · DSCP 46</h2>
                    <p className="mt-2 text-[12px] leading-5 text-slate-400">为指定 exe 创建 Windows 持久 QoS 策略，只标记该程序的 TCP/UDP 数据包。路由器或运营商是否采用该标记取决于网络路径。</p>
                    <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end"><label className="min-w-0 flex-1 text-[12px] text-slate-400">游戏程序路径或 exe 名<input className={inputClass + " mt-2"} value={gpuExecutable} disabled={busy} onChange={(event) => selectGpuPath(event.target.value)} /></label><ExecutablePickerButton className={secondaryButton} disabled={busy} onSelect={selectGpuPath} onError={setMessage}/></div>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <button className={primaryButton} disabled={busy || !networkToolkit.elevated || !gpuExecutable.trim()} onClick={() => {
                        if (!confirmAction("创建游戏 QoS", "为 " + gpuExecutable + " 创建 DSCP 46 持久策略。")) return;
                        void run(async () => {
                          const result = await hostApi.applyGameQos(gpuExecutable, 46);
                          setNetworkToolkit((old) => old ? { ...old, qos: result.audit } : old);
                          setMessage(result.alreadyApplied ? "已经存在等效 QoS：" + result.policyName : "QoS 已创建：" + result.policyName);
                        });
                      }}>创建 DSCP 46</button>
                      <button className={secondaryButton} disabled={busy || !networkToolkit.elevated} onClick={() => {
                        if (!confirmAction("移除 SynapseX QoS", "只移除名称以 SynapseX_Game_ 开头的 QoS，不会删除其他软件创建的策略。")) return;
                        void run(async () => {
                          const result = await hostApi.removeGameQos();
                          setNetworkToolkit((old) => old ? { ...old, qos: result.audit } : old);
                          setMessage("已移除 " + result.removedCount + " 条 SynapseX 游戏 QoS。");
                        });
                      }}>移除本软件 QoS</button>
                    </div>
                    <div className="mt-5 flex items-center justify-between"><h3 className="text-[14px] font-semibold">当前活动策略</h3><span className="rounded-full border border-white/10 px-3 py-1 text-[12px]">游戏相关 {networkToolkit.qos.gamePolicyCount} 条</span></div>
                    <div className="mt-3 max-h-[280px] space-y-2 overflow-auto">
                      {networkToolkit.qos.items.length ? networkToolkit.qos.items.map((item, index) => <div key={String(item.name) + index} className="rounded-lg bg-black/25 px-3 py-3 text-[12px]"><p className="font-semibold">{String(item.name)}{item.managedBySynapseX ? <span className="ml-2 text-emerald-300">SynapseX 管理</span> : item.gameRelated ? <span className="ml-2 text-sky-300">游戏相关</span> : null}</p><p className="mt-1 break-all font-mono text-[11px] text-slate-500">程序：{String(item.appPathNameMatchCondition || "全部")} · DSCP：{String(item.dscpAction ?? "未设置")}</p></div>) : <p className="text-[12px] text-slate-500">当前没有活动 QoS 策略。</p>}
                    </div>
                  </div>
                  <details className={panel + " p-5"}><summary className="cursor-pointer text-[14px] font-semibold">查看 netsh TCP 原始状态</summary><pre className="mt-4 max-h-[340px] overflow-auto whitespace-pre-wrap rounded-xl bg-black/35 p-4 font-mono text-[12px] leading-6 text-slate-300">{networkToolkit.tcp.raw.join("\n")}</pre><p className="mt-3 text-[12px] leading-5 text-slate-400">{networkToolkit.tcp.note}</p></details>
                </div>
              )}

              {networkTab === "nic" && (
                <div className="space-y-5">
                  <VipNotice feature="network.nic" title="网卡高级"/>
                  <Notice>只识别 EEE、绿色以太网、Gigabit Lite 和网卡省电。不会自动关闭 RSS、校验和、LSO/RSC，也不会强制双工速率。</Notice>
                  <div className={panel + " p-6"}>
                    <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                      <select className={inputClass} value={selectedAdapter} onChange={(event) => { setSelectedAdapter(event.target.value); setNicAudit(null); }}>{networkToolkit.adapters.filter((item) => item.status === "Up").map((item) => <option key={item.interfaceIndex} value={item.name}>{item.isDefaultRoute ? "默认路由 · " : ""}{item.name} · {item.description}</option>)}</select>
                      <button className={primaryButton} disabled={busy || !selectedAdapter} onClick={() => void run(async () => setNicAudit(await hostApi.nicAudit(selectedAdapter)))}>读取高级属性</button>
                    </div>
                  </div>
                  {nicAudit && <>
                    <NicPropertyEditor key={nicAudit.interfaceAlias} audit={nicAudit} onChange={setNicAudit}/>
                    <div className="grid gap-3 sm:grid-cols-3"><Metric label="驱动高级属性" value={nicAudit.properties.length} /><Metric label="低延迟候选" value={nicAudit.latencyCandidates.length} /><Metric label="尚未达到建议值" value={nicAudit.pendingCandidateCount} /></div>
                    <Notice tone={nicAudit.pendingCandidateCount ? "warn" : "ok"}>{nicAudit.recommendation} {nicAudit.pendingCandidateCount ? `当前有 ${nicAudit.pendingCandidateCount} 项可调整。` : "当前识别到的节能项已经关闭，无需重复应用。"}</Notice>
                    <div className="grid gap-3 lg:grid-cols-2">{nicAudit.latencyCandidates.map((item) => <div key={item.registryKeyword} className={panel + " p-5"}><div className="flex items-center justify-between gap-3"><div><p className="text-[14px] font-semibold">{item.displayName}</p><p className="mt-1 font-mono text-[11px] text-slate-500">{item.registryKeyword}</p></div><span className={"rounded-full px-3 py-1 text-[11px] " + (item.matches ? "bg-emerald-400/10 text-emerald-200" : "bg-amber-400/10 text-amber-200")}>{item.matches ? "已关闭" : `${item.currentValue} → 0`}</span></div><p className="mt-3 text-[12px] leading-5 text-slate-400">{item.reason}</p></div>)}</div>
                    <div className={panel + " p-5"}><p className="text-[13px] leading-6 text-slate-300">允许系统关闭网卡：<b>{nicAudit.powerManagement?.allowComputerToTurnOffDevice ?? "不支持"}</b> · 选择性挂起：<b>{nicAudit.powerManagement?.selectiveSuspend ?? "不支持"}</b></p><p className="mt-2 text-[12px] leading-5 text-amber-100">{nicAudit.restartNote}</p><div className="mt-3 flex flex-wrap gap-3"><button className={primaryButton} disabled={busy || !nicAudit.elevated || nicAudit.pendingCandidateCount === 0} onClick={() => { if (!confirmAction("应用网卡低延迟项", `将关闭“${selectedAdapter}”上识别到的 ${nicAudit.pendingCandidateCount} 个节能项，重启后完整生效。`)) return; void run(async () => { const result = await hostApi.applyNicLatency(selectedAdapter); setNicAudit(result.audit); setMessage("网卡低延迟项已写入，重启 Windows 后完整生效。备份：" + result.backupId); }); }}>备份并应用节能项</button><button className={secondaryButton} disabled={busy || !nicAudit.elevated} onClick={() => { if (!confirmAction("恢复网卡高级属性", "将恢复最近一次网卡低延迟调整前的驱动属性。")) return; void run(async () => { const result = await hostApi.restoreNicLatency(); setNicAudit(result.audit); setMessage("网卡高级属性已恢复，重启 Windows 后完整生效。备份：" + result.backupId); }); }}>恢复最近备份</button></div>{nicAudit.pendingCandidateCount === 0 && <p className="mt-3 text-[12px] text-slate-500">当前已没有待关闭的受支持节能项，因此应用按钮无需执行。</p>}{!nicAudit.elevated && <div className="mt-4"><Notice tone="warn">本地执行服务没有管理员权限。请退出并重新启动 0.12.0，然后允许 Windows UAC。</Notice></div>}</div>
                    <details className={panel + " p-5"}><summary className="cursor-pointer text-[15px] font-semibold">查看全部驱动属性（{nicAudit.properties.length}）</summary><div className="mt-4 grid gap-2 lg:grid-cols-2">{nicAudit.properties.map((item) => <div key={item.registryKeyword} className="rounded-lg bg-black/25 px-3 py-3 text-[12px]"><p>{item.displayName}：<b>{item.displayValue || "未设置"}</b></p><p className="mt-1 font-mono text-[10px] text-slate-500">{item.registryKeyword} · {String(item.registryValue)}</p></div>)}</div></details>
                  </>}
                </div>
              )}

              {networkTab === "hosts" && (
                <div className="space-y-5">
                  <Notice>{networkToolkit.hosts.note}{networkToolkit.hosts.available !== false && <> 当前有效条目 {networkToolkit.hosts.activeEntryCount} 条，文件大小 {networkToolkit.hosts.size} 字节。</>}</Notice>
                  {networkToolkit.hosts.error && <Notice tone="warn">{networkToolkit.hosts.error}<br />路径：{networkToolkit.hosts.path}</Notice>}
                  <textarea
                    className={
                      inputClass +
                      " min-h-[420px] resize-y font-mono text-[12px] leading-6"
                    }
                    value={hostsContent}
                    onChange={(event) => setHostsContent(event.target.value)}
                    disabled={networkToolkit.hosts.available === false || !networkToolkit.hosts.writable}
                    spellCheck={false}
                  />
                  {!networkToolkit.elevated && (
                    <Notice tone="warn">
                      保存或恢复 Hosts 需要管理员权限；当前仍可查看和复制内容。
                    </Notice>
                  )}
                  <div className={panel + " p-5"}>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <button
                        className={primaryButton}
                        disabled={
                          busy ||
                          !networkToolkit.elevated || !networkToolkit.hosts.writable || networkToolkit.hosts.available === false
                        }
                        onClick={() => {
                          if (!networkToolkit.hosts.writable || networkToolkit.hosts.available === false) return;
                          if (!confirmAction("保存 Hosts", "将用编辑框中的内容替换系统 Hosts 文件，并刷新 DNS 缓存。")) return;
                          void run(async () => {
                            const result =
                              await hostApi.saveHosts(hostsContent);
                            setNetworkToolkit((old) =>
                              old ? { ...old, hosts: result.state } : old,
                            );
                            setMessage(
                              "Hosts 已保存，备份编号：" + result.backupId,
                            );
                          });
                        }}
                      >
                        备份并保存
                      </button>
                      <button
                        className={secondaryButton}
                        disabled={
                          busy ||
                          !networkToolkit.elevated || (!networkToolkit.hosts.writable && networkToolkit.hosts.status !== "missing")
                        }
                        onClick={() => {
                          if (!confirmAction("恢复 Hosts", "将恢复最近一次保存前自动备份的 Hosts 文件。")) return;
                          void run(async () => {
                            const result = await hostApi.restoreHosts();
                            setNetworkToolkit((old) =>
                              old ? { ...old, hosts: result.state } : old,
                            );
                            setHostsContent(result.state.content);
                            setMessage("Hosts 已恢复：" + result.backupId);
                          });
                        }}
                      >
                        恢复最近备份
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {networkTab === "mtu" && (
                <div className="space-y-5">
                  <Notice>
                    使用禁止分片的 IPv4 Ping
                    二分查找最大负载。探测只读；得到建议值后可以选择活动网卡，备份并应用或恢复。
                  </Notice>
                  <div className={panel + " p-6"}>
                    <div className="grid gap-3 lg:grid-cols-2">
                      <label className="text-[12px] text-slate-400">探测目标 IPv4<input className={inputClass + " mt-2"} value={mtuTarget} onChange={(event) => setMtuTarget(event.target.value)} /></label>
                      <label className="text-[12px] text-slate-400">应用到活动网卡<select className={inputClass + " mt-2"} value={selectedAdapter} onChange={(event) => setSelectedAdapter(event.target.value)}>{networkToolkit.adapters.filter((item) => item.status === "Up").map((item) => <option key={item.interfaceIndex} value={item.name}>{item.isDefaultRoute ? "默认路由 · " : ""}{item.name} · 当前 MTU {item.mtu ?? "未知"}</option>)}</select></label>
                    </div>
                    <button
                      className={primaryButton + " mt-4"}
                      disabled={busy || !mtuTarget}
                      onClick={() =>
                        void run(async () =>
                          setMtuResult(await hostApi.testMtu(mtuTarget)),
                        )
                      }
                    >
                      开始 MTU 探测
                    </button>
                    {mtuResult && (
                      <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        <Metric
                          label="最大 ICMP 负载"
                          value={`${mtuResult.maximumPayloadBytes} B`}
                        />
                        <Metric
                          label="建议 IPv4 MTU"
                          value={mtuResult.suggestedIpv4Mtu}
                        />
                        <Metric label="所选网卡当前 MTU" value={networkToolkit.adapters.find((item) => item.name === selectedAdapter)?.mtu ?? "未知"} />
                      </div>
                    )}
                    {mtuResult && (
                      <div className="mt-4">
                        <Notice tone="ok">
                          {mtuResult.note} 测试时间：{mtuResult.testedAt}
                        </Notice>
                      </div>
                    )}
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button className={primaryButton} disabled={busy || !networkToolkit.elevated || !selectedAdapter || !mtuResult || networkToolkit.adapters.find((item) => item.name === selectedAdapter)?.mtu === mtuResult?.suggestedIpv4Mtu} onClick={() => {
                        if (!mtuResult || !confirmAction("应用 MTU", `将“${selectedAdapter}”的 IPv4 MTU 改为 ${mtuResult.suggestedIpv4Mtu}。连接可能短暂波动。`)) return;
                        void run(async () => { const result = await hostApi.applyMtu(selectedAdapter, mtuResult.suggestedIpv4Mtu); const next = await hostApi.networkToolkit(); setNetworkToolkit(next); setMessage(`MTU 已从 ${result.previousMtu} 调整为 ${result.currentMtu}，备份编号：${result.backupId}`); });
                      }}>备份并应用建议 MTU</button>
                      <button className={secondaryButton} disabled={busy || !networkToolkit.elevated} onClick={() => {
                        if (!confirmAction("恢复 MTU", "将恢复最近一次 MTU 调整前保存的数值，连接可能短暂波动。")) return;
                        void run(async () => { const result = await hostApi.restoreMtu(); const next = await hostApi.networkToolkit(); setNetworkToolkit(next); setSelectedAdapter(result.interfaceAlias); setMessage(`MTU 已恢复为 ${result.currentMtu}，备份编号：${result.backupId}`); });
                      }}>恢复最近 MTU</button>
                    </div>
                    {!networkToolkit.elevated && <div className="mt-4"><Notice tone="warn">应用和恢复 MTU 需要管理员权限；重新启动 SynapseX 并允许 Windows UAC 后即可使用。</Notice></div>}
                  </div>
                </div>
              )}
            </>
          )
        )}
        <div className="mt-5">
          <button
            className={secondaryButton}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const values = await Promise.all([
                  hostApi.networkAudit(),
                  hostApi.networkToolkit(),
                ]);
                setNetworkAudit(values[0]);
                setNetworkToolkit(values[1]);
                setHostsContent(values[1].hosts.content);
              })
            }
          >
            <RefreshCw size={16} className="mr-2 inline" />
            重新检测全部
          </button>
        </div>
        {message && <ResultMessage text={message} />}
      </motion.div>
    );

  if (page === "repair")
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <PageHeader
          eyebrow="故障修复"
          title="修复中心"
          description="检查系统文件、修复组件存储和处理网络故障。各项独立执行，不自动应用全部修复。"
          icon={Stethoscope}
        />
        <RepairJobsPanel />
        <h2 className="mb-3 text-lg font-semibold">Clash 残留代理修复</h2>
        {busy && !networkAudit ? (
          <Loading />
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <StatusTile
              label="Clash / Mihomo"
              value={networkAudit?.clashRunning ? "正在运行" : "未运行"}
              good={!networkAudit?.clashRunning}
            />
            <StatusTile
              label="系统代理"
              value={networkAudit?.proxyEnabled ? "已开启" : "已关闭"}
              good={!networkAudit?.proxyEnabled}
            />
            <StatusTile
              label="残留修复候选"
              value={
                networkAudit?.staleLoopbackCandidate ? "检测到" : "未检测到"
              }
              good={!networkAudit?.staleLoopbackCandidate}
            />
          </div>
        )}
        <div className={panel + " mt-5 p-6"}>
          <h2 className="text-[16px] font-semibold">修复范围</h2>
          <div className="mt-4 grid gap-3 text-[13px] leading-6 text-slate-300 sm:grid-cols-2">
            <p>
              <CheckCircle2
                size={16}
                className="mr-2 inline text-emerald-300"
              />
              备份系统代理与 PAC 原值
            </p>
            <p>
              <CheckCircle2
                size={16}
                className="mr-2 inline text-emerald-300"
              />
              关闭失效的本地代理开关
            </p>
            <p>
              <Info size={16} className="mr-2 inline text-sky-300" />
              只删除回环地址的 PAC
            </p>
            <p>
              <ShieldCheck size={16} className="mr-2 inline text-sky-300" />
              保留 DNS、路由、网卡和 WinHTTP
            </p>
          </div>
          <div className="mt-5 flex flex-col gap-3 xl:flex-row">
            <button
              className={primaryButton}
              disabled={
                busy ||
                networkAudit?.staleLoopbackCandidate !== true
              }
              onClick={() => {
                if (!confirmAction("修复 Clash 代理残留", "将关闭失效的本地代理开关，并只清除回环地址 PAC；DNS、路由和网卡保持不变。")) return;
                void run(async () => {
                  const result = await hostApi.repairNetwork();
                  setNetworkAudit(result.state);
                  setMessage("代理残留已修复，备份编号：" + result.backupId);
                });
              }}
            >
              备份并修复
            </button>
            <button
              className={secondaryButton}
              disabled={busy}
              onClick={() => {
                if (!confirmAction("恢复代理设置", "将恢复最近一次代理残留修复前保存的 WinINet 代理和 PAC 设置。")) return;
                void run(async () => {
                  const result = await hostApi.restoreNetwork();
                  setNetworkAudit(result.state);
                  setMessage("网络设置已恢复：" + result.backupId);
                });
              }}
            >
              恢复最近备份
            </button>
          </div>
          {networkAudit?.staleLoopbackCandidate !== true && <p className="mt-3 text-[12px] text-slate-500">当前没有检测到失效的 Clash 本地代理残留，因此修复按钮无需执行。</p>}
          {message && <ResultMessage text={message} />}
        </div>
      </motion.div>
    );

  if (page === "history")
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <PageHeader
          eyebrow="本机快照"
          title="备份与恢复"
          description="查看本机备份和操作记录。需要恢复时，前往对应功能页选择备份。"
          icon={ArchiveRestore}
        />
        {busy && !backups.length ? (
          <Loading />
        ) : (
          <>
            <div className={panel + " mb-5 p-6"}>
              <div className="flex items-center justify-between"><h2 className="text-[17px] font-semibold">最近操作日志</h2><span className="rounded-full border border-white/10 px-3 py-1 text-[12px] text-slate-300">{operations.length} 条</span></div>
              <p className="mt-2 text-[12px] leading-5 text-slate-400">记录本机写入动作、结果和对应备份编号，不上传到服务器。</p>
              <div className="mt-4 space-y-2">{operations.length ? operations.slice(0, 12).map((item, index) => <div key={item.timestamp + item.action + index} className="grid gap-2 rounded-lg bg-black/25 px-4 py-3 text-[12px] sm:grid-cols-[180px_1fr_220px]"><span className="text-slate-500">{new Date(item.timestamp).toLocaleString("zh-CN")}</span><span className="font-semibold">{operationLabels[item.action] ?? item.action}</span><span className="break-all font-mono text-[11px] text-slate-500">{item.backupId || "无备份编号"}</span></div>) : <p className="text-[13px] text-slate-500">暂无写入操作记录</p>}</div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {backups.map((group) => (
              <div key={group.type} className={panel + " p-6"}>
                <div className="flex items-center justify-between">
                  <h2 className="text-[17px] font-semibold">{group.title}</h2>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-[12px] text-slate-300">
                    {group.count} 份
                  </span>
                </div>
                <p className="mt-3 break-all font-mono text-[11px] leading-5 text-slate-500">
                  {group.path}
                </p>
                <div className="mt-5 space-y-2">
                  {group.items.length ? (
                    group.items.slice(0, 5).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-lg bg-black/25 px-3 py-2 text-[12px]"
                      >
                        <span className="font-mono text-slate-300">
                          {item.id}
                        </span>
                        <span className="text-slate-500">{item.createdAt}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-[13px] text-slate-500">暂无备份</p>
                  )}
                </div>
              </div>
              ))}
            </div>
          </>
        )}
      </motion.div>
    );

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <PageHeader
        eyebrow="偏好设置"
        title="软件设置"
        description="设置外观、操作确认、网络测试和游戏目录。更改自动保存。"
        icon={Settings}
      />
      <StartupSettingsCard />
      <DesktopSettingsCards />
      <LicenseSettingsCard />
      <section className="settings-appearance"><h2>外观与动效</h2><AppearanceOptions /></section>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={panel + " p-6"}>
          <h2 className="text-[17px] font-semibold">执行确认</h2>
          <p className="mt-2 text-[12px] leading-5 text-slate-400">开启后，应用、恢复和网络写入操作在执行前会显示确认弹窗。关闭后按钮会直接执行，但仍会自动创建备份。</p>
          <label className="mt-5 flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 px-4 py-4"><span><b className="block text-[14px]">写入前显示确认弹窗</b><small className="mt-1 block text-[11px] text-slate-500">当前：{preferences.confirmBeforeWrite ? "开启" : "关闭"}</small></span><input type="checkbox" className="h-5 w-5 accent-white" checked={preferences.confirmBeforeWrite} onChange={(event) => { updatePreferences({ confirmBeforeWrite: event.target.checked }); setMessage("执行确认设置已保存。"); }} /></label>
        </div>
        <div className={panel + " p-6"}>
          <h2 className="text-[17px] font-semibold">网络稳定性测试</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-[12px] text-slate-400">默认测试目标<select className={inputClass + " mt-2"} value={preferences.defaultNetworkTarget} onChange={(event) => { updatePreferences({ defaultNetworkTarget: event.target.value }); setNetworkProbeTarget(event.target.value); setMessage("默认网络测试目标已保存。"); }}><option value="223.5.5.5">阿里 DNS · 223.5.5.5</option><option value="119.29.29.29">DNSPod · 119.29.29.29</option><option value="114.114.114.114">114 DNS · 114.114.114.114</option><option value="1.1.1.1">Cloudflare · 1.1.1.1</option></select></label><label className="text-[12px] text-slate-400">连续测试次数<select className={inputClass + " mt-2"} value={preferences.stabilitySampleCount} onChange={(event) => { updatePreferences({ stabilitySampleCount: Number(event.target.value) as 10 | 20 | 30 }); setMessage("网络测试次数已保存。"); }}><option value={10}>10 次 · 快速</option><option value={20}>20 次 · 标准</option><option value={30}>30 次 · 更稳定</option></select></label></div>
        </div>
      </div>
      <div className={panel + " mt-4 p-6"}>
        <h2 className="text-[17px] font-semibold">默认九阴真经目录</h2>
        <p className="mt-2 text-[12px] leading-5 text-slate-400">用于读取九阴画面配置。显卡设置中的游戏程序可单独选择。</p>
        <input className={inputClass + " mt-4 font-mono text-[12px]"} value={gameRoot} onChange={(event) => { setGameRoot(event.target.value); setMessage("游戏目录已保存。"); }} />
      </div>
      {message && <ResultMessage text={message} />}
    </motion.div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={panel + " p-5"}>
      <p className="text-[12px] text-slate-400">{label}</p>
      <p className="mt-2 text-[30px] font-semibold">{value}</p>
    </div>
  );
}
function StatusTile({
  label,
  value,
  good,
}: {
  label: string;
  value: string;
  good: boolean;
}) {
  return (
    <div className={panel + " p-5"}>
      <p className="text-[12px] text-slate-400">{label}</p>
      <div
        className={
          "mt-3 flex items-center gap-2 text-[17px] font-semibold " +
          (good ? "text-emerald-200" : "text-amber-200")
        }
      >
        <span
          className={
            "h-2.5 w-2.5 rounded-full " +
            (good ? "bg-emerald-400" : "bg-amber-400")
          }
        />
        {value}
      </div>
    </div>
  );
}
function InfoCard({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Wifi;
  title: string;
  text: string;
}) {
  return (
    <div className={panel + " p-5"}>
      <Icon size={20} />
      <h3 className="mt-5 text-[15px] font-semibold">{title}</h3>
      <p className="mt-2 text-[13px] leading-6 text-slate-400">{text}</p>
    </div>
  );
}
function PingCard({
  title,
  value,
}: {
  title: string;
  value: NetworkQuality["gateway"];
}) {
  return (
    <div className={panel + " p-5"}>
      <p className="text-[12px] text-slate-400">{title}</p>
      {value ? (
        <>
          <p className="mt-2 text-[28px] font-semibold">
            {value.averageMs ?? "超时"}
            <span className="ml-1 text-[13px] text-slate-400">ms 平均</span>
          </p>
          <p className="mt-2 text-[12px] text-slate-400">
            最低 {value.minimumMs ?? "—"} ms · 最高 {value.maximumMs ?? "—"} ms
            · 丢包 {value.lossPercent}%
          </p>
        </>
      ) : (
        <p className="mt-3 text-[13px] text-slate-500">没有可测试的默认网关</p>
      )}
    </div>
  );
}

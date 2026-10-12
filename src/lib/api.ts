import { userError } from './userError';

export type HostStatus = {
  connected: boolean;
  version: string;
  gameRoot: string;
  gameExecutable?: string;
  gameRunning: boolean;
  elevated: boolean;
};

export type ProfileChange = {
  file: string;
  section: string;
  key: string;
  current: string | null;
  proposed: string;
};

export type ProfilePreview = {
  id: string;
  displayName: string;
  expectedTarget: string;
  tradeoff: string;
  confidence: string;
  protectedSettings: Array<{ key: string; value: string | null; reason: string }>;
  changes: ProfileChange[];
};
export type JiuYinConfigSetting = {
  id: string; file: string; section: string; key: string; name: string; description: string;
  current: string | null; inputType: "select" | "integer"; minimum: number | null; maximum: number | null;
  step: number | null; advanced: boolean; values: Array<{ value: string; label: string }>;
};
export type JiuYinConfigCatalog = {
  gameRoot: string; capturedAt: string; gameRunning: boolean; settings: JiuYinConfigSetting[];
  protectedSettings: Array<{ file: string; section: string; key: string; value: string | null; reason: string }>;
  profiles: Array<{ id: string; displayName: string; description: string; tradeoff: string; changeCount: number }>;
  note: string;
};


export type SystemTweak = {
  id: string;
  category: string;
  title: string;
  recommended: boolean;
  defaultSelected: boolean;
  risk: string;
  restartRequired: boolean;
  description: string;
  impact: string;
  tradeoff: string;
  applied: boolean;
  states: Array<{ path: string; name: string; desired: unknown; current: unknown; exists: boolean; matches: boolean }>;
};

export type AdvancedSystemItem = {
  id: string; category: string; title: string; target: string; impact: string; tradeoff: string;
  available: boolean; reason: string; applied: boolean; currentLabel: string; backupId: string; restartRequired: boolean;
};
export type AdvancedSystemCatalog = { items: AdvancedSystemItem[]; capturedAt: string };
export type AdvancedSystemResult = { ok: boolean; backupId: string; message: string; changed?: boolean };
export type BackgroundKind = "tasks" | "packages" | "folders";
export type DeviceServiceKind = "services" | "devices" | "msi" | "service-host";
export type DeviceServiceItem = {id:string;kind:DeviceServiceKind;title:string;target:string;detail:string;current:string;stateLabel:string;available:boolean;reason:string;fingerprint:string;options:Array<{value:string;label:string}>;effect:string;dependencies:string[];dependents:string[];backupId:string};
export type DeviceServiceCatalog = {items:DeviceServiceItem[];capturedAt:string;account:string};
export type ExpertItem = {id:string;title:string;category:string;effect:string;current:string;options:Array<{value:string;label:string}>;available:boolean;reason:string;fingerprint:string;backupId:string};
export type ExpertCatalog = {items:ExpertItem[];capturedAt:string;edition:string;build:number};
export type SystemToolsCatalog = {items:Array<{id:string;title:string;detail:string;needsExecutable:boolean;available:boolean}>};
export type DisconnectedItem = {id:string;title:string;target:string;class:string;available:boolean;reason:string;fingerprint:string};
export type DisconnectedCatalog = {items:DisconnectedItem[];capturedAt:string;records:Array<{id:string;title:string;target:string;status:string;message:string;createdAt:string;exitCode:number|null;output:string}>};
export type RepairCatalog = {items:Array<{id:string;title:string;category:string;impact:string;changes:boolean;restart:boolean;available:boolean;command:string}>;jobs:Array<{jobId:string;title:string;status:string;message:string;createdAt:string;finishedAt:string|null;exitCode:number|null;restartRequired:boolean;output:string;logDirectory:string}>;capturedAt:string};
export type BackgroundItem = { id: string; kind: BackgroundKind; title: string; target: string; detail: string; state: string; enabled: boolean; fingerprint: string; canApply: boolean; reason: string; actionLabel: string; effect: string };
export type BackgroundBackup = { backupId: string; id: string; title: string; target: string; createdAt: string; status: string; kind: BackgroundKind };
export type BackgroundCatalog = { items: BackgroundItem[]; backups: BackgroundBackup[]; capturedAt: string; account: string };
export type CleanupFile = { id: string; path: string; bytes: number; modifiedAt: string; root: string };
export type CleanupPreview = { token: string; expiresAt: string; days: number; roots: string[]; items: CleanupFile[]; warnings: string[]; truncated: boolean; capturedAt: string; account: string };
export type DesktopApplication = { id: string; title: string; version: string; publisher: string; scope: string; command: string; fingerprint: string; available: boolean; reason: string };
export type DesktopCatalog = { items: DesktopApplication[]; capturedAt: string; account: string };
export type MaintenanceResult = { ok: boolean; message: string; recordId: string; results?: Array<{path: string; bytes: number; status: string; reason: string}> };
export type MaintenanceRecord = { id: string; kind: string; title?: string; createdAt: string; status: string; results: Array<{path: string; status: string; reason: string}> };

export type StartupItem = {
  id: string;
  name: string;
  command: string;
  scope: string;
  path: string;
  manageable: boolean;
};

export type StartupAudit = { items: StartupItem[]; manageableCount: number; totalCount: number; note: string };

export type ApplicationAudit = { totalCount: number; note: string; items: Array<{ name: string; version: string; publisher: string; installDate: string; scope: string }> };
export type ServiceAudit = { totalCount: number; runningCount: number; note: string; items: Array<{ name: string; displayName: string; state: string; startName: string; path: string; systemComponent: boolean }> };
export type NetworkQuality = { testedAt: string; gateway: PingQuality | null; public: PingQuality; note: string };
export type PingQuality = { target: string; sent: number; received: number; lossPercent: number; minimumMs: number | null; averageMs: number | null; maximumMs: number | null };

export type NetworkAdapterDetail = {
  name: string; description: string; interfaceIndex: number; status: string; linkSpeed: string;
  isDefaultRoute: boolean; isVirtual: boolean;
  mtu: number | null; automaticMetric: boolean | null; interfaceMetric: number | null;
  dnsServers: string[]; receivedBytes: number | null; sentBytes: number | null;
};
export type DnsPreset = { id: string; name: string; primary: string; secondary: string; note: string };
export type TcpOptimizationItem = { id: string; name: string; description: string; tradeoff: string; desiredValue: string; currentValue: string; matches: boolean };
export type TcpOptimizationProfile = { id: string; name: string; description: string; itemIds: string[] };
export type TcpOptimizationState = { interfaceAlias: string; profiles: TcpOptimizationProfile[]; items: TcpOptimizationItem[]; netshGlobalLine: string };
export type NetworkToolkit = {
  capturedAt: string; elevated: boolean; adapters: NetworkAdapterDetail[]; activeAdapterCount: number;
  establishedTcpConnections: number; acceleratorProcesses: string[];
  acceleratorCompatibility: { detected: boolean; mode: string; items: Array<{ name: string; processes: string[] }>; virtualAdapters: string[]; note: string };
  recommendedPhysicalAdapter: string;
  tcp: { raw: string[]; note: string; optimization: TcpOptimizationState };
  qos: { totalCount: number; gamePolicyCount: number; items: Array<Record<string, unknown>>; note: string };
  hosts: { path: string; exists: boolean; size: number; activeEntryCount: number; writable: boolean; content: string; note: string; available?: boolean; status?: "ready" | "read-only" | "missing" | "access-denied" | "read-failed" | "unavailable"; error?: string };
  dnsPresets: DnsPreset[];
};
export type NetworkProbeTargets = {
  capturedAt: string; gameRunning: boolean; gameConnectionCount: number; cachedConnectionCount: number; note: string;
  items: Array<{ target: string; label: string; kind: "jiuyin-active" | "jiuyin-recent" | "default-gateway" | "public"; note: string }>;
};
export type DnsBenchmark = { testedAt: string; queryName: string; note: string; items: Array<{ id: string; name: string; primary: string; secondary: string; attempts: number; succeeded: number; averageMs: number | null; minimumMs: number | null; reachable: boolean; error: string }> };
export type MtuResult = { target: string; maximumPayloadBytes: number; suggestedIpv4Mtu: number; testedAt: string; applied: boolean; note: string };
export type NetworkThroughput = {
  sampledAt: string; durationSeconds: number; totalDownloadMbps: number; totalUploadMbps: number;
  establishedTcpConnections: number; note: string;
  items: Array<{ name: string; interfaceIndex: number; downloadBytesPerSecond: number; uploadBytesPerSecond: number; downloadMbps: number; uploadMbps: number }>;
};
export type NicAudit = {
  interfaceAlias: string; description: string; status: string; elevated: boolean;
  properties: Array<{ displayName: string; displayValue: string; registryKeyword: string; registryValue: unknown[]; options?:Array<{value:string;label:string}>;minimum?:number|null;maximum?:number|null;step?:number|null }>;
  latencyCandidates: Array<{ displayName: string; registryKeyword: string; currentValue: string; desiredValue: string; matches: boolean; reason: string }>;
  pendingCandidateCount: number;
  powerManagement: null | { allowComputerToTurnOffDevice: string; selectiveSuspend: string; wakeOnMagicPacket: string; wakeOnPattern: string };
  recommendation: string; restartNote: string;
};
export type PowerScheme = { guid: string; name: string; active: boolean };
export type NvidiaNipLibrary = { items: Array<{id:string;name:string}>; backups:Array<{id:string;createdAt:string}> };
export type NvidiaNipValue = {id:number;name:string;type:string;value:string;supported:boolean;local:boolean;nativeType:number};
export type NvidiaNipPreview = {token:string;name:string;scope:string;hash:string;total:number;changed:number;skipped:number;rows:Array<{before:NvidiaNipValue;target:NvidiaNipValue;changed:boolean;reason:string}>};
export type PowerLibraryPlan = { id: string; name: string; files: string[]; highRisk: boolean; values: Record<string, number | null>; warnings: string[] };
export type PowerLibrary = { items: PowerLibraryPlan[]; unavailable: Array<{ name: string; reason: string }>; note: string; error?: string };
export type CpuPowerSetting = {
  key: string; name: string; subgroup: string; setting: string; acValue: number;
  valueLabel: string; purpose: string; tradeoff: string;
};
export type CpuPowerProfile = {
  id: string; name: string; badge: string; recommended: boolean; source: string;
  description: string; tradeoff: string; settings: CpuPowerSetting[];
};
export type CpuPowerRecommendation = {
  cpuName: string; manufacturer: string; physicalCores: number; logicalProcessors: number;
  architecture: string; architectureLabel: string; confidence: string; profileId: string; planName: string;
  reason: string; basePlan: string; scope: string; settings: CpuPowerSetting[]; profiles: CpuPowerProfile[];
  analysisSummary: string; rejectedSummary: string; skippedPolicy: string;
  retainedMechanisms?: string; topologyAvailable?: boolean;
};
export type RuntimeSnapshot = {
  capturedAt: string;
  game: null | { running: true; id: number; startTime: string; startToken: string; ageMinutes: number | null; priority: string; processorAffinityMask: number | null; logicalProcessorCount: number; workingSetMB: number; privateMemoryMB: number; totalProcessorSeconds: number; path: string };
  power: { items: PowerScheme[]; active: PowerScheme | null; cpuRecommendation: CpuPowerRecommendation; note: string; library?: PowerLibrary };
  overlays: Array<{ processName: string; displayName: string; count: number; totalWorkingSetMB: number }>;
  largeBackgroundProcesses: Array<{ processName: string; id: number; workingSetMB: number; cpuSeconds: number }>;
  guidance: { priority: string; affinity: string; expectation: string };
};
export type DiagnosticSnapshot = {
  capturedAt: string;
  cpu: { name: string; physicalCores: number; logicalProcessors: number; totalUtilizationPercent: number | null };
  memory: { usedPercent: number; freeGB: number; totalGB: number };
  gameDrive: { name: string; freeGB: number | null; totalGB: number | null };
  gpu: null | { name: string; driverVersion: string; gpuUtilizationPercent: number | null; memoryControllerPercent: number | null; memoryUsedMB: number | null; memoryTotalMB: number | null; temperatureC: number | null; powerWatts: number | null; graphicsClockMHz: number | null };
  game: null | { running: true; id: number; priority: string; threads: number; handles: number; workingSetMB: number };
  pendingReboot: { pending: boolean; componentServicing: boolean; windowsUpdate: boolean; fileRenameOperations: boolean };
  ifeo: { found: boolean; items: Array<Record<string, unknown>>; note: string };
  scheduledTasks: { count: number; items: Array<{ taskName: string; taskPath: string; state: string; author: string }>; truncated: boolean; note: string };
  appx: { count: number; removableCount: number; items: Array<{ name: string; version: string; publisher: string; nonRemovable: boolean }>; note: string };
  note: string;
};
export type ThreadPressure = {
  measuredAt: string; durationSeconds: number; processId: number; processPriority: string;
  equivalentCpuCoresUsed: number; processWholeMachinePercent: number;
  measurementValid: boolean; readableThreadCount: number; activeThreadCount: number; threadCpuAccountedPercent: number;
  hottestThread: null | { id: number; cpuMilliseconds: number; oneCoreUtilizationPercent: number; state: string; waitReason: string };
  dominantThreadCpuSharePercent: number;
  topThreads: Array<{ id: number; cpuMilliseconds: number; oneCoreUtilizationPercent: number; state: string; waitReason: string }>;
  classification: string; explanation: string; gpu: DiagnosticSnapshot["gpu"]; limitation: string;
};

export type SystemGameReadiness = {
  capturedAt: string;
  memory: { totalGB: number; freeGB: number; pageFiles: Array<{ name: string; allocatedMB: number; currentUsageMB: number; peakUsageMB: number }> };
  disks: Array<{ name: string; mediaType: string; busType: string; health: string; operationalStatus: string; sizeGB: number }>;
  trim: { enabled: boolean; raw: string[] };
  scheduler: { cpuPercent: number | null; dpcPercent: number | null; interruptPercent: number | null; interruptsPerSecond: number | null };
  recommendations: string[];
  note: string;
};
export type SystemContention = {
  measuredAt: string; durationSeconds: number; averageCpuPercent: number | null; averageDpcPercent: number | null;
  averageInterruptPercent: number | null; averageInterruptsPerSecond: number | null;
  topProcesses: Array<{ processName: string; processId: number; machineCpuPercent: number; oneCorePercent: number; workingSetMB: number }>;
  classification: "driver-interrupt-pressure" | "cpu-contention" | "no-major-system-contention"; note: string;
};
export type GpuPreferenceState = {
  executablePath: string; currentValue: string; mode: "high-performance" | "power-saving" | "system-default"; applied: boolean; note: string;
};
export type GpuDriverItem = {
  key: string; name: string; description: string; supported: boolean;
  currentValue: number | boolean | null; currentLabel: string; source: string;
};
export type GpuDriverProfile = {
  id: string; name: string; recommended: boolean; qualityCost: string; description: string;
  targets: Array<{ key: string; value: number | boolean; label: string }>;
};
export type GpuDriverProvider = {
  vendor: "nvidia" | "amd"; vendorName: string; gpuName: string; driverVersion: string;
  available: boolean; error: string; scope: "per-game" | "global"; scopeLabel: string;
  applicationFound: boolean; items: GpuDriverItem[]; profiles: GpuDriverProfile[];
};
export type GpuDriverCatalog = {
  capturedAt: string; executablePath: string;
  devices: Array<{ name: string; vendor: "nvidia" | "amd"; driverVersion: string; pnpDeviceId: string }>;
  providers: GpuDriverProvider[]; note: string;
};
export type DisplayAdapterItem = {
  name: string; instanceId: string; vendor: "intel" | "amd" | "nvidia" | "unknown";
  kind: "integrated" | "discrete" | "virtual" | "unknown"; status: string; problemCode: number;
  enabled: boolean; attachedToDesktop: boolean; primary: boolean; eligible?: boolean; blockedReasons?: string[];
};
export type DisplayAdapterCatalog = {
  capturedAt: string; cpuName: string; systemModel: string; isPortable: boolean;
  activeDisplayDetectionReliable: boolean; hasEnabledDiscreteGpu: boolean; canDisableIntegratedGpu: boolean;
  adapters: DisplayAdapterItem[]; eligibleIntegratedGpuIds: string[]; note: string;
};
export type NetworkAdapterHealth = {
  capturedAt: string; issueCount: number; note: string;
  items: Array<{ name: string; description: string; status: string; linkSpeed: string; receivedErrors: number; outboundErrors: number; receivedDiscards: number; outboundDiscards: number; receivedBytes: number; sentBytes: number; healthy: boolean }>;
};
export type NetworkStability = {
  testedAt: string; target: string; sent: number; received: number; lossPercent: number; minimumMs: number | null;
  averageMs: number | null; p95Ms: number | null; maximumMs: number | null; jitterMs: number | null;
  classification: "packet-loss" | "high-jitter" | "latency-spikes" | "stable"; note: string;
};
export type NetworkTrace = { tracedAt: string; target: string; raw: string[]; note: string };

export type RealtimeTelemetry = {
  sampledAt: string;
  selection: { requestedProcessName: string; requestedProcessId: number; resolvedProcessName: string; resolvedProcessId: number };
  game: null | { running: true; name: string; title: string; id: number; cpuPercent: number | null; memoryMB: number; priority: string };
  cpu: { totalPercent: number | null; logicalProcessors: number; temperatureC?: number | null; temperatureSource?: string; temperatureStatus?: string; temperatureMessage?: string };
  memory: { usedPercent: number; usedGB: number; totalGB: number };
  gpu: null | { name: string; utilizationPercent: number | null; memoryControllerPercent: number | null; memoryUsedMB: number | null; memoryTotalMB: number | null; temperatureC: number | null; powerWatts: number | null; graphicsClockMHz: number | null };
  latency: { target: string; milliseconds: number | null; reachable: boolean; kind: "game-connection" | "default-gateway" | "public-fallback"; status: string };
  network: { adapter: string; downloadMbps: number; uploadMbps: number };
  note: string;
};
export type MonitorTarget = {
  processName: string; processId: number; title: string; path: string; cpuPercent: number; gpuPercent: number;
  memoryMB: number; foreground: boolean; autoEligible: boolean; score: number;
};
export type MonitorTargets = {
  capturedAt: string; detected: MonitorTarget | null; candidates: MonitorTarget[]; confidence: "high" | "medium" | "low" | "none"; note: string;
};
export type LabState = {Status:string;Message:string;Until?:string;Applied?:number;Actual?:number;Target?:{Name:string;ProcessId:number;ThreadId:number;Kind:string;Original:number}};
export type LabSample = {offer:string;note:string;validUntil:string;sample:{Process:{Name:string;ProcessId:number;ProcessStart:string};Observed:number;Inaccessible:number;ElapsedMs:number;Threads:Array<{ThreadId:number;ThreadStart:string;Priority:number;CpuMs:number;SingleCorePercent:number}>}};

export type PerformanceReportStats = { average: number | null; minimum: number | null; maximum: number | null; p95: number | null };
export type PerformanceReport = {
  status?: 'recording' | 'completed' | 'interrupted';
  updatedAt?: string;
  schemaVersion: 1;
  id: string;
  createdAt: string;
  source: "automatic-session-recorder";
  game: { processName: string; title: string; processId: number; path: string; bindingMode: "auto" | "manual"; startedAt: string; endedAt: string; durationSeconds: number };
  samples: { telemetry: number; fps: number; latency: number; unreachableLatency: number };
  fps: null | { average: number | null; minimum: number | null; maximum: number | null; onePercentLowAverage: number | null; frameTimeAverageMs: number | null; frameTimeP95Ms: number | null; source: string };
  cpu: { system: PerformanceReportStats; game: PerformanceReportStats };
  gpu: null | { name: string; utilization: PerformanceReportStats; temperature: PerformanceReportStats; power: PerformanceReportStats; memoryPeakMB: number | null };
  memory: { systemUsedPercent: PerformanceReportStats; gameMB: PerformanceReportStats };
  latency: { target: string; kind: string; milliseconds: PerformanceReportStats; jitterMs: number | null; unreachableSamples: number };
  network: { adapter: string; downloadMbps: PerformanceReportStats; uploadMbps: PerformanceReportStats };
  timeline: Array<{ elapsedSeconds: number; fps: number | null; onePercentLow: number | null; cpu: number | null; gpu: number | null; latency: number | null }>;
  observations: Array<{ level: "good" | "info" | "warn"; title: string; detail: string }>;
};

export type PerformanceReportDraft = Omit<PerformanceReport, 'schemaVersion' | 'createdAt' | 'source'>;

export type BackupGroup = {
  type: string;
  title: string;
  path: string;
  count: number;
  items: Array<{ id: string; createdAt: string; size: number | null }>;
};

const token = new URLSearchParams(window.location.search).get("token") ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (import.meta.env.DEV && new URLSearchParams(location.search).get("designPreview") === "1") {
    const { previewResponse } = await import("./designPreview");
    return previewResponse(path) as T;
  }
  try {
  if (window.synapsexDesktop?.hostRequest && new URLSearchParams(window.location.search).get('overlay') !== '1') return await window.synapsexDesktop.hostRequest({path, method:init?.method || 'GET', body:typeof init?.body === 'string' ? init.body : undefined}) as T;
const response = await fetch(path, {
    ...init,
    signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000),
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-SynapseX-Token": token,
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
  return payload as T;
  } catch (error) { throw new Error(userError(error)); }
}

function asList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "object" && value !== null && Object.keys(value).length === 0) return [];
  return value === null || value === undefined || value === "" ? [] : [value as T];
}

function normalizeNetworkToolkit(data: NetworkToolkit): NetworkToolkit {
  return {
    ...data,
    adapters: asList<NetworkAdapterDetail>(data.adapters).map((item) => ({ ...item, dnsServers: asList<string>(item.dnsServers) })),
    acceleratorProcesses: asList<string>(data.acceleratorProcesses),
    acceleratorCompatibility: {
      ...data.acceleratorCompatibility,
      items: asList<NetworkToolkit["acceleratorCompatibility"]["items"][number]>(data.acceleratorCompatibility?.items).map((item) => ({ ...item, processes: asList<string>(item.processes) })),
      virtualAdapters: asList<string>(data.acceleratorCompatibility?.virtualAdapters),
    },
    dnsPresets: asList<DnsPreset>(data.dnsPresets),
    tcp: { ...data.tcp, raw: asList<string>(data.tcp?.raw), optimization: { ...data.tcp.optimization, profiles: asList<TcpOptimizationProfile>(data.tcp.optimization?.profiles).map((item) => ({ ...item, itemIds: asList<string>(item.itemIds) })), items: asList<TcpOptimizationItem>(data.tcp.optimization?.items) } },
    qos: { ...data.qos, items: asList<Record<string, unknown>>(data.qos?.items) },
  };
}

function normalizeQosAudit(data: NetworkToolkit["qos"]): NetworkToolkit["qos"] {
  return { ...data, items: asList<Record<string, unknown>>(data?.items) };
}

function normalizeRuntime(data: RuntimeSnapshot): RuntimeSnapshot {
  return {
    ...data,
    power: normalizePower(data.power),
    overlays: asList<RuntimeSnapshot["overlays"][number]>(data.overlays),
    largeBackgroundProcesses: asList<RuntimeSnapshot["largeBackgroundProcesses"][number]>(data.largeBackgroundProcesses),
  };
}

function normalizePower(power: RuntimeSnapshot["power"]): RuntimeSnapshot["power"] {
  const profiles = asList<CpuPowerProfile>(power.cpuRecommendation?.profiles).map((profile) => ({
    ...profile,
    settings: asList<CpuPowerSetting>(profile.settings),
  }));
  return {
    ...power,
    items: asList<PowerScheme>(power?.items),
    library: { ...power.library, note: power.library?.note ?? "", items: asList<PowerLibraryPlan>(power.library?.items).map(plan => ({ ...plan, files: asList<string>(plan.files), warnings: asList<string>(plan.warnings) })), unavailable: asList<{ name: string; reason: string }>(power.library?.unavailable) },
    cpuRecommendation: { ...power.cpuRecommendation, settings: asList<CpuPowerSetting>(power.cpuRecommendation?.settings), profiles },
  };
}

export const hostApi = {
  nvidiaNipLibrary: async () => {const r=await request<NvidiaNipLibrary>('/api/system/nvidia-nip/library');return {...r,items:asList<NvidiaNipLibrary['items'][number]>(r.items),backups:asList<NvidiaNipLibrary['backups'][number]>(r.backups)};},
  nvidiaNipPreview: async (id:string,filePath:string) => {const r=await request<NvidiaNipPreview>('/api/system/nvidia-nip/preview',{method:'POST',body:JSON.stringify({id,filePath})});return {...r,rows:asList<NvidiaNipPreview['rows'][number]>(r.rows)};},
  applyNvidiaNip: (token:string,acceptGlobal:boolean) => request<{ok:true;name:string;changed:number;skipped:number;backupId:string}>('/api/system/nvidia-nip/apply',{method:'POST',body:JSON.stringify({token,acceptGlobal,confirmation:'APPLY'})}),
  restoreNvidiaNip: (backupId:string) => request<{ok:true;name:string;changed:number;backupId:string}>('/api/system/nvidia-nip/restore',{method:'POST',body:JSON.stringify({backupId,confirmation:'RESTORE'})}),
  labState: () => request<LabState>('/api/lab/state'),
  labSession: <T,>(route:string,body?:unknown) => request<T>(`/api/lab/session/${route}`,body===undefined?undefined:{method:'POST',body:JSON.stringify(body)}),
  labSample: async (processId:number) => {
    const result=await request<LabSample>('/api/lab/sample',{method:'POST',body:JSON.stringify({processId})});
    return {...result,sample:{...result.sample,Threads:asList<LabSample['sample']['Threads'][number]>(result.sample.Threads)}};
  },
  labStart: (offer:string,kind:'thread'|'background',threadId:number,seconds:number) => request<LabState>('/api/lab/start',{method:'POST',body:JSON.stringify({offer,kind,threadId,seconds,confirmation:'APPLY'})}),
  labRestore: () => request<LabState>('/api/lab/restore',{method:'POST',body:JSON.stringify({confirmation:'RESTORE'})}),
  status: () => request<HostStatus>("/api/status"),
  previewProfile: (gameRoot: string, profile: string) =>
    request<ProfilePreview>("/api/jiuyin/preview", {
      method: "POST",
      body: JSON.stringify({ gameRoot, profile }),
    }),
  jiuYinConfigCatalog: async (gameRoot: string) => {
    const result = await request<JiuYinConfigCatalog>("/api/jiuyin/catalog", { method: "POST", body: JSON.stringify({ gameRoot }) });
    return { ...result, settings: asList<JiuYinConfigSetting>(result.settings), protectedSettings: asList<JiuYinConfigCatalog["protectedSettings"][number]>(result.protectedSettings), profiles: asList<JiuYinConfigCatalog["profiles"][number]>(result.profiles) };
  },
  applyProfile: (gameRoot: string, profile: string) =>
    request<{ ok: true; backupId: string }>("/api/jiuyin/apply", {
      method: "POST",
      body: JSON.stringify({ gameRoot, profile, confirmation: "APPLY" }),
    }),
  restoreLatest: (gameRoot: string) =>
    request<{ ok: true; backupId: string }>("/api/jiuyin/restore", {
      method: "POST",
      body: JSON.stringify({ gameRoot, backupId: "latest", confirmation: "RESTORE" }),
    }),
  applyCustomJiuYinSettings: async (gameRoot: string, changes: Array<{ id: string; value: string }>) => {
    const result = await request<{ ok: true; backupId: string; changedCount: number; catalog: JiuYinConfigCatalog }>("/api/jiuyin/custom/apply", { method: "POST", body: JSON.stringify({ gameRoot, changes, confirmation: "APPLY" }) });
    return { ...result, catalog: { ...result.catalog, settings: asList<JiuYinConfigSetting>(result.catalog.settings), protectedSettings: asList<JiuYinConfigCatalog["protectedSettings"][number]>(result.catalog.protectedSettings), profiles: asList<JiuYinConfigCatalog["profiles"][number]>(result.catalog.profiles) } };
  },
  systemAudit: () => request<Record<string, unknown>>("/api/system/audit"),
  systemReadiness: async () => {
    const result = await request<SystemGameReadiness>("/api/system/readiness");
    return { ...result, disks: asList<SystemGameReadiness["disks"][number]>(result.disks), recommendations: asList<string>(result.recommendations), memory: { ...result.memory, pageFiles: asList<SystemGameReadiness["memory"]["pageFiles"][number]>(result.memory.pageFiles) }, trim: { ...result.trim, raw: asList<string>(result.trim.raw) } };
  },
  systemContention: async (seconds = 3) => {
    const result = await request<SystemContention>("/api/system/contention", { method: "POST", body: JSON.stringify({ seconds }) });
    return { ...result, topProcesses: asList<SystemContention["topProcesses"][number]>(result.topProcesses) };
  },
  gpuPreference: (executablePath: string) => request<GpuPreferenceState>("/api/system/gpu-preference", { method: "POST", body: JSON.stringify({ executablePath }) }),
  applyGpuPreference: (executablePath: string) => request<{ ok: true; backupId: string; state: GpuPreferenceState }>("/api/system/gpu-preference/apply", { method: "POST", body: JSON.stringify({ executablePath, confirmation: "APPLY" }) }),
  restoreGpuPreference: () => request<{ ok: true; backupId: string; state: GpuPreferenceState }>("/api/system/gpu-preference/restore", { method: "POST", body: JSON.stringify({ backupId: "latest", confirmation: "RESTORE" }) }),
  gpuDriverCatalog: async (executablePath: string) => {
    const result = await request<GpuDriverCatalog>("/api/system/gpu-driver", { method: "POST", body: JSON.stringify({ executablePath }) });
    return { ...result, devices: asList<GpuDriverCatalog["devices"][number]>(result.devices), providers: asList<GpuDriverProvider>(result.providers).map((provider) => ({ ...provider, items: asList<GpuDriverItem>(provider.items), profiles: asList<GpuDriverProfile>(provider.profiles).map((profile) => ({ ...profile, targets: asList<GpuDriverProfile["targets"][number]>(profile.targets) })) })) };
  },
  applyGpuDriverProfile: async (executablePath: string, provider: "nvidia" | "amd", profileId: string) => {
    const result = await request<{ ok: true; backupId: string; changedCount: number; catalog: GpuDriverCatalog }>("/api/system/gpu-driver/apply", { method: "POST", body: JSON.stringify({ executablePath, provider, profileId, confirmation: "APPLY" }) });
    return { ...result, catalog: await Promise.resolve({ ...result.catalog, devices: asList<GpuDriverCatalog["devices"][number]>(result.catalog.devices), providers: asList<GpuDriverProvider>(result.catalog.providers).map((item) => ({ ...item, items: asList<GpuDriverItem>(item.items), profiles: asList<GpuDriverProfile>(item.profiles).map((profile) => ({ ...profile, targets: asList<GpuDriverProfile["targets"][number]>(profile.targets) })) })) }) };
  },
  restoreGpuDriverProfile: async () => {
    const result = await request<{ ok: true; backupId: string; provider: "nvidia" | "amd"; catalog: GpuDriverCatalog }>("/api/system/gpu-driver/restore", { method: "POST", body: JSON.stringify({ backupId: "latest", confirmation: "RESTORE" }) });
    return { ...result, catalog: { ...result.catalog, devices: asList<GpuDriverCatalog["devices"][number]>(result.catalog.devices), providers: asList<GpuDriverProvider>(result.catalog.providers).map((item) => ({ ...item, items: asList<GpuDriverItem>(item.items), profiles: asList<GpuDriverProfile>(item.profiles).map((profile) => ({ ...profile, targets: asList<GpuDriverProfile["targets"][number]>(profile.targets) })) })) } };
  },
  displayAdapters: async () => {
    const result = await request<DisplayAdapterCatalog>("/api/system/display-adapters");
    return { ...result, adapters: asList<DisplayAdapterItem>(result.adapters).map((item) => ({ ...item, blockedReasons: asList<string>(item.blockedReasons) })), eligibleIntegratedGpuIds: asList<string>(result.eligibleIntegratedGpuIds) };
  },
  disableIntegratedGpu: async () => {
    const result = await request<{ ok: true; backupId: string; changedCount: number; restartRecommended: boolean; catalog: DisplayAdapterCatalog }>("/api/system/display-adapters/disable-integrated", { method: "POST", body: JSON.stringify({ confirmation: "DISABLE" }) });
    return { ...result, catalog: { ...result.catalog, adapters: asList<DisplayAdapterItem>(result.catalog.adapters).map((item) => ({ ...item, blockedReasons: asList<string>(item.blockedReasons) })), eligibleIntegratedGpuIds: asList<string>(result.catalog.eligibleIntegratedGpuIds) } };
  },
  restoreIntegratedGpu: async () => {
    const result = await request<{ ok: true; backupId: string; changedCount: number; restartRecommended: boolean; catalog: DisplayAdapterCatalog }>("/api/system/display-adapters/restore-integrated", { method: "POST", body: JSON.stringify({ backupId: "latest", confirmation: "RESTORE" }) });
    return { ...result, catalog: { ...result.catalog, adapters: asList<DisplayAdapterItem>(result.catalog.adapters).map((item) => ({ ...item, blockedReasons: asList<string>(item.blockedReasons) })), eligibleIntegratedGpuIds: asList<string>(result.catalog.eligibleIntegratedGpuIds) } };
  },
  systemCatalog: () => request<SystemTweak[]>("/api/system/catalog"),
  repairJobs: () => request<RepairCatalog>("/api/repair/jobs"),
  expertCatalog: () => request<ExpertCatalog>("/api/system/expert/catalog"),
  systemTools: () => request<SystemToolsCatalog>("/api/system/tools"),
  disconnectedDevices: () => request<DisconnectedCatalog>("/api/maintenance/disconnected/catalog"),
  removeDisconnected: (item:DisconnectedItem) => request<{ok:boolean;message:string;recordId:string}>("/api/maintenance/disconnected/remove",{method:"POST",body:JSON.stringify({id:item.id,fingerprint:item.fingerprint,confirmation:"REMOVE"})}),
  openSystemTool: (id:string,executable="") => request<{ok:boolean;message:string}>("/api/system/tools/open",{method:"POST",body:JSON.stringify({id,executable,confirmation:"OPEN"})}),
  applyExpert: (item:ExpertItem,choice:string) => request<AdvancedSystemResult>("/api/system/expert/apply",{method:"POST",body:JSON.stringify({id:item.id,fingerprint:item.fingerprint,choice,confirmation:"APPLY"})}),
  restoreExpert: (backupId:string) => request<AdvancedSystemResult>("/api/system/expert/restore",{method:"POST",body:JSON.stringify({backupId,confirmation:"RESTORE"})}),
  startRepair: (id:string) => request<{ok:boolean;jobId:string;message:string}>("/api/repair/start",{method:"POST",body:JSON.stringify({id,confirmation:"RUN"})}),
  deviceServiceCatalog: (kind:DeviceServiceKind) => request<DeviceServiceCatalog>(`/api/device-service/catalog?kind=${kind}`),
  applyDeviceService: (item:DeviceServiceItem,choice:string) => request<AdvancedSystemResult>("/api/device-service/apply",{method:"POST",body:JSON.stringify({kind:item.kind,id:item.id,fingerprint:item.fingerprint,choice,confirmation:"APPLY"})}),
  restoreDeviceService: (backupId:string) => request<AdvancedSystemResult>("/api/device-service/restore",{method:"POST",body:JSON.stringify({backupId,confirmation:"RESTORE"})}),
  cleanupPreview: (days: number, category="temp") => request<CleanupPreview>(`/api/maintenance/cleanup/preview?days=${days}&category=${encodeURIComponent(category)}`),
  cleanupApply: (token: string, ids: string[]) => request<MaintenanceResult>("/api/maintenance/cleanup/apply", { method: "POST", body: JSON.stringify({ token, ids, confirmation: "DELETE" }) }),
  desktopCatalog: () => request<DesktopCatalog>("/api/maintenance/desktop/catalog"),
  uninstallDesktop: (item: DesktopApplication) => request<MaintenanceResult>("/api/maintenance/desktop/uninstall", { method: "POST", body: JSON.stringify({ id: item.id, fingerprint: item.fingerprint, confirmation: "UNINSTALL" }) }),
  maintenanceHistory: async () => asList<MaintenanceRecord>(await request<MaintenanceRecord[]>("/api/maintenance/history")),
  backgroundCatalog: (kind: BackgroundKind) => request<BackgroundCatalog>(`/api/background/catalog?kind=${kind}`),
  applyBackground: (item: BackgroundItem) => request<AdvancedSystemResult>("/api/background/apply", { method: "POST", body: JSON.stringify({ kind: item.kind, id: item.id, fingerprint: item.fingerprint, action: item.kind === "packages" ? "uninstall" : item.kind === "tasks" && !item.enabled ? "enable" : "disable", confirmation: "APPLY" }) }),
  restoreBackground: (backupId: string) => request<AdvancedSystemResult>("/api/background/restore", { method: "POST", body: JSON.stringify({ backupId, confirmation: "RESTORE" }) }),
  advancedSystemCatalog: () => request<AdvancedSystemCatalog>("/api/system/advanced/catalog"),
  applyAdvancedSystem: (id: string) => request<AdvancedSystemResult>("/api/system/advanced/apply", { method: "POST", body: JSON.stringify({ id, confirmation: "APPLY" }) }),
  restoreAdvancedSystem: (id: string, backupId: string) => request<AdvancedSystemResult>("/api/system/advanced/restore", { method: "POST", body: JSON.stringify({ id, backupId, confirmation: "RESTORE" }) }),
  previewSystem: (ids: string[]) => request<{ selectedCount: number; changes: unknown[] }>("/api/system/preview", { method: "POST", body: JSON.stringify({ ids }) }),
  applySystem: (ids: string[]) => request<{ ok: true; backupId: string; catalog: SystemTweak[] }>("/api/system/apply", { method: "POST", body: JSON.stringify({ ids, confirmation: "APPLY" }) }),
  restoreSystem: (backupId = "latest") => request<{ ok: true; backupId: string; catalog: SystemTweak[] }>("/api/system/restore", { method: "POST", body: JSON.stringify({ backupId, confirmation: "RESTORE" }) }),
  startupAudit: () => request<StartupAudit>("/api/startup/audit"),
  applicationsAudit: () => request<ApplicationAudit>("/api/apps/audit"),
  servicesAudit: () => request<ServiceAudit>("/api/services/audit"),
  disableStartup: (items: StartupItem[]) => request<{ ok: true; backupId: string; audit: StartupAudit }>("/api/startup/disable", { method: "POST", body: JSON.stringify({ items, confirmation: "DISABLE" }) }),
  restoreStartup: () => request<{ ok: true; backupId: string; audit: StartupAudit }>("/api/startup/restore", { method: "POST", body: JSON.stringify({ backupId: "latest", confirmation: "RESTORE" }) }),
  backups: () => request<BackupGroup[]>("/api/backups"),
  networkAudit: () => request<Record<string, unknown>>("/api/network/audit"),
  networkTest: () => request<NetworkQuality>("/api/network/test"),
  networkAdapterHealth: async () => {
    const result = await request<NetworkAdapterHealth>("/api/network/adapter-health");
    return { ...result, items: asList<NetworkAdapterHealth["items"][number]>(result.items) };
  },
  networkTargets: async () => {
    const result = await request<NetworkProbeTargets>("/api/network/targets");
    return { ...result, items: asList<NetworkProbeTargets["items"][number]>(result.items) };
  },
  networkStability: (target: string, count = 20) => request<NetworkStability>("/api/network/stability", { method: "POST", body: JSON.stringify({ target, count }) }),
  networkTrace: async (target: string) => {
    const result = await request<NetworkTrace>("/api/network/trace", { method: "POST", body: JSON.stringify({ target }) });
    return { ...result, raw: asList<string>(result.raw) };
  },
  networkToolkit: async () => normalizeNetworkToolkit(await request<NetworkToolkit>("/api/network/toolkit")),
  applyTcpProfile: (interfaceAlias: string, profileId: string, itemIds: string[] = []) => request<{ ok: true; backupId: string; profileId: string; appliedItemIds: string[]; state: TcpOptimizationState }>("/api/network/tcp/apply", { method: "POST", body: JSON.stringify({ interfaceAlias, profileId, itemIds, confirmation: "APPLY" }) }),
  restoreTcpProfile: () => request<{ ok: true; backupId: string; state: TcpOptimizationState }>("/api/network/tcp/restore", { method: "POST", body: JSON.stringify({ backupId: "latest", confirmation: "RESTORE" }) }),
  applyGameQos: async (executablePath: string, dscp = 46) => {
    const result = await request<{ ok: true; alreadyApplied: boolean; policyName: string; executable: string; dscp: number; audit: NetworkToolkit["qos"] }>("/api/network/qos/apply", { method: "POST", body: JSON.stringify({ executablePath, dscp, confirmation: "APPLY" }) });
    return { ...result, audit: normalizeQosAudit(result.audit) };
  },
  removeGameQos: async () => {
    const result = await request<{ ok: true; removedCount: number; audit: NetworkToolkit["qos"] }>("/api/network/qos/remove", { method: "POST", body: JSON.stringify({ confirmation: "REMOVE" }) });
    return { ...result, audit: normalizeQosAudit(result.audit) };
  },
  networkThroughput: async (milliseconds = 1000) => {
    const result = await request<NetworkThroughput>("/api/network/throughput", { method: "POST", body: JSON.stringify({ milliseconds }) });
    return { ...result, items: asList<NetworkThroughput["items"][number]>(result.items) };
  },
  dnsBenchmark: () => request<DnsBenchmark>("/api/network/dns/test"),
  flushDns: () => request<{ ok: true; completedAt: string }>("/api/network/dns/flush", { method: "POST", body: JSON.stringify({ confirmation: "FLUSH" }) }),
  applyDns: (interfaceAlias: string, presetId: string) => request<{ ok: true; backupId: string; interfaceAlias: string; servers: string[] }>("/api/network/dns/apply", { method: "POST", body: JSON.stringify({ interfaceAlias, presetId, confirmation: "APPLY" }) }),
  restoreDns: () => request<{ ok: true; backupId: string; interfaceAlias: string; servers: string[] }>("/api/network/dns/restore", { method: "POST", body: JSON.stringify({ backupId: "latest", confirmation: "RESTORE" }) }),
  testMtu: (target: string) => request<MtuResult>("/api/network/mtu/test", { method: "POST", body: JSON.stringify({ target }) }),
  applyMtu: (interfaceAlias: string, mtu: number) => request<{ ok: true; backupId: string; interfaceAlias: string; previousMtu: number; currentMtu: number }>("/api/network/mtu/apply", { method: "POST", body: JSON.stringify({ interfaceAlias, mtu, confirmation: "APPLY" }) }),
  restoreMtu: () => request<{ ok: true; backupId: string; interfaceAlias: string; currentMtu: number }>("/api/network/mtu/restore", { method: "POST", body: JSON.stringify({ backupId: "latest", confirmation: "RESTORE" }) }),
  nicAudit: (interfaceAlias: string) => request<NicAudit>("/api/network/nic/audit", { method: "POST", body: JSON.stringify({ interfaceAlias }) }),
  applyNicProperty: (interfaceAlias:string, keyword:string, value:string, expected:string) => request<{ok:boolean;backupId:string;audit:NicAudit}>("/api/network/nic/property",{method:'POST',body:JSON.stringify({interfaceAlias,keyword,value,expected,confirmation:'APPLY'})}),
  applyNicLatency: (interfaceAlias: string) => request<{ ok: true; backupId: string; restartRequired: boolean; audit: NicAudit }>("/api/network/nic/apply", { method: "POST", body: JSON.stringify({ interfaceAlias, confirmation: "APPLY" }) }),
  restoreNicLatency: () => request<{ ok: true; backupId: string; restartRequired: boolean; audit: NicAudit }>("/api/network/nic/restore", { method: "POST", body: JSON.stringify({ backupId: "latest", confirmation: "RESTORE" }) }),
  saveHosts: (content: string) => request<{ ok: true; backupId: string; state: NetworkToolkit["hosts"] }>("/api/network/hosts/save", { method: "POST", body: JSON.stringify({ content, confirmation: "SAVE" }) }),
  restoreHosts: () => request<{ ok: true; backupId: string; state: NetworkToolkit["hosts"] }>("/api/network/hosts/restore", { method: "POST", body: JSON.stringify({ backupId: "latest", confirmation: "RESTORE" }) }),
  repairNetwork: () => request<{ ok: true; backupId: string; state: Record<string, unknown> }>("/api/network/repair", { method: "POST", body: JSON.stringify({ confirmation: "REPAIR" }) }),
  restoreNetwork: () => request<{ ok: true; backupId: string; state: Record<string, unknown> }>("/api/network/restore", { method: "POST", body: JSON.stringify({ backupId: "latest", confirmation: "RESTORE" }) }),
  runtimeAudit: async () => normalizeRuntime(await request<RuntimeSnapshot>("/api/runtime/audit")),
  diagnosticAudit: () => request<DiagnosticSnapshot>("/api/diagnostics/audit"),
  monitorTargets: async (force = false) => {
    const result = await request<MonitorTargets>(`/api/monitor/targets${force ? "?refresh=1" : ""}`, { signal: AbortSignal.timeout(12000) });
    return { ...result, candidates: asList<MonitorTarget>(result.candidates) };
  },
  monitorSample: (processName = "", processId = 0) => request<RealtimeTelemetry>("/api/monitor/sample", { method: "POST", body: JSON.stringify({ processName, processId }), signal: AbortSignal.timeout(12000) }),
  performanceReports: async () => asList<PerformanceReport>(await request<PerformanceReport[]>("/api/reports/list", { method: "POST", body: "{}" })),
  savePerformanceReport: (report: PerformanceReportDraft) => request<PerformanceReport>("/api/reports/save", { method: "POST", body: JSON.stringify({ report }) }),
  deletePerformanceReport: (id: string) => request<{ ok: true; id: string }>("/api/reports/delete", { method: "POST", body: JSON.stringify({ id, confirmation: "DELETE" }) }),
  measureThreadPressure: (seconds = 3) => request<ThreadPressure>("/api/diagnostics/thread-pressure", { method: "POST", body: JSON.stringify({ seconds }) }),
  applyPowerScheme: async (guid: string) => { const result = await request<{ ok: true; backupId: string; power: RuntimeSnapshot["power"] }>("/api/runtime/power/apply", { method: "POST", body: JSON.stringify({ guid, confirmation: "APPLY" }) }); return { ...result, power: normalizePower(result.power) }; },
  applyPowerLibraryPlan: async (id: string, acceptFullPlan: boolean, acceptHighRisk: boolean) => { const result = await request<{ ok: true; backupId: string; power: RuntimeSnapshot["power"] }>("/api/runtime/power/library/apply", { method: "POST", body: JSON.stringify({ id, acceptFullPlan, acceptHighRisk, confirmation: "APPLY" }) }); return { ...result, power: normalizePower(result.power) }; },
  restorePowerScheme: async () => { const result = await request<{ ok: true; backupId: string; power: RuntimeSnapshot["power"] }>("/api/runtime/power/restore", { method: "POST", body: JSON.stringify({ backupId: "latest", confirmation: "RESTORE" }) }); return { ...result, power: normalizePower(result.power) }; },
  applyCpuPowerPlan: async (profileId: string) => { const result = await request<{ ok: true; backupId: string; createdGuid: string; appliedSettings: CpuPowerSetting[]; skippedSettings: Array<{ key: string; name: string; reason: string }>; power: RuntimeSnapshot["power"] }>("/api/runtime/power/cpu/apply", { method: "POST", body: JSON.stringify({ profileId, confirmation: "APPLY" }) }); return { ...result, power: normalizePower(result.power), appliedSettings: asList<CpuPowerSetting>(result.appliedSettings), skippedSettings: asList<{ key: string; name: string; reason: string }>(result.skippedSettings) }; },
  restoreCpuPowerPlan: async () => { const result = await request<{ ok: true; backupId: string; removed: boolean; power: RuntimeSnapshot["power"] }>("/api/runtime/power/cpu/restore", { method: "POST", body: JSON.stringify({ backupId: "latest", confirmation: "RESTORE" }) }); return { ...result, power: normalizePower(result.power) }; },
  operations: () => request<Array<{ timestamp: string; category: string; action: string; result: string; backupId: string; detail: Record<string, unknown> }>>("/api/operations"),
};

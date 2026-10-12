// Explicit, development-only visual QA. Never talks to Windows or game files.
import { version } from "../../package.json";
import quickPreviewData from "./quickPreviewData.json";
export const designPreview = import.meta.env.DEV && new URLSearchParams(location.search).get("designPreview") === "1";

export function previewResponse(path: string): unknown {
  const requestUrl = new URL(path, "http://preview.local");
  path = path.split("?")[0];
  if(path === "/api/system/tools") return {items:[{id:"graphics",title:"硬件加速 GPU 调度与图形默认设置",detail:"在 Windows 图形设置中调整 HAGS；是否提供开关由系统和驱动决定。",needsExecutable:false,available:true},{id:"game-properties",title:"游戏全屏优化与兼容性",detail:"选择 EXE 打开属性，不启动游戏。",needsExecutable:true,available:true}]};
  if (path === "/api/device-service/catalog") {
    const kind=requestUrl.searchParams.get("kind")??"services";
    return {account:"预览账户",capturedAt:new Date().toISOString(),items:Array.from({length:32},(_,index)=>({id:`preview-${kind}-${index}`,kind,title:kind==="services"?`应用服务 ${index+1}`:kind==="devices"?`可选设备 ${index+1}`:`PCI 设备 ${index+1}`,target:`PREVIEW-${index+1}`,detail:"仅用于布局测试，不读取本机设备。",current:kind==="services"?"auto":kind==="devices"?"enabled":"1",stateLabel:"当前已启用",available:index!==3,reason:index===3?"当前设备不在直接停用范围。":"",fingerprint:"preview",options:kind==="services"?[{value:"auto",label:"自动"},{value:"manual",label:"手动"},{value:"disabled",label:"禁用"}]:kind==="devices"?[{value:"enabled",label:"启用"},{value:"disabled",label:"禁用"}]:[{value:"1",label:"启用 MSI"},{value:"0",label:"关闭 MSI"}],effect:"修改前确认用途；预览不执行操作。",dependencies:["示例依赖"],dependents:[],backupId:""}))};
  }
  if (path === "/api/system/expert/catalog") return {edition:"Professional",build:26100,capturedAt:new Date().toISOString(),items:quickPreviewData.expert};
  if (path === "/api/maintenance/disconnected/catalog") return {capturedAt:new Date().toISOString(),records:[],items:Array.from({length:22},(_,i)=>({id:`disconnected-preview-${i}`,title:i===2?"历史存储设备":`USB 输入设备 ${i+1}`,target:`USB\\PREVIEW\\INSTANCE_${i+1}`,class:i===2?"DiskDrive":"HIDClass",available:i!==2,reason:i===2?"此类别保留在系统设备管理器中处理，不直接移除基础设备或驱动。":"",fingerprint:"preview"}))};
  if (path === "/api/repair/jobs") return {capturedAt:new Date().toISOString(),items:[{id:"sfc-verify",title:"检查系统文件",category:"系统文件",impact:"扫描受保护系统文件，不请求修复。",changes:false,restart:false,available:true,command:"sfc.exe /verifyonly"},{id:"ip-reset",title:"重置 TCP/IP",category:"网络",impact:"重置网络配置，可能导致断网；不能通过本软件撤销。",changes:true,restart:true,available:true,command:"netsh.exe int ip reset"}],jobs:[{jobId:"preview-job",title:"检查系统文件",status:"completed",message:"命令已结束，请阅读输出确认结果。",createdAt:new Date().toISOString(),finishedAt:new Date().toISOString(),exitCode:0,restartRequired:false,output:"这是示例任务记录，并未运行系统检查。",logDirectory:"预览不产生系统日志"}]};
  if (path === "/api/maintenance/history") return [];
  if (path === "/api/maintenance/cleanup/preview") return { token:"preview-only", days:Number(requestUrl.searchParams.get("days")), expiresAt:new Date(Date.now()+600000).toISOString(), capturedAt:new Date().toISOString(), account:"预览账户", roots:["C:\\Users\\Preview\\AppData\\Local\\Temp"], warnings:[], truncated:false, items:Array.from({length:28},(_,index)=>({id:`preview-clean-${index}`,path:`C:\\Users\\Preview\\AppData\\Local\\Temp\\Example\\temporary-${index+1}.tmp`,bytes:4096*(index+1),modifiedAt:"2026-07-01T10:00:00Z",root:"preview"})) };
  if (path === "/api/maintenance/desktop/catalog") return { account:"预览账户",capturedAt:new Date().toISOString(),items:Array.from({length:25},(_,index)=>({id:`preview-app-${index}`,title:`桌面应用 ${index+1}`,version:"1.0.0",publisher:"示例发布者",scope:index%2?"整台电脑":"当前执行账户",command:'"C:\\Program Files\\Example\\uninstall.exe"',fingerprint:"preview",available:index!==2,reason:index===2?"原卸载程序不存在，需修复安装或使用系统应用管理。":""})) };
  if (path === "/api/startup/audit") return { items:[],totalCount:0,manageableCount:0,note:"预览不读取启动项。" };
  if (path === "/api/apps/audit") return { items:[],totalCount:0,note:"预览不读取本机安装应用。" };
  if (path === "/api/background/catalog") {
    const kind = requestUrl.searchParams.get("kind") ?? "tasks";
    const count = kind === "tasks" ? 42 : 2;
    return { account: "预览账户", capturedAt: new Date().toISOString(), backups: [], items: Array.from({length:count},(_,i)=>({id:`preview-${kind}-${i}`,kind,title:kind === "tasks" ? `应用维护任务 ${i+1}` : kind === "folders" ? `启动快捷方式 ${i+1}.lnk` : `示例应用 ${i+1}`,target:kind === "tasks" ? `\\Example\\Maintenance${i+1}` : "仅用于布局预览",detail:"示例数据，不读取或修改当前电脑。",state:"已启用",enabled:true,fingerprint:"preview",canApply:true,reason:"",actionLabel:kind === "packages" ? "卸载此应用" : "停用",effect:kind === "packages" ? "卸载可能丢失应用数据，安装信息不等于应用备份。" : "只改变后续启动行为，不终止当前运行实例。"})) };
  }
  if (path === "/api/monitor/targets") {
    const target = { processName: "fxgame.exe", processId: 12345, title: "九阴真经 · 预览示例", path: "", cpuPercent: 0, gpuPercent: 0, memoryMB: 0, foreground: false, autoEligible: true, score: 100 };
    return { capturedAt: new Date().toISOString(), detected: target, candidates: [target], confidence: "high", note: "界面预览中的示例进程，不读取本机进程。" };
  }
  if (path === "/api/monitor/sample") return { sampledAt: new Date().toISOString(), selection: {}, game: null, cpu: { totalPercent: null, logicalProcessors: 0 }, memory: { usedPercent: null }, gpu: null, latency: { target: "", milliseconds: null, reachable: false, kind: "public-fallback", status: "预览不探测" }, network: { adapter: "", downloadMbps: 0, uploadMbps: 0 }, note: "仅预览" };
  if (path === "/api/status") return { connected: true, elevated: false, version, gameRoot: "D:\\Games\\九阴真经", gameRunning: new URLSearchParams(location.search).get("previewGame") === "1" };
  if (path === "/api/runtime/audit") return {
    capturedAt: "界面预览",
    game: { running: true, id: 12345, startTime: "", startToken: "preview", ageMinutes: 12, priority: "正常", workingSetMB: 1024, logicalProcessorCount: 8, path: "", processorAffinityMask: null, privateMemoryMB: 1024, totalProcessorSeconds: 1 },
    power: { items: [{ guid: "preview-balanced", name: "平衡", active: true }], active: { guid: "preview-balanced", name: "平衡", active: true }, note: "界面预览不执行电源修改。", cpuRecommendation: {
      cpuName: "Intel(R) Core(TM) i7-9700 CPU @ 3.00GHz", manufacturer: "GenuineIntel", physicalCores: 8, logicalProcessors: 8, architecture: "intel-homogeneous", architectureLabel: "Intel 单一能效等级", confidence: "系统检测", planName: "保留当前电源方案", profileId: "", profiles: [], settings: [], retainedMechanisms: "平台调度 + 核心停放", reason: "Windows 返回单一能效等级。不写入异构调度策略，不根据处理器后缀强制绑核。", analysisSummary: "本机基础电源能力不可用或读取失败。", rejectedSummary: "可继续使用本机已有电源方案。", skippedPolicy: "保留平台调度。", scope: "不创建不完整方案。", basePlan: "Windows 平衡",
    } }, overlays: [], largeBackgroundProcesses: [], guidance: { priority: "优先级修改不保证提高帧率。", affinity: "本机：Intel(R) Core(TM) i7-9700 CPU @ 3.00GHz（Intel 单一能效等级）。不默认绑核，不套用其他电脑的配置。", expectation: "不能将游戏单线程程序改成多线程。" },
  };
  if (path === "/api/backups") return [{ type: "jiuyin", title: "九阴配置备份", path: "preview", count: 1, items: [{ id: "preview", createdAt: "2026-09-06T14:32:00", size: 1024 }] }];
  if (path === "/api/system/audit") return {cpu:"Intel Core i7-13700K",physicalCores:16,logicalProcessors:24,memoryGB:32,windows:"Windows 11 专业版",windowsBuild:26100,uptimeHours:4.2,systemDriveFreeGB:308,gpu:["NVIDIA GeForce RTX 4070"],powerScheme:"平衡"};
  if (path === "/api/services/audit") return {items:[],note:"预览中不读取本机服务。"};
  if (path === "/api/system/readiness") return {capturedAt:new Date().toISOString(),memory:{totalGB:32,freeGB:20,pageFiles:[{name:"C:\\pagefile.sys",allocatedMB:8192,currentUsageMB:768,peakUsageMB:1024}]},disks:[{name:"NVMe SSD",mediaType:"SSD",busType:"NVMe",health:"Healthy",operationalStatus:"OK",sizeGB:1024}],trim:{enabled:true,raw:[]},scheduler:{cpuPercent:12,dpcPercent:0.1,interruptPercent:0.2,interruptsPerSecond:2000},recommendations:[],note:"诊断示例数据，不代表本机状态。"};
  if (path === "/api/system/gpu-preference") return {executablePath:"D:\\Games\\九阴真经\\bin64\\fxgame.exe",currentValue:"",mode:"system-default",applied:false,note:"由 Windows 自动选择显卡。"};
  if (path === "/api/network/audit") return {proxyEnabled:false,activeAdapters:["以太网"],dnsServers:["223.5.5.5"],defaultRoutes:["192.168.1.1"]};
  if (path === "/api/network/adapter-health") return {capturedAt:new Date().toISOString(),items:[],note:"网卡计数示例。"};
  if (path === "/api/network/targets") return {capturedAt:new Date().toISOString(),gameRunning:false,gameConnectionCount:0,cachedConnectionCount:0,note:"预览不连接游戏服务器。",items:[{target:"223.5.5.5",label:"阿里公共 DNS",kind:"public",note:"公共探测目标"}]};
  if (path === "/api/network/toolkit") return {capturedAt:new Date().toISOString(),elevated:true,adapters:[],activeAdapterCount:1,establishedTcpConnections:24,acceleratorProcesses:[],acceleratorCompatibility:{detected:false,mode:"none",items:[],virtualAdapters:[],note:"未检测到加速器。"},recommendedPhysicalAdapter:"",tcp:{raw:[],note:"预览数据",optimization:{profiles:[],items:[]}},qos:{totalCount:0,gamePolicyCount:0,items:[],note:"未设置策略"},hosts:{path:"C:\\Windows\\System32\\drivers\\etc\\hosts",exists:true,size:30,activeEntryCount:1,writable:true,content:Array.from({length:35},(_,i)=>`# Hosts 示例说明 ${i+1}`).join("\n"),note:"Hosts 仅影响域名解析。"},dnsPresets:[]};
  if (path === "/api/system/advanced/catalog") return {capturedAt:new Date().toISOString(),items:quickPreviewData.advanced};
  if (path === "/api/system/catalog") return quickPreviewData.system;
  if (path === "/api/jiuyin/catalog") return {
    gameRoot: "D:\\Games\\九阴真经", capturedAt: "界面预览", gameRunning: false, profiles: [], protectedSettings: [], note: "示例数据，仅用于界面检查；应用操作被阻止。",
    settings: [
      { id: "visual_radius", name: "视野范围（原版范围）", description: "更高上限请使用九阴帧率与视野，仅限管理员。视距增大会增加负载。", current: "250", inputType: "integer", minimum: 50, maximum: 250, advanced: true, values: [] },
      { id: "virtual_object_count", name: "同屏对象数量", description: "控制同屏显示的对象数量。", current: "40", inputType: "integer", minimum: 0, maximum: 1000, advanced: true, values: [] },
      { id: "shadow_quality", name: "角色与场景阴影", description: "控制角色和场景阴影的显示。", current: "1", inputType: "select", values: [{ value: "1", label: "显示" }, { value: "0", label: "隐藏" }] },
      { id: "weather", name: "天气效果", description: "控制天气效果的显示。", current: "1", inputType: "select", values: [{ value: "1", label: "显示" }, { value: "0", label: "隐藏" }] },
    ].map(item => ({ file: "preview.ini", section: "preview", key: item.id, step: 1, ...item })),
  };
  throw new Error("界面预览不执行此操作，也不会修改系统或游戏文件。");
}

export function previewSamples() {
  if (!designPreview || new URLSearchParams(location.search).get("previewEmpty") === "1") return [];
  const now = Date.now();
  const generic = new URLSearchParams(location.search).get("previewTarget") === "generic";
  return Array.from({ length: 61 }, (_, i) => ({ at: now - (60 - i) * 1000, processId: 12345, processName: generic ? "ExampleGame.exe" : "fxgame.exe", title: generic ? "ExampleGame.exe" : "九阴真经", fps: generic ? null : 74, low: generic ? null : 51, frameTime: generic ? null : 13.5 + Math.sin(i * 2.8) * 1.8 + (i % 13 === 3 ? 8 : 0), cpu: 23, gpu: 58 }));
}

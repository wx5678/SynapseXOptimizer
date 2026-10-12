import { AnimatePresence, MotionConfig } from "framer-motion";
import {
  Activity,
  ArchiveRestore,
  ChevronRight,
  Cpu,
  FileBarChart,
  FlaskConical,
  Gauge,
  Gamepad2,
  HardDrive,
  Home,
  MonitorUp,
  Network,
  Rocket,
  Settings,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  OptimizerWorkspace,
  type WorkspacePage,
} from "./components/OptimizerWorkspace";
import { OptimizationAssistant } from "./components/OptimizationAssistant";
import { GameSessionReporter } from "./components/GameSessionReporter";
import { PerformanceReportsPanel } from "./components/PerformanceReports";
import { SynapseXLogo } from "./components/SynapseXLogo";
import { TitleBar } from "./components/TitleBar";
import {
  RealtimeMonitorPanel,
  RealtimeOverlay,
} from "./components/RealtimeMonitor";
import { ConfirmationDialogHost } from "./components/ConfirmationDialog";
import {
  VisualAtmosphere,
  type VisualMode,
  type VisualPalette,
} from "./components/VisualAtmosphere";
import { hostApi } from "./lib/api";
import { designPreview } from "./lib/designPreview";
import { AppearanceContext, useAppearance } from "./lib/appearance";
import { WorkbenchDashboard } from "./components/WorkbenchDashboard";
import { CommunitySigninPanel } from "./components/CommunitySigninPanel";
import { SchedulerLabPanel } from "./components/SchedulerLabPanel";
import { GlobalSigninReminder } from "./components/GlobalSigninReminder";
import { version as appVersion } from "../package.json";
import { LabEntryGate } from './components/LabEntryGate';
import { type SectionRequest } from './components/SidebarFlyout';
import { WorkspaceTopActions } from './components/WorkspaceTopActions';
import { WindowLightEffect } from './components/WindowLightEffect';
import { CloseWindowDialog } from './components/CloseWindowDialog';
import { SensorInstallDialog } from './components/SensorInstallDialog';
import { WorkspaceNavigationLayout } from './components/WorkspaceNavigation';

const navigation = [
  { id: "overview" as const, label: "总览", icon: Home },
  { id: "boost" as const, label: "一键优化", icon: Rocket },
  { id: "jiuyin" as const, label: "游戏配置", icon: Gamepad2 },
  { id: "signin" as const, label: "社区签到", icon: ShieldCheck },
  { id: "diagnostics" as const, label: "性能诊断", icon: Activity },
  { id: "monitor" as const, label: "实时监控", icon: MonitorUp },
  { id: "runtime" as const, label: "游戏进程会话", icon: Cpu },
  { id: "system" as const, label: "系统调整", icon: Gauge },
  { id: "startup" as const, label: "应用与启动项", icon: HardDrive },
  { id: "network" as const, label: "网络优化", icon: Network },
  { id: "repair" as const, label: "修复中心", icon: Stethoscope },
  { id: "reports" as const, label: "性能报告", icon: FileBarChart },
  { id: "history" as const, label: "备份与恢复", icon: ArchiveRestore },
  { id: "settings" as const, label: "软件设置", icon: Settings },
  { id: "lab" as const, label: "实验室", icon: FlaskConical },
];

const navigationGroups = [
  {
    title: "工作台",
    ids: [
      "overview",
      "boost",
      "jiuyin",
      "monitor",
      "system",
      "network",
      "reports",
      "lab",
      "history",
      "settings",
    ],
  },
  { title: "更多工具", ids: ["diagnostics", "runtime", "startup", "repair"] },
];

export default function App() {
  const [page, setPage] = useState<WorkspacePage>("overview");
  const overlay =
    new URLSearchParams(window.location.search).get("overlay") === "1";
  const [gameRunning, setGameRunning] = useState(false);
  const [connected, setConnected] = useState(false);
  const [elevated, setElevated] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [sectionRequest]=useState<SectionRequest>();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [page]);
  const appearance = useAppearance(gameRunning, !overlay);
  const effectiveVisualMode: VisualMode = appearance.effectsActive
    ? "balanced"
    : "eco";
  useEffect(() => {
    document.documentElement.dataset.overlay = overlay ? "1" : "0";
  }, [overlay]);
  useEffect(() => {
    if (overlay) return;
    let active = true;
    let busy = false;
    const refresh = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const value = await hostApi.status();
        if (active) {
          setConnected(value.connected);
          setGameRunning(value.gameRunning);
          setElevated(value.elevated);
        }
      } catch {
        if (active) {
          setConnected(false);
          setElevated(false);
        }
      } finally {
        busy = false;
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [overlay]);
  if (overlay) return <RealtimeOverlay />;
  return (
    <AppearanceContext.Provider value={appearance}>
      <MotionConfig
        reducedMotion={appearance.effectsActive ? "user" : "always"}
        transition={{ duration: appearance.effectsActive ? 0.22 : 0 }}
      >
        <div
          data-page={page}
          className="desktop-workspace min-h-screen bg-transparent text-[#f7f8fa]"
        >
          {page === "overview" &&
            appearance.preferences.particles &&
            appearance.effectsActive && (
              <VisualAtmosphere
                key={appearance.skin}
                mode={effectiveVisualMode}
                palette="blue"
              />
            )}
          <TitleBar />
          <div className="workspace-sidebar-frame" data-drawer-motion={appearance.preferences.motion && !appearance.reducedMotion ? "on" : "off"}>
          <div className="sidebar-drawer-surface" aria-hidden="true" />
          <aside data-drawer-motion={appearance.preferences.motion && !appearance.reducedMotion ? "on" : "off"} className="prism-sidebar workspace-sidebar fixed bottom-0 left-0 top-12 z-40 hidden w-[240px] flex-col px-4 py-5 md:flex">
            <button
              onClick={() => setPage("overview")}
              className="workspace-brand mb-5 flex items-center gap-3 rounded-xl px-3 py-2 text-left"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-black">
                <SynapseXLogo className="h-5 w-5" />
              </span>
              <span>
                <strong className="block text-[18px] tracking-tight">
                  SynapseX
                </strong>
                <small className="mt-1 block text-[11px] text-slate-400">
                  游戏性能工作台
                </small>
              </span>
            </button>
            <nav
              aria-label="主导航"
              className="workspace-navigation min-h-0 flex-1 overflow-y-auto pr-1"
            >
              {navigationGroups.map((group, groupIndex) => (
                <section key={group.title} className="nav-group">
                  {groupIndex === 1 ? (
                    <button
                      className="more-tools-toggle"
                      aria-expanded={toolsOpen}
                      onClick={() => setToolsOpen((v) => !v)}
                    >
                      <HardDrive size={19}/><span>更多工具</span>
                      <ChevronRight
                        size={14}
                        className={toolsOpen ? "rotate-90" : ""}
                      />
                    </button>
                  ) : (
                    <h2>{group.title}</h2>
                  )}
                  {(groupIndex === 0 || toolsOpen) &&
                    group.ids.map((id) => {
                      const item = navigation.find((entry) => entry.id === id)!;
                      const selected = page === item.id;
                      return (
                        <button
                          key={item.id}
                          aria-label={item.label}
                          aria-current={selected ? "page" : undefined}
                          onClick={() => setPage(item.id)}
                          className={`workspace-nav-item ${selected ? "prism-nav-active" : ""}`}
                        >
                          <item.icon size={19} strokeWidth={1.6} />
                          <span>{item.label}</span>
                          {selected && (
                            <span className="nav-selection-dot" />
                          )}
                        </button>
                      );
                    })}
                </section>
              ))}
            </nav>
            <div className="sidebar-signin-space" aria-hidden="true" />
            <button
              className="sidebar-backup"
              aria-label="查看备份与操作记录"
              title="查看备份与操作记录"
              onClick={() => setPage("history")}
            >
              <ShieldCheck size={17} />
              <span>查看备份与操作记录</span>
              <ChevronRight size={13} />
            </button>
            <p className="sidebar-version">
              v{appVersion}{" "}
              <span>
                {connected
                  ? elevated
                    ? "管理员权限"
                    : "服务已连接"
                  : "服务未连接"}
              </span>
            </p>
          </aside>
          <div className="global-signin-dock">
            <GlobalSigninReminder onOpen={() => setPage("signin")} />
          </div>
          </div>
          <div className="workspace-mobile-nav prism-sidebar fixed inset-x-0 top-12 z-40 flex gap-2 overflow-x-auto px-3 py-2 md:hidden">
            {navigation
              .filter((item) => item.id !== "signin")
              .map((item) => (
                <button
                  key={item.id}
                  onClick={() => setPage(item.id)}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[12px] ${page === item.id ? "bg-white font-semibold text-black" : "text-slate-300"}`}
                >
                  <item.icon size={14} />
                  {item.label}
                </button>
              ))}
          </div>
          <main className="workspace-main relative z-10 min-h-screen px-4 pb-16 pt-[112px] sm:px-7 md:ml-[240px] md:px-9 md:pt-[72px] xl:px-11">
            <div className="mx-auto max-w-[1220px]">
              <WorkspaceNavigationLayout context={<div
                className={`workspace-context ${page === "overview" ? "is-overview" : ""}`}
              >
                <span>
                  工作台 <ChevronRight size={13} />{" "}
                  <strong>
                    {navigation.find((item) => item.id === page)?.label}
                  </strong>
                </span>
                <WorkspaceTopActions connected={connected}/>
              </div>}>
              {designPreview && (
                <div className="design-preview-note">
                  界面预览 · 示例数据 · 不执行系统操作
                </div>
              )}
              <AnimatePresence mode="wait">
                {page === "overview" ? (
                  <WorkbenchDashboard
                    key="overview"
                    gameRunning={gameRunning}
                    connected={connected}
                    onNavigate={setPage}
                  />
                ) : page === "signin" ? (
                  <CommunitySigninPanel key="signin" />
                ) : page === "lab" ? (
                  <LabEntryGate key="lab" onLeave={()=>setPage('overview')}><SchedulerLabPanel sectionRequest={sectionRequest?.page==='lab'?sectionRequest:undefined}/></LabEntryGate>
                ) : page === "monitor" ? (
                  <RealtimeMonitorPanel key="monitor" />
                ) : page === "reports" ? (
                  <PerformanceReportsPanel key="reports" />
                ) : (
                  <OptimizerWorkspace
                    key={page}
                    page={page}
                    sectionRequest={sectionRequest?.page===page?sectionRequest:undefined}
                    onNavigate={setPage}
                  />
                )}
              </AnimatePresence>
              </WorkspaceNavigationLayout>
            </div>
          </main>
          {!designPreview && <GameSessionReporter />}
          {page !== "overview" && (
            <OptimizationAssistant
              page={page}
              gameRunning={gameRunning}
              connected={connected}
              visualMode={effectiveVisualMode}
              onNavigate={setPage}
            />
          )}
          <ConfirmationDialogHost />
          <CloseWindowDialog />
          <SensorInstallDialog />
          <WindowLightEffect />
        </div>
      </MotionConfig>
    </AppearanceContext.Provider>
  );
}

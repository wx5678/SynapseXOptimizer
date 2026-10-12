import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SectionRequest } from './SidebarFlyout';
import {VipNotice} from './VipNotice';
import { AdvancedSystemPanel } from "./AdvancedSystemPanel";
import { BackgroundManagerPanel } from "./BackgroundManagerPanel";
import { CleanupPanel } from "./MaintenancePanel";
import { DeviceServicePanel } from "./DeviceServicePanel";
import { ExpertSettingsPanel } from "./ExpertSettingsPanel";
import { SystemToolsPanel } from "./SystemToolsPanel";
import { DisconnectedDevicesPanel } from "./DisconnectedDevicesPanel";
import { WorkspaceNavigation } from './WorkspaceNavigation';

const tabs = [
  "基础与显卡",
  "常用调整",
  "服务与设备",
  "计划任务",
  "空间清理",
  "高级参数",
  "Windows 工具",
  "未连接设备",
] as const;
export function SystemExtensions({ children, header, sectionRequest }: { children: ReactNode; header: ReactNode; sectionRequest?: SectionRequest }) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("常用调整");
  useEffect(()=>{if(sectionRequest && tabs.some(tab=>tab===sectionRequest.section))setTab(sectionRequest.section as (typeof tabs)[number]);},[sectionRequest]);
  const sectionRef = useRef<HTMLElement>(null);
  function selectTab(value: (typeof tabs)[number]) {
    setTab(value);
    // Navigation is now outside this section; reset content, not the old sticky offset.
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: "instant" });
  }
  return (
    <section ref={sectionRef} className="system-sections mb-8">
      <WorkspaceNavigation><div className="section-navigation-shell">
      {header}
      <div
        role="tablist"
        aria-label="系统调整分类"
        className="section-tabs"
      >
        {tabs.map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            tabIndex={tab === value ? 0 : -1}
            aria-controls="system-extension-panel"
            id={`system-extension-${tabs.indexOf(value)}`}
            onClick={() => selectTab(value)}
            onKeyDown={(event) => {
              const index = tabs.indexOf(value);
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : -1;
              if (next >= 0) {
                event.preventDefault();
                selectTab(tabs[next]);
                document.getElementById(`system-extension-${next}`)?.focus();
              }
            }}
            className={`rounded-xl border px-4 py-3 text-sm ${tab === value ? "border-[var(--prism-accent-strong)] bg-[rgba(var(--prism-accent),0.12)]" : "border-[var(--prism-line)] bg-[var(--skin-input)]"}`}
          >
            {value}
          </button>
        ))}
      </div>
      </div></WorkspaceNavigation>
      <div
        role="tabpanel"
        id="system-extension-panel"
        aria-labelledby={`system-extension-${tabs.indexOf(tab)}`}
      >
        {tab === "基础与显卡" ? (
          children
        ) : tab === "常用调整" ? (
          <AdvancedSystemPanel />
        ) : tab === "服务与设备" ? (
          <DeviceServicePanel />
        ) : tab === "计划任务" ? (
          <BackgroundManagerPanel taskOnly />
        ) : tab === "空间清理" ? (
          <CleanupPanel />
        ) : tab === "未连接设备" ? (
          <DisconnectedDevicesPanel />
        ) : tab === "Windows 工具" ? (
          <SystemToolsPanel />
        ) : (
          <><VipNotice feature="system.expert" title="系统高级参数"/><ExpertSettingsPanel /></>
        )}
      </div>
    </section>
  );
}

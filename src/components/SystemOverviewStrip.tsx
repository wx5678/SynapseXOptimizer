import { ChevronDown, Cpu, MemoryStick, Monitor } from "lucide-react";
import type { ReactNode } from "react";

export function SystemOverviewStrip({ data, loading, children }: { data: Record<string, unknown> | null; loading: boolean; children: ReactNode }) {
  const text = (key: string, suffix = "") => data?.[key] === undefined || data?.[key] === null ? (loading ? "正在读取…" : "暂不可用") : `${data[key]}${suffix}`;
  return <details className="system-overview-strip">
    <summary>
      <span className="system-spec"><Cpu size={17} /><span><small>处理器</small><strong>{text("cpu")}</strong></span></span>
      <span className="system-spec"><MemoryStick size={17} /><span><small>内存</small><strong>{text("memoryGB", " GB")}</strong></span></span>
      <span className="system-spec"><Monitor size={17} /><span><small>操作系统</small><strong>{text("windows")}</strong></span></span>
      <span className="system-spec-expand">电脑信息<ChevronDown size={14} /></span>
    </summary>
    <div className="system-spec-details">{children}</div>
  </details>;
}

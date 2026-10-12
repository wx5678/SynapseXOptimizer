import { AnimatePresence, motion } from "framer-motion";
import { Activity, ArchiveRestore, FileBarChart, Gauge, Gamepad2, MessageCircle, ShieldCheck, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { WorkspacePage } from "./OptimizerWorkspace";
import type { VisualMode } from "./VisualAtmosphere";

const pageContext: Record<WorkspacePage, { title: string; text: string }> = {
  lab: {title:'实验室',text:'手动选择目标并采样，执行限时线程提优或后台 CPU 让步；到时恢复原值。拒绝访问不会显示为成功，不保证提高 FPS。'},
  signin: { title: "社区签到", text: "添加账号后分别完成官方登录并保存区服，可勾选多个账号批量签到。打开软件自动签到默认关闭；开启后下次启动生效，失效账号需重新验证。" },
  overview: { title: "总览", text: "先看状态与待优化数量，再进入对应功能。" },
  boost: { title: "一键优化", text: "勾选需要调整的项目，应用前自动备份。" },
  jiuyin: { title: "九阴专项", text: "修改的是游戏配置文件；游戏运行时会锁定写入。" },
  diagnostics: { title: "性能诊断", text: "用线程、GPU 和系统采样区分引擎瓶颈与外部抢占。" },
  monitor: { title: "实时监控", text: "自动识别或手动绑定游戏，读取 FPS、CPU、GPU 与延迟。" },
  runtime: { title: "进程与电源", text: "查看游戏进程状态。切换后的电源方案会保留，需要时可切回或恢复。" },
  system: { title: "系统调整", text: "驱动、GPU 首选项和核显设备开关都提供原值恢复。" },
  startup: { title: "应用与启动项", text: "管理当前用户与整机启动项、启动文件夹和商店应用。应用卸载记录不包含个人数据。" },
  network: { title: "网络优化", text: "先测量再应用，DNS、TCP、MTU 和网卡项目各自恢复。" },
  repair: { title: "修复中心", text: "修复 Clash 退出后残留的本地代理，不重置整个网络。" },
  reports: { title: "性能报告", text: "游戏退出后查看本次 FPS、CPU、GPU、内存和网络汇总。" },
  history: { title: "备份与恢复", text: "这里保存每次写操作前的本机原值。" },
  settings: { title: "软件设置", text: "调整确认机制、测试目标与界面效果。" },
};

export function OptimizationAssistant({
  page,
  gameRunning,
  connected,
  visualMode,
  onNavigate,
}: {
  page: WorkspacePage;
  gameRunning: boolean;
  connected: boolean;
  visualMode: VisualMode;
  onNavigate: (page: WorkspacePage) => void;
}) {
  const [open, setOpen] = useState(false);
  const [triggerSlot, setTriggerSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setTriggerSlot(document.getElementById("workspace-help-slot")); }, []);
  const context = pageContext[page];
  return (
    <>
      {triggerSlot && createPortal(<motion.button
        type="button"
        className="assistant-trigger desktop-no-drag"
        onClick={() => setOpen(true)}
        whileHover={{ y: -2, scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        aria-label="打开使用帮助"
      >
        <span className="assistant-orb"><Sparkles size={16} /></span>
        <span><b>使用帮助</b><small>{gameRunning ? "游戏运行中" : "功能说明与快捷入口"}</small></span>
      </motion.button>, triggerSlot)}
      <AnimatePresence>
        {open && (
          <>
            <motion.button aria-label="关闭使用帮助" className="fixed inset-0 z-[119] cursor-default bg-black/35 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.aside className="assistant-drawer" initial={{ x: "108%", opacity: 0.6 }} animate={{ x: 0, opacity: 1 }} exit={{ x: "108%", opacity: 0.5 }} transition={{ type: "spring", stiffness: 340, damping: 34 }}>
              <header className="flex items-start justify-between border-b border-white/10 p-5"><div className="flex items-center gap-3"><span className="assistant-orb h-10 w-10"><MessageCircle size={18} /></span><div><p className="text-[14px] font-semibold text-white">使用帮助</p><p className="mt-1 text-[11px] text-white/45">功能说明与快捷入口</p></div></div><button aria-label="关闭帮助面板" className="rounded-lg p-2 text-white/45 transition hover:bg-white/10 hover:text-white" onClick={() => setOpen(false)}><X size={17} /></button></header>
              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                <section className="assistant-context-card"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200/70">当前页面</p><h2 className="mt-2 text-[19px] font-semibold text-white">{context.title}</h2><p className="mt-2 text-[12px] leading-6 text-white/60">{context.text}</p></section>
                <section className="grid grid-cols-2 gap-3"><div className="assistant-status"><Activity size={16} /><span><small>本地服务</small><b>{connected ? "已连接" : "未连接"}</b></span></div><div className="assistant-status"><Gamepad2 size={16} /><span><small>游戏进程</small><b>{gameRunning ? "运行中" : "未运行"}</b></span></div><div className="assistant-status"><Gauge size={16} /><span><small>视觉负载</small><b>{visualMode === "eco" ? "低占用" : visualMode === "full" ? "完整" : "平衡"}</b></span></div><div className="assistant-status"><ShieldCheck size={16} /><span><small>修改策略</small><b>先备份</b></span></div></section>
                {gameRunning && <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.06] p-4 text-[12px] leading-5 text-emerald-100">游戏运行中，装饰动效已暂停。操作与监控功能不受影响。</div>}
                <section><p className="mb-2 text-[11px] font-semibold text-white/45">常用入口</p><div className="space-y-2">{[
                  { id: "diagnostics" as const, label: "检查性能瓶颈", icon: Activity },
                  { id: "system" as const, label: "显卡与系统调校", icon: Gauge },
                  { id: "reports" as const, label: "查看游戏性能报告", icon: FileBarChart },
                  { id: "history" as const, label: "查看恢复记录", icon: ArchiveRestore },
                ].map((item) => <button key={item.id} className="assistant-nav" onClick={() => { onNavigate(item.id); setOpen(false); }}><item.icon size={16} /><span>{item.label}</span></button>)}</div></section>
              </div>
              <footer className="border-t border-white/10 px-5 py-4 text-[10px] leading-5 text-white/35">点击快捷入口可打开对应页面，不会直接修改设置。</footer>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

import { WorkspaceNavigation } from './WorkspaceNavigation';
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArchiveRestore,
  ArrowRight,
  ChevronRight,
  Monitor,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { motion } from "framer-motion";
import { hostApi, type BackupGroup } from "../lib/api";
import {
  useWorkbenchSamples,
  type WorkbenchSample,
} from "../lib/telemetryStore";
import { designPreview } from "../lib/designPreview";
import { useAppearanceContext } from "../lib/appearance";
import { DepthCard } from "./DepthCard";
import type { WorkspacePage } from "./OptimizerWorkspace";
import cover from "../assets/jiuyin-cover.png";
import glass from "../assets/graphite-glass.png";
import {useWorkbenchPolling} from '../lib/useWorkbenchPolling';

const reading = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : Math.round(n).toString();
export function WorkbenchDashboard({
  gameRunning,
  connected,
  onNavigate,
}: {
  gameRunning: boolean;
  connected: boolean;
  onNavigate: (page: WorkspacePage) => void;
}) {
  const live = useWorkbenchSamples();
  useWorkbenchPolling(connected&&!designPreview);
  const plotRef = useRef<HTMLDivElement>(null);
  const [plotWidth, setPlotWidth] = useState(720);
  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    const observer = new ResizeObserver(([entry]) => {
      setPlotWidth(Math.max(240, Math.round(entry.contentRect.width)));
    });
    observer.observe(plot);
    return () => observer.disconnect();
  }, []);
  const [preview, setPreview] = useState<WorkbenchSample[]>([]);
  const [backups, setBackups] = useState<BackupGroup[]>([]),
    [backupError, setBackupError] = useState("");
  const [now, setNow] = useState(Date.now());
  const { effectsActive } = useAppearanceContext();
  useEffect(() => {
    if (import.meta.env.DEV && designPreview)
      void import("../lib/designPreview").then((m) =>
        setPreview(m.previewSamples()),
      );
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    if (!connected) return;
    hostApi
      .backups()
      .then((value) => {
        if (active) {
          setBackups(value);
          setBackupError("");
        }
      })
      .catch(() => {
        if (active) setBackupError("暂时无法读取备份记录");
      });
    return () => {
      active = false;
    };
  }, [connected]);
  const samples = designPreview ? preview : live;
  const recent = samples[samples.length - 1];
  const fresh = !!recent && (designPreview || now - recent.at < 10000);
  const current = fresh ? recent : undefined;
  const isJiuyin = !current || /fxgame/i.test(current.processName);
  const [coverFailed, setCoverFailed] = useState(false);
  const [coverAttempt, setCoverAttempt] = useState(0);
  useEffect(() => {
    setCoverFailed(false);
    setCoverAttempt(attempt => attempt + 1);
  }, [connected, isJiuyin]);
  const running = !!current || gameRunning;
  const latestBackup = backups
    .flatMap((group) =>
      group.items.map((item) => ({ ...item, title: group.title })),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const plotEnd = designPreview ? (recent?.at ?? now) : Math.max(now,recent?.at??0);
  const points = samples.filter(
    (s) =>
      plotEnd - s.at <= 60000 &&
      s.frameTime != null &&
      Number.isFinite(s.frameTime),
  );
  const max = Math.max(
    points.length ? 5 : 30,
    Math.ceil(Math.max(0, ...points.map((p) => p.frameTime!)) / 5) * 5,
  );
  // Each point is a collector's sampling-window average, not an individual frame.
  const path = points
    .map(
      (p, i) =>
        `${i === 0 || p.at - points[i - 1].at > 10000 ? "M" : "L"}${44 + Math.max(0, 1 - (plotEnd - p.at) / 60000) * (plotWidth - 68)},${148 - (p.frameTime! / max) * 122}`,
    )
    .join(" ");
  return (
    <motion.section
      className="workbench-dashboard"
      initial={{ opacity: 0, y: effectsActive ? 8 : 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: effectsActive ? 0.25 : 0 }}
    >
      <WorkspaceNavigation><header className="dashboard-heading">
        <div>
          <h1>游戏工作台</h1>
          <p>游戏、性能与配置，一处掌握。</p>
        </div>
      </header></WorkspaceNavigation>
      <section className="dashboard-session" aria-label="当前游戏与性能">
        <div className="dashboard-game">
          <div className="game-description">
            <div className="game-session-label">
              <span className={`game-state ${running ? "running" : ""}`}>
                <span className="game-state-dot" aria-hidden="true" />
                {running ? "运行中" : "未运行"}
              </span>
            </div>
            <div className="game-heading">
              <h2
                title={
                  isJiuyin ? "九阴真经" : current?.title || current?.processName
                }
              >
                {isJiuyin ? "九阴真经" : current?.title || current?.processName}
              </h2>
            </div>
            <p className="game-process">
              <Monitor size={14} />
              <span>{current?.processName || "fxgame.exe"}</span>
              <button
                className="game-switch"
                onClick={() => onNavigate("monitor")}
              >
                切换游戏
                <ChevronRight size={14} />
              </button>
            </p>
            <div className="game-actions">
              <button
                className="workbench-primary"
                onClick={() => onNavigate("boost")}
              >
                查看优化建议
                <ArrowRight size={16} />
              </button>
              <button
                className="workbench-secondary"
                onClick={() => onNavigate(isJiuyin ? "jiuyin" : "runtime")}
              >
                <Settings size={16} />
                {isJiuyin ? "游戏配置" : "进程设置"}
              </button>
            </div>
          </div>
          <DepthCard className="game-cover">
            {coverFailed ? <div className="generic-game-cover" aria-label="游戏封面暂不可用"><Monitor size={64} aria-hidden="true" /></div> :
            <img
              key={coverAttempt}
              src={`${isJiuyin ? cover : glass}?retry=${coverAttempt}`}
              alt=""
              onError={() => setCoverFailed(true)}
            />}
          </DepthCard>
        </div>
        <div className="dashboard-metrics">
          {[
            { label: "实时帧率", code: "FPS", value: current?.fps, unit: "" },
            {
              label: "低帧表现",
              code: "1% LOW",
              value: current?.low,
              unit: "",
            },
            {
              label: "处理器占用",
              code: "CPU",
              value: current?.cpu,
              unit: "%",
            },
            { label: "显卡占用", code: "GPU", value: current?.gpu, unit: "%" },
          ].map((item) => (
            <div key={item.code}>
              <span>
                {item.code}
                <em>{item.label}</em>
              </span>
              <strong>
                {reading(item.value)}
                {item.value != null && <small>{item.unit}</small>}
              </strong>
            </div>
          ))}
        </div>
      </section>
      <div className="dashboard-detail-grid">
        <section className="dashboard-chart">
          <header>
            <h2>
              帧时间趋势 <span>ms</span>
            </h2>
            <div>
              <span className="chart-state">
                {designPreview
                  ? "示例会话"
                  : current?.fps != null
                    ? "当前会话"
                    : "暂无采集数据"}
              </span>
              <button
                className="workbench-secondary"
                onClick={() => onNavigate("monitor")}
              >
                <Settings size={15} />
                采集设置
              </button>
            </div>
          </header>
          <div className="chart-plot" ref={plotRef}>
            <svg
              viewBox={`0 0 ${plotWidth} 176`}
              role="img"
              aria-label={
                points.length > 1
                  ? "最近一分钟采样平均帧时间趋势"
                  : "暂无帧时间趋势数据"
              }
            >
              {[0, 1, 2, 3].map((i) => (
                <g key={i}>
                  <line
                    x1="44"
                    x2={plotWidth - 24}
                    y1={26 + (i * 122) / 3}
                    y2={26 + (i * 122) / 3}
                  />
                  <text x="31" y={30 + (i * 122) / 3} textAnchor="end">
                    {Math.round(max * (1 - i / 3))}
                  </text>
                </g>
              ))}
              {[0, 15, 30, 45, 60].map((i) => (
                <text
                  key={i}
                  x={44 + (i / 60) * (plotWidth - 68)}
                  y="171"
                  textAnchor={i === 0 ? "start" : i === 60 ? "end" : "middle"}
                >
                  {i - 60}s
                </text>
              ))}
              {points.length > 1 && <path d={path} />}
              {points.length===1&&<circle cx={44+Math.max(0,1-(plotEnd-points[0].at)/60000)*(plotWidth-68)} cy={148-(points[0].frameTime!/max)*122} r="3" fill="var(--prism-accent-strong)"/>}
            </svg>
            {points.length < 2 && (
              <div className="chart-empty">
                <span>{points.length===1?'已收到采样，正在积累趋势…':current?.fps!=null?'正在同步帧时间采样…':'开启采集后，在这里查看帧时间趋势'}</span>
                <button onClick={() => onNavigate("monitor")}>
                  前往实时监控
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
          </div>
          <footer>
            采样平均帧时间 · 非逐帧轨迹
            {!designPreview && " · 首页不额外启动采集器"}
          </footer>
        </section>
        <section className="dashboard-backup">
          <header>
            <ArchiveRestore size={17} />
            <h2>最近备份</h2>
          </header>
          <div className="backup-content">
            <span className="backup-icon">
              <ShieldCheck size={24} />
            </span>
            <div>
              <h3>{latestBackup?.title || backupError || "尚无备份记录"}</h3>
              <p>
                {latestBackup
                  ? "原始设置保存在本机，支持查看与恢复。"
                  : "应用配置后，备份记录会显示在这里。"}
              </p>
            </div>
            {latestBackup && (
              <time>
                {latestBackup.createdAt.replace("T", " ").slice(0, 16)}
              </time>
            )}
            <button
              className="workbench-secondary"
              onClick={() => onNavigate("history")}
            >
              查看备份记录
              <ArrowRight size={15} />
            </button>
          </div>
        </section>
      </div>
      <div className="dashboard-bottom-note">
        <Activity size={14} />
        <span>首页展示已有采集数据，不额外启动 FPS 采集。</span>
        <button onClick={() => onNavigate("reports")}>
          性能报告
          <ArrowRight size={14} />
        </button>
      </div>
    </motion.section>
  );
}

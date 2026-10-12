import { useEffect, useRef, useState } from "react";
import { hostApi, type RepairCatalog } from "../lib/api";
import { requestConfirmation } from "./ConfirmationDialog";
const button =
  "rounded-xl border border-[var(--prism-line)] bg-[var(--skin-input)] px-4 py-2 text-xs text-[var(--prism-text)] disabled:cursor-not-allowed disabled:opacity-40";
export function RepairJobsPanel() {
  const [data, setData] = useState<RepairCatalog | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const value = await hostApi.repairJobs();
        if (alive) {
          setData(value);
          setError("");
        }
      } catch (reason) {
        if (alive)
          setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (alive) timer = setTimeout(() => void refresh(), 4000);
      }
    };
    void refresh();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);
  const running = data?.jobs.some((job) =>
    ["running", "starting"].includes(job.status),
  );
  async function start(item: RepairCatalog["items"][number]) {
    if (lock.current) return;
    if (
      !requestConfirmation(
        item.title,
        `${item.command}\n\n${item.impact}${item.restart ? "\n完成后需要重启。" : ""}`,
        {
          danger: item.changes,
          confirmLabel: "开始任务",
          note: item.changes
            ? "这是系统修复或重置，不是可回滚优化。请保存工作；不要关机或强行结束修复进程。"
            : "检查可能持续数分钟并占用 CPU、磁盘。关闭主软件不会强制结束检查。",
        },
      )
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await hostApi.startRepair(item.id);
      setMessage(result.message);
      setData(await hostApi.repairJobs());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const status: Record<string, string> = {
    starting: "正在启动",
    running: "运行中",
    completed: "命令已完成",
    failed: "失败",
    unknown: "结果待核实",
  };
  return (
    <section className="my-6 rounded-2xl border border-[var(--prism-line)] bg-[var(--skin-input)] p-5 text-[var(--prism-text)]">
      <h2 className="text-lg font-semibold">Windows 检查与修复</h2>
      <p className="mt-2 text-xs leading-6">
        每次运行一项，执行过程显示在下方。关闭本软件不会强行中断系统修复；重新打开可查看记录。网络重置可能导致断网，不能当作日常提帧开关。
      </p>
      {error && (
        <p
          role="alert"
          className="my-3 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm"
        >
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="my-3 text-sm">
          {message}
        </p>
      )}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {data?.items.map((item) => (
          <article
            key={item.id}
            className="rounded-xl border border-[var(--prism-line)] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <button
                className={button}
                disabled={busy || running || !item.available}
                onClick={() => void start(item)}
              >
                开始
              </button>
            </div>
            <p className="mt-2 text-xs leading-6">{item.impact}</p>
            <p className="mt-2 break-all text-xs opacity-70">{item.command}</p>
            {!item.available && (
              <p className="mt-2 text-xs">当前系统未找到对应工具。</p>
            )}
          </article>
        ))}
      </div>
      <h3 className="mt-5 text-sm font-semibold">任务记录</h3>
      <div className="mt-3 space-y-3">
        {data?.jobs.map((job) => (
          <details
            key={job.jobId}
            open={["running", "starting"].includes(job.status)}
            className="rounded-xl border border-[var(--prism-line)] p-4"
          >
            <summary className="cursor-pointer text-sm">
              {job.title} · {status[job.status] ?? job.status} ·{" "}
              {new Date(job.createdAt).toLocaleString()}
            </summary>
            <p className="mt-2 text-xs leading-6">
              {job.message}
              {job.exitCode !== null ? ` 退出码：${job.exitCode}` : ""}
              {job.restartRequired ? " · 需要重启" : ""}
            </p>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-[var(--skin-input)] p-3 text-xs">
              {job.output || "尚无输出，某些系统工具会间隔较长时间才更新。"}
            </pre>
            <p className="mt-2 break-all text-xs opacity-70">
              日志目录：{job.logDirectory}
            </p>
          </details>
        ))}
        {!data?.jobs.length && (
          <p className="text-xs opacity-70">尚无任务记录。</p>
        )}
      </div>
    </section>
  );
}

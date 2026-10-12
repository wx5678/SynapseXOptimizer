import { useEffect, useRef, useState } from "react";
import {
  hostApi,
  type CleanupPreview,
  type DesktopApplication,
  type DesktopCatalog,
  type MaintenanceRecord,
  type MaintenanceResult,
} from "../lib/api";
import { requestConfirmation } from "./ConfirmationDialog";

const panel =
  "my-6 rounded-2xl border border-[var(--prism-line)] bg-[var(--skin-input)] p-5 text-[var(--prism-text)]";
const button =
  "rounded-xl border border-[var(--prism-line)] bg-[var(--skin-input)] px-4 py-2 text-xs font-semibold text-[var(--prism-text)] aria-pressed:border-[var(--prism-accent-strong)] aria-pressed:bg-[rgba(var(--prism-accent),0.12)] disabled:cursor-not-allowed disabled:opacity-40";
const field =
  "min-w-0 rounded-xl border border-[var(--prism-line)] bg-[var(--skin-input)] p-3 text-sm text-[var(--prism-text)]";
const bytes = (value: number) =>
  value < 1024
    ? `${value} B`
    : value < 1048576
      ? `${(value / 1024).toFixed(1)} KB`
      : `${(value / 1048576).toFixed(1)} MB`;
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

function MaintenanceHistory({
  kind,
  revision,
}: {
  kind: string;
  revision: number;
}) {
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    hostApi
      .maintenanceHistory()
      .then((items) => {
        if (alive) {
          setRecords(items.filter((item) => item.kind === kind));
          setError("");
        }
      })
      .catch((reason) => {
        if (alive) setError(errorText(reason));
      });
    return () => {
      alive = false;
    };
  }, [kind, revision]);
  const status: Record<string, string> = {
    pending: "执行中或上次操作中断",
    completed: "清理完成",
    partial: "部分清理，含跳过项目",
    launched: "已启动卸载程序，结果需重新扫描确认",
    failed: "启动失败",
  };
  return (
    <details className="mt-4 border-t border-[var(--prism-line)] pt-4">
      <summary className="cursor-pointer text-sm">
        最近操作记录（{records.length}）
      </summary>
      <p className="mt-2 text-xs opacity-70">
        这里只记录操作，不保存被删除的文件或应用数据。
      </p>
      {error && (
        <p role="alert" className="mt-2 text-xs">
          {error}
        </p>
      )}
      {records.map((record) => (
        <details
          key={record.id}
          className="mt-3 rounded-lg border border-[var(--prism-line)] p-3"
        >
          <summary className="cursor-pointer text-xs">
            {new Date(record.createdAt).toLocaleString()} ·{" "}
            {record.title ?? "临时文件清理"} ·{" "}
            {status[record.status] ?? record.status}
          </summary>
          {record.results.map((item, i) => (
            <p key={i} className="mt-2 break-all text-xs">
              {item.status === "deleted" ? "已删除" : "跳过"} · {item.path}{" "}
              {item.reason}
            </p>
          ))}
        </details>
      ))}
    </details>
  );
}

export function CleanupPanel() {
  const [days, setDays] = useState(7);
  const [category, setCategory] = useState("temp");
  const categories: Record<string, { title: string; description: string }> = {
    temp: {
      title: "临时文件",
      description: "用户及 Windows 临时目录中的旧 .tmp、.temp、.log 文件。",
    },
    "browser-cache": {
      title: "浏览器缓存",
      description:
        "当前执行账户的 Chrome、Edge、Firefox 网页及脚本缓存。请先关闭浏览器及后台进程；不扫描密码、Cookie、书签、浏览记录或下载文件。清理后首次加载页面会重新下载缓存。",
    },
    "crash-dumps": {
      title: "崩溃转储",
      description:
        "当前账户 CrashDumps 和 Windows Minidump 中的旧 .dmp 文件。删除后无法再用这些文件分析对应崩溃；不清理系统根目录的完整内存转储。",
    },
    "system-logs": {
      title: "系统维护日志",
      description:
        "Windows CBS、DISM 目录中的旧日志及日志归档。删除会减少历史故障排查信息；不删除事件日志或更新安装文件。",
    },
  };
  categories.thumbnails = {
    title: "缩略图缓存",
    description:
      "当前账户资源管理器的旧 thumbcache 数据库，不删除图标缓存。占用中的文件会跳过；之后浏览图片时会重新生成缩略图。",
  };
  categories["setup-logs"] = {
    title: "Windows 安装日志",
    description:
      "只扫描 Windows 根目录中的 setup*.log、setup*.old、setuplog.txt 和 winnt32.log，不进入子目录或删除安装文件。清理后无法再查阅这些旧安装日志。",
  };
  categories["error-reports"] = {
    title: "Windows 错误报告",
    description:
      "当前账户及系统 WER 报告队列和归档中的旧报告、转储和日志。删除会减少崩溃分析资料，未发送的报告也将无法提交；不关闭错误报告功能。",
  };
  const [data, setData] = useState<CleanupPreview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<MaintenanceResult | null>(null);
  const [revision, setRevision] = useState(0);
  async function scan() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setData(null);
    setSelected([]);
    setPage(0);
    setResult(null);
    try {
      setData(await hostApi.cleanupPreview(days, category));
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  async function clean() {
    if (lock.current || !data || !selected.length) return;
    const chosen = data.items.filter((item) => selected.includes(item.id));
    if (
      !requestConfirmation(
        `永久删除所选${categories[category].title}`,
        `共 ${chosen.length} 个文件，${bytes(chosen.reduce((sum, item) => sum + item.bytes, 0))}。\n${chosen
          .slice(0, 4)
          .map((item) => item.path)
          .join(
            "\n",
          )}${chosen.length > 4 ? "\n其余文件见勾选列表。" : ""}\n\n${categories[category].description}\n占用、更新或路径变化的文件会跳过。`,
        {
          danger: true,
          confirmLabel: "确认永久删除",
          note: "不经过回收站，无法恢复。操作记录不包含文件内容；请先核对所选文件。",
        },
      )
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(await hostApi.cleanupApply(data.token, selected));
    } catch (reason) {
      setError(errorText(reason) + " 请查看记录并重新扫描，勿重复提交旧预览。");
    } finally {
      setData(null);
      setSelected([]);
      setRevision((value) => value + 1);
      setBusy(false);
      lock.current = false;
    }
  }
  const rows = (data?.items ?? []).filter((item) =>
    item.path.toLowerCase().includes(query.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(rows.length / 25));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * 25, (current + 1) * 25);
  const selectedBytes = (data?.items ?? [])
    .filter((item) => selected.includes(item.id))
    .reduce((sum, item) => sum + item.bytes, 0);
  return (
    <section className={panel}>
      <h2 className="text-lg font-semibold">文件与缓存清理</h2>
      <div className="my-3 flex flex-wrap gap-2">
        {Object.entries(categories).map(([key, value]) => (
          <button
            key={key}
            className={button}
            disabled={busy}
            aria-pressed={category === key}
            onClick={() => {
              setCategory(key);
              setData(null);
              setSelected([]);
              setError("");
              setResult(null);
            }}
          >
            {value.title}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs leading-6">
        {categories[category].description}{" "}
        不扫描文档、桌面、游戏文件或着色器缓存。不在后台自动清理。
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select
          aria-label="临时文件保留期限"
          className={field}
          value={days}
          disabled={busy}
          onChange={(event) => {
            setDays(Number(event.target.value));
            setData(null);
            setSelected([]);
          }}
        >
          <option value={7}>超过 7 天未修改</option>
          <option value={30}>超过 30 天未修改</option>
        </select>
        <button className={button} disabled={busy} onClick={() => void scan()}>
          {busy ? "正在处理…" : "扫描可清理文件"}
        </button>
        <span className="text-xs opacity-70">扫描不会删除文件</span>
      </div>
      {error && (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm"
        >
          {error}
        </p>
      )}
      {result && (
        <div
          role="status"
          className="mt-3 rounded-xl border border-[var(--prism-line)] p-3 text-sm"
        >
          <p>{result.message}</p>
          <details className="mt-2">
            <summary className="cursor-pointer">查看逐项结果</summary>
            {result.results?.map((item, index) => (
              <p className="mt-2 break-all text-xs" key={index}>
                {item.status === "deleted" ? "已删除" : "跳过"} · {item.path} ·{" "}
                {item.reason || bytes(item.bytes)}
              </p>
            ))}
          </details>
        </div>
      )}
      {data && (
        <>
          <p className="mt-4 text-xs leading-6">
            执行账户：{data.account} · {data.items.length} 个候选 · 预览有效至{" "}
            {new Date(data.expiresAt).toLocaleTimeString()}
          </p>
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer">扫描范围与提示</summary>
            {data.roots.map((root) => (
              <p className="mt-2 break-all" key={root}>
                {root}
              </p>
            ))}
            {data.warnings.map((warning, index) => (
              <p className="mt-2 break-all" key={index}>
                {warning}
              </p>
            ))}
          </details>
          {data.truncated && (
            <p className="mt-2 text-xs">
              本次达到扫描时间或数量上限，列表不是全部文件。处理后可再次扫描。
            </p>
          )}
          <div className="my-3 flex flex-wrap gap-2">
            <input
              aria-label="搜索清理文件"
              className={field + " flex-1"}
              placeholder="搜索文件路径…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
            <button
              className={button}
              disabled={busy || !visible.length}
              onClick={() =>
                setSelected([
                  ...new Set([...selected, ...visible.map((item) => item.id)]),
                ])
              }
            >
              选择本页
            </button>
            <button
              className={button}
              disabled={busy}
              onClick={() => setSelected([])}
            >
              清空选择
            </button>
          </div>
          <div className="space-y-2">
            {visible.map((item) => (
              <label
                key={item.id}
                className="flex items-start gap-3 rounded-xl border border-[var(--prism-line)] p-3"
              >
                <input
                  type="checkbox"
                  aria-label={`清理 ${item.path}`}
                  checked={selected.includes(item.id)}
                  disabled={busy}
                  onChange={(event) =>
                    setSelected(
                      event.target.checked
                        ? [...selected, item.id]
                        : selected.filter((id) => id !== item.id),
                    )
                  }
                />
                <span className="min-w-0 flex-1 break-all text-xs">
                  {item.path}
                  <span className="mt-1 block opacity-70">
                    {new Date(item.modifiedAt).toLocaleString()} ·{" "}
                    {bytes(item.bytes)}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {!rows.length && <p className="py-4 text-sm">没有符合条件的文件。</p>}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs">
              已选 {selected.length} 个 · {bytes(selectedBytes)}
            </span>
            <div className="flex items-center gap-2 text-xs">
              <button
                className={button}
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
              >
                上一页
              </button>
              {current + 1}/{pages}
              <button
                className={button}
                disabled={current + 1 >= pages}
                onClick={() => setPage(current + 1)}
              >
                下一页
              </button>
            </div>
            <button
              className={button}
              disabled={busy || !selected.length}
              onClick={() => void clean()}
            >
              删除所选文件
            </button>
          </div>
        </>
      )}
      <MaintenanceHistory kind="cleanup" revision={revision} />
    </section>
  );
}

export function DesktopAppsPanel() {
  const [data, setData] = useState<DesktopCatalog | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [query, setQuery] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    setBusy(true);
    lock.current = true;
    hostApi
      .desktopCatalog()
      .then((value) => {
        if (alive) setData(value);
      })
      .catch((reason) => {
        if (alive) setError(errorText(reason));
      })
      .finally(() => {
        if (alive) {
          setBusy(false);
          lock.current = false;
        }
      });
    return () => {
      alive = false;
    };
  }, []);
  async function act(item?: DesktopApplication) {
    if (lock.current) return;
    if (
      item &&
      !requestConfirmation(
        "打开软件卸载程序",
        `${item.title} ${item.version}\n作用范围：${item.scope}\n${item.command}\n\n请先保存工作。卸载可能删除应用数据或共享组件，之后可能需要重新安装。`,
        {
          danger: true,
          confirmLabel: "打开卸载程序",
          note: "不备份应用或数据。将在原卸载窗口继续操作；启动窗口不代表已经卸载。",
        },
      )
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (item) {
        const result = await hostApi.uninstallDesktop(item);
        setMessage(result.message);
      } else {
        setData(await hostApi.desktopCatalog());
      }
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setRevision((value) => value + 1);
      setBusy(false);
      lock.current = false;
    }
  }
  const rows = (data?.items ?? []).filter(
    (item) =>
      (!availableOnly || item.available) &&
      `${item.title} ${item.publisher} ${item.version}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(rows.length / 20));
  const current = Math.min(page, pages - 1);
  return (
    <section className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">桌面软件管理</h2>
        <button className={button} disabled={busy} onClick={() => void act()}>
          {busy ? "正在读取…" : "重新扫描安装状态"}
        </button>
      </div>
      <p className="mt-2 text-xs leading-6">
        读取当前执行账户和整台电脑的安装记录，调用软件原有卸载入口。不删除程序目录，不强制结束进程；卸载完成或取消后请重新扫描。
      </p>
      {data && (
        <p className="mt-2 text-xs opacity-70">
          执行账户：{data.account} · {data.items.length} 项 · 扫描于{" "}
          {new Date(data.capturedAt).toLocaleTimeString()}
        </p>
      )}
      <div className="my-4 flex flex-wrap items-center gap-3">
        <input
          aria-label="搜索桌面软件"
          className={field + " flex-1"}
          placeholder="搜索名称、发布者或版本…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
        />
        <label className="text-xs">
          <input
            type="checkbox"
            checked={availableOnly}
            onChange={(event) => {
              setAvailableOnly(event.target.checked);
              setPage(0);
            }}
          />{" "}
          仅显示可直接卸载
        </label>
      </div>
      {error && (
        <p
          role="alert"
          className="my-3 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="my-3 rounded-xl border border-[var(--prism-line)] p-3 text-sm"
        >
          {message}
        </p>
      )}
      <div className="space-y-2">
        {rows.slice(current * 20, (current + 1) * 20).map((item) => (
          <article
            className="rounded-xl border border-[var(--prism-line)] p-4"
            key={item.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="break-words text-sm font-semibold">
                  {item.title}
                </h3>
                <p className="mt-1 break-words text-xs opacity-70">
                  {item.version || "版本未知"} ·{" "}
                  {item.publisher || "发布者未知"} · {item.scope}
                </p>
              </div>
              <button
                className={button}
                disabled={busy || !item.available}
                onClick={() => void act(item)}
              >
                打开卸载程序
              </button>
            </div>
            {item.reason && <p className="mt-2 text-xs">{item.reason}</p>}
            <details className="mt-2 text-xs opacity-70">
              <summary className="cursor-pointer">查看原卸载入口</summary>
              <p className="mt-2 break-all">{item.command || "未注册"}</p>
            </details>
          </article>
        ))}
      </div>
      {!busy && !rows.length && (
        <p className="py-4 text-sm">没有匹配的软件。</p>
      )}
      <div className="mt-3 flex items-center justify-end gap-3 text-xs">
        <span>
          {rows.length} 项 · {current + 1}/{pages} 页
        </span>
        <button
          className={button}
          disabled={current === 0}
          onClick={() => setPage(current - 1)}
        >
          上一页
        </button>
        <button
          className={button}
          disabled={current + 1 >= pages}
          onClick={() => setPage(current + 1)}
        >
          下一页
        </button>
      </div>
      <MaintenanceHistory kind="uninstall" revision={revision} />
    </section>
  );
}

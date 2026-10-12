import { useEffect, useRef, useState } from "react";
import {
  hostApi,
  type DeviceServiceKind,
  type DeviceServiceItem,
  type DeviceServiceCatalog,
} from "../lib/api";
import { requestConfirmation } from "./ConfirmationDialog";
const button =
  "rounded-xl border border-[var(--prism-line)] bg-[var(--skin-input)] px-4 py-2 text-xs text-[var(--prism-text)] aria-pressed:border-[var(--prism-accent-strong)] aria-pressed:bg-[rgba(var(--prism-accent),0.12)] disabled:cursor-not-allowed disabled:opacity-40";
const labels: Record<DeviceServiceKind, string> = {
  services: "全部服务",
  devices: "设备启用与停用",
  msi: "MSI 中断设置",
  "service-host": "服务宿主分组",
};
export function DeviceServicePanel() {
  const [kind, setKind] = useState<DeviceServiceKind>("services");
  const [data, setData] = useState<DeviceServiceCatalog | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const generation = useRef(0);
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState(true);
  const [page, setPage] = useState(0);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const ticket = ++generation.current;
    locked.current = true;
    setBusy(true);
    setData(null);
    setError("");
    setMessage("");
    setPage(0);
    setQuery("");
    setChoices({});
    hostApi
      .deviceServiceCatalog(kind)
      .then((value) => {
        if (ticket === generation.current) setData(value);
      })
      .catch((reason) => {
        if (ticket === generation.current)
          setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (ticket === generation.current) {
          setBusy(false);
          locked.current = false;
        }
      });
    return () => {
      generation.current++;
    };
  }, [kind]);
  async function act(item?: DeviceServiceItem, restore = false) {
    if (locked.current) return;
    const choice = item ? (choices[item.id] ?? item.current) : "";
    if (
      item &&
      !requestConfirmation(
        restore ? "恢复服务或设备设置" : `修改${item.title}`,
        `${item.target}\n${restore ? "恢复本软件保存的原值；外部更改不会覆盖。" : `当前：${item.options.find((x) => x.value === item.current)?.label ?? item.current} → ${item.options.find((x) => x.value === choice)?.label ?? choice}`}\n\n${item.effect}`,
        { danger: !restore, confirmLabel: restore ? "确认恢复" : "备份并应用" },
      )
    )
      return;
    locked.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (item) {
        const result = restore
          ? await hostApi.restoreDeviceService(item.backupId)
          : await hostApi.applyDeviceService(item, choice);
        setMessage(result.message);
      }
      setData(await hostApi.deviceServiceCatalog(kind));
      setChoices({});
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      if (item) {
        try {
          setData(await hostApi.deviceServiceCatalog(kind));
        } catch {
          /* Keep failure visible. */
        }
      }
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  const rows = (data?.items ?? []).filter(
    (item) =>
      (!only || item.available || item.backupId) &&
      `${item.title} ${item.target} ${item.detail}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(rows.length / 15));
  const current = Math.min(page, pages - 1);
  return (
    <section className="my-6 rounded-2xl border border-[var(--prism-line)] bg-[var(--skin-input)] p-5 text-[var(--prism-text)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">服务与设备管理</h2>
        <button className={button} disabled={busy} onClick={() => void act()}>
          {busy ? "正在读取…" : "重新扫描"}
        </button>
      </div>
      <div className="my-3 flex flex-wrap gap-2">
        {(Object.keys(labels) as DeviceServiceKind[]).map((value) => (
          <button
            className={button}
            aria-pressed={kind === value}
            disabled={busy}
            onClick={() => setKind(value)}
            key={value}
          >
            {labels[value]}
          </button>
        ))}
      </div>
      <p className="text-xs leading-6">
        {kind === "services"
          ? "逐项选择自动、延迟自动、手动或禁用。保留原启动类型；不强制停止当前运行的服务。基础登录和安全服务不在直接停用范围。"
          : kind === "devices"
            ? "列出本机实际设备，可管理可选外设和部分虚拟设备。禁用前确认设备没有承载当前输入、远程连接或工作任务。"
            : kind === "service-host"
              ? "逐项管理 svchost 服务的拆分策略，保留原有未配置状态。此设置影响服务隔离；不会批量合并服务，不会按照本机内存大小套用其他电脑。"
              : "仅列出已有 MSISupported 注册项的 PCI 设备。注册值不是硬件能力检测或实际中断模式证明；需要确认驱动支持，修改后重启。"}
      </p>
      {data && (
        <p className="mt-2 text-xs opacity-70">
          执行账户：{data.account} · {data.items.length} 项 ·{" "}
          {new Date(data.capturedAt).toLocaleTimeString()}
        </p>
      )}
      <div className="my-4 flex flex-wrap items-center gap-3">
        <input
          className={button + " min-w-0 flex-1 py-3"}
          aria-label="搜索服务或设备"
          placeholder="搜索名称、标识或说明…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <label className="text-xs">
          <input
            type="checkbox"
            checked={only}
            onChange={(e) => {
              setOnly(e.target.checked);
              setPage(0);
            }}
          />{" "}
          仅显示可操作或可恢复
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
      <div className="space-y-3">
        {rows.slice(current * 15, (current + 1) * 15).map((item) => (
          <article
            key={item.id}
            className="rounded-xl border border-[var(--prism-line)] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="break-words text-sm font-semibold">
                  {item.title || item.target}
                </h3>
                <p className="mt-1 break-all text-xs opacity-70">
                  {item.target} · {item.stateLabel}
                </p>
              </div>
              <select
                aria-label={`${item.title}应用后设置`}
                className={button}
                disabled={busy || !item.available}
                value={choices[item.id] ?? item.current}
                onChange={(e) =>
                  setChoices({ ...choices, [item.id]: e.target.value })
                }
              >
                {item.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                    {item.current === option.value ? "（当前）" : ""}
                  </option>
                ))}
              </select>
              <button
                className={button}
                disabled={
                  busy ||
                  !item.available ||
                  (choices[item.id] ?? item.current) === item.current
                }
                onClick={() => void act(item)}
              >
                备份并应用
              </button>
              <button
                className={button}
                disabled={busy || !item.backupId}
                onClick={() => void act(item, true)}
              >
                恢复原值
              </button>
            </div>
            {item.detail && (
              <p className="mt-2 break-words text-xs leading-5">
                {item.detail}
              </p>
            )}
            {item.reason && <p className="mt-2 text-xs">{item.reason}</p>}
            {kind === "services" && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer">依赖关系</summary>
                <p className="mt-2 break-all">
                  依赖服务：{item.dependencies.join("、") || "无"}
                </p>
                <p className="mt-2 break-all">
                  依赖本服务：{item.dependents.join("、") || "无"}
                </p>
              </details>
            )}
          </article>
        ))}
      </div>
      {!busy && !rows.length && (
        <p className="py-4 text-sm">没有匹配的项目。</p>
      )}
      <div className="mt-3 flex items-center justify-end gap-3 text-xs">
        {rows.length} 项 · {current + 1}/{pages}
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
    </section>
  );
}

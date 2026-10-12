import { useEffect, useRef, useState } from "react";
import {
  hostApi,
  type DisconnectedCatalog,
  type DisconnectedItem,
} from "../lib/api";
import { requestConfirmation } from "./ConfirmationDialog";
const button =
  "rounded-xl border border-[var(--prism-line)] bg-[var(--skin-input)] px-4 py-2 text-xs text-[var(--prism-text)] disabled:opacity-40";
export function DisconnectedDevicesPanel() {
  const [data, setData] = useState<DisconnectedCatalog | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    lock.current = true;
    setBusy(true);
    hostApi
      .disconnectedDevices()
      .then((value) => {
        if (alive) setData(value);
      })
      .catch((e) => {
        if (alive) setError(String(e));
      })
      .finally(() => {
        if (alive) {
          lock.current = false;
          setBusy(false);
        }
      });
    return () => {
      alive = false;
    };
  }, []);
  async function act(item?: DisconnectedItem) {
    if (lock.current) return;
    if (
      item &&
      !requestConfirmation(
        "移除未连接设备记录",
        `${item.title}\n${item.target}\n\n只移除这一设备实例，不删除驱动包。设备重新接入后可能需要重新配置，某些设备需重新配对或安装。`,
        {
          danger: true,
          confirmLabel: "确认移除",
          note: "保存操作记录，不提供一键撤销或驱动备份。请勿在执行过程中插拔该设备。",
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
        const result = await hostApi.removeDisconnected(item);
        if (result.ok) setMessage(result.message);
        else setError(result.message);
      }
      setData(await hostApi.disconnectedDevices());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const rows = (data?.items ?? []).filter((item) =>
    `${item.title} ${item.target} ${item.class}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const count = Math.max(1, Math.ceil(rows.length / 15));
  const current = Math.min(page, count - 1);
  return (
    <section className="my-6 text-[var(--prism-text)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">未连接设备清理</h2>
        <button className={button} disabled={busy} onClick={() => void act()}>
          {busy ? "正在处理…" : "重新扫描"}
        </button>
      </div>
      <p className="my-3 text-xs leading-6">
        列出 Windows
        保存的未连接设备实例，仅允许逐项移除符合条件的外设记录。不是驱动卸载或性能加速；基础设备、存储及网卡保留在系统设备管理器中处理。
      </p>
      <input
        aria-label="搜索未连接设备"
        className={button + " mb-4 w-full"}
        placeholder="搜索设备名称或实例 ID"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(0);
        }}
      />
      {error && (
        <p
          role="alert"
          className="my-3 rounded-xl border border-red-400/40 p-3 text-sm"
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
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--prism-line)] bg-[var(--skin-input)] p-4"
          >
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <p className="mt-2 break-all text-xs opacity-70">
                {item.class || "未分类"} · {item.target}
              </p>
              {item.reason && <p className="mt-2 text-xs">{item.reason}</p>}
            </div>
            <button
              className={button}
              disabled={busy || !item.available}
              onClick={() => void act(item)}
            >
              移除此记录
            </button>
          </article>
        ))}
      </div>
      <div className="my-4 flex items-center justify-between text-xs">
        <span>
          {rows.length} 个记录 · {current + 1}/{count}
        </span>
        <div className="flex gap-2">
          <button
            className={button}
            disabled={busy || current === 0}
            onClick={() => setPage(current - 1)}
          >
            上一页
          </button>
          <button
            className={button}
            disabled={busy || current + 1 >= count}
            onClick={() => setPage(current + 1)}
          >
            下一页
          </button>
        </div>
      </div>
      <details className="rounded-xl border border-[var(--prism-line)] p-4">
        <summary className="cursor-pointer text-sm">
          最近操作记录（{data?.records.length ?? 0}）
        </summary>
        {data?.records.map((r) => (
          <details key={r.id} className="mt-3 text-xs">
            <summary className="cursor-pointer">
              {r.title} · {new Date(r.createdAt).toLocaleString()}
            </summary>
            <p className="my-2">{r.message}</p>
            <p>退出码：{r.exitCode ?? "未取得"}</p>
            <pre className="mt-2 whitespace-pre-wrap break-all">{r.output}</pre>
          </details>
        ))}
      </details>
    </section>
  );
}

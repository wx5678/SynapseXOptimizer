import { useEffect, useRef, useState } from "react";
import { hostApi, type ExpertCatalog, type ExpertItem } from "../lib/api";
import { requestConfirmation } from "./ConfirmationDialog";

const button =
  "rounded-xl border border-[var(--prism-line)] bg-[var(--skin-input)] px-4 py-2 text-xs text-[var(--prism-text)] aria-pressed:border-[var(--prism-accent-strong)] aria-pressed:bg-[rgba(var(--prism-accent),0.12)] disabled:cursor-not-allowed disabled:opacity-40";
export function ExpertSettingsPanel() {
  const [data, setData] = useState<ExpertCatalog | null>(null);
  const [category, setCategory] = useState("全部");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    let alive = true;
    lock.current = true;
    setBusy(true);
    hostApi
      .expertCatalog()
      .then((value) => {
        if (alive) setData(value);
      })
      .catch((reason) => {
        if (alive) setError(String(reason));
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
  async function act(item?: ExpertItem, restore = false) {
    if (lock.current) return;
    const choice = item ? (choices[item.id] ?? item.current) : "";
    if (
      item &&
      !requestConfirmation(
        restore ? `恢复${item.title}` : `修改${item.title}`,
        `${restore ? "恢复本软件保存的原值，不覆盖其他程序后续修改。" : `${item.options.find((option) => option.value === item.current)?.label ?? item.current} → ${item.options.find((option) => option.value === choice)?.label ?? choice}`}\n\n${item.effect}`,
        {
          danger: !restore,
          confirmLabel: restore ? "确认恢复" : "备份并应用",
          note: "只修改此项，不会批量应用其他参数。注册策略回读成功不等于实际运行行为已经变化。",
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
        const result = restore
          ? await hostApi.restoreExpert(item.backupId)
          : await hostApi.applyExpert(item, choice);
        setMessage(result.message);
      }
      setData(await hostApi.expertCatalog());
      setChoices({});
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      if (item) {
        try {
          setData(await hostApi.expertCatalog());
        } catch {
          /* retain action error */
        }
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const filtered = (data?.items ?? []).filter(
    (item) =>
      (category === "全部" || item.category === category) &&
      `${item.title} ${item.effect}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 12));
  const currentPage = Math.min(page, pageCount);
  return (
    <section className="my-6 text-[var(--prism-text)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">高级参数</h2>
        <button className={button} disabled={busy} onClick={() => void act()}>
          {busy ? "正在读取…" : "重新读取"}
        </button>
      </div>
      <p className="mt-3 text-xs leading-6">
        每项独立选择，应用前保存原值。隐私、安全和更新参数不会加入一键游戏推荐。未配置表示移除本项覆盖值，不是强制开启。
      </p>
      {data && (
        <p className="mt-2 text-xs opacity-70">
          Windows {data.edition} · 内部版本 {data.build} ·{" "}
          {new Date(data.capturedAt).toLocaleTimeString()}
        </p>
      )}
      <div className="my-4 flex flex-wrap gap-2">
        {[
          "全部",
          ...new Set(data?.items.map((item) => item.category) ?? []),
        ].map((value) => (
          <button
            key={value}
            aria-pressed={category === value}
            className={button}
            onClick={() => {
              setCategory(value);
              setPage(1);
            }}
          >
            {value}
          </button>
        ))}
      </div>
      <input
        aria-label="搜索高级参数"
        placeholder="搜索权限、诊断、存储或其他设置"
        className={button + " mb-4 w-full"}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setPage(1);
        }}
      />
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
      <div className="grid gap-4 lg:grid-cols-2">
        {filtered
          .slice((currentPage - 1) * 12, currentPage * 12)
          .map((item) => (
            <article
              key={item.id}
              className="flex flex-col rounded-2xl border border-[var(--prism-line)] bg-[var(--skin-input)] p-5"
            >
              <p className="text-xs opacity-70">{item.category}</p>
              <h3 className="mt-2 text-sm font-semibold">{item.title}</h3>
              <p className="my-3 text-xs leading-6">{item.effect}</p>
              {item.reason && (
                <p className="mb-3 text-xs text-amber-600">{item.reason}</p>
              )}
              <label className="mt-auto text-xs">
                应用后设置
                <select
                  className={button + " mt-2 w-full"}
                  aria-label={`${item.title}应用后设置`}
                  disabled={busy || !item.available}
                  value={choices[item.id] ?? item.current}
                  onChange={(event) =>
                    setChoices({ ...choices, [item.id]: event.target.value })
                  }
                >
                  {!item.options.some(
                    (option) => option.value === item.current,
                  ) && (
                    <option value={item.current}>
                      {item.current ? `当前值：${item.current}` : "状态不可用"}
                    </option>
                  )}
                  {item.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                      {item.current === option.value ? "（当前）" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
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
            </article>
          ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-xs">
          {filtered.length} 项 · 第 {currentPage} / {pageCount} 页
        </p>
        <div className="flex gap-2">
          <button
            className={button}
            disabled={busy || currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
          >
            上一页
          </button>
          <button
            className={button}
            disabled={busy || currentPage >= pageCount}
            onClick={() => setPage(currentPage + 1)}
          >
            下一页
          </button>
        </div>
      </div>
    </section>
  );
}

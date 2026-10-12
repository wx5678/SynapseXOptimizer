import { useEffect, useRef, useState } from "react";
import { RefreshCw, RotateCcw, Settings2 } from "lucide-react";
import { hostApi, type AdvancedSystemCatalog, type AdvancedSystemItem } from "../lib/api";
import { requestConfirmation } from "./ConfirmationDialog";

const button = "inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--prism-line)] bg-[var(--skin-input)] px-4 py-2.5 text-[12px] font-semibold text-[var(--prism-text)] disabled:cursor-not-allowed disabled:opacity-40";

export function AdvancedSystemPanel() {
  const [catalog, setCatalog] = useState<AdvancedSystemCatalog | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("全部");
  const [query, setQuery] = useState("");
  const refresh = async () => setCatalog(await hostApi.advancedSystemCatalog());

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    hostApi.advancedSystemCatalog().then((value) => { if (!cancelled) setCatalog(value); })
      .catch((reason) => { if (!cancelled) setError(String(reason instanceof Error ? reason.message : reason)); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, []);

  async function execute(item?: AdvancedSystemItem, restore = false) {
    if (inFlight.current) return;
    if (item && !requestConfirmation(restore ? "恢复高级系统设置" : item.title,
      restore ? `将恢复“${item.title}”最近一次备份中的原设置。\n${item.tradeoff}` : `${item.impact}\n\n功能影响：${item.tradeoff}`,
      { danger: !restore, confirmLabel: restore ? "恢复原设置" : "备份并应用" })) return;
    inFlight.current = true; setBusy(true); setError(""); setMessage("");
    try {
      if (item) {
        const result = restore ? await hostApi.restoreAdvancedSystem(item.id, item.backupId) : await hostApi.applyAdvancedSystem(item.id);
        setMessage(`${item.title}：${result.message}${result.backupId ? ` 备份：${result.backupId}` : ""}`);
      }
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      // A failed write can leave a recoverable backup; don't hide its restore entry.
      if (item) { try { await refresh(); } catch { /* Keep the original action error. */ } }
    } finally { inFlight.current = false; setBusy(false); }
  }

  const items = catalog?.items ?? [];
  const visible = items.filter((item) => (category === "全部" || item.category === category) && `${item.title} ${item.target}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <section className="mb-6 rounded-2xl border border-[var(--prism-line)] bg-[var(--skin-input)] p-5 text-[var(--prism-text)]" aria-labelledby="advanced-system-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 id="advanced-system-title" className="flex items-center gap-2 text-lg font-semibold"><Settings2 size={20} />服务、计划任务与更新</h2>
          <p className="mt-2 max-w-3xl text-[13px] leading-6">支持逐项应用与恢复，也可在一键优化中按档位选择。服务启动方式在重启后生效，不强制停止当前服务。</p>
          <p className="mt-1 text-[12px] opacity-70">{catalog ? `${items.length} 个项目 · ${items.filter((item) => item.available).length} 个可操作 · 检查时间 ${new Date(catalog.capturedAt).toLocaleTimeString()}` : "正在读取当前电脑…"}</p>
        </div>
        <button className={button} disabled={busy} onClick={() => void execute()}><RefreshCw size={14} className={busy ? "animate-spin" : ""} />{busy ? "处理中…" : "重新检测"}</button>
      </div>
      <div className="my-4 flex flex-wrap items-center gap-2">
        {["全部", "服务", "计划任务", "更新"].map((name) => <button key={name} className={button} aria-pressed={category === name} style={category === name ? { borderColor: "var(--prism-accent-strong)", color: "var(--prism-accent-strong)" } : undefined} onClick={() => setCategory(name)}>{name}</button>)}
        <input aria-label="搜索高级系统项目" placeholder="搜索名称或服务…" value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-[var(--prism-line)] bg-[var(--skin-input)] p-3 text-sm text-[var(--prism-text)]" />
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm">{error}</p>}
      {message && <p role="status" className="mb-4 break-words rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm">{message}</p>}
      <div className="system-advanced-list">
        {visible.map((item) => <article key={item.id} className="system-advanced-row">
          <div className="system-advanced-description">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{item.title}</h3><span className="text-xs">{item.currentLabel}</span></div>
          <p className="mt-2 text-[12px] leading-6">{item.impact}</p>
          <p className="mt-1 text-[12px] leading-6"><strong>影响：</strong>{item.tradeoff}</p>
          {!item.available && <p className="mt-2 break-words text-[12px] leading-5">不可操作原因：{item.reason}</p>}
          <details className="mt-2 text-xs opacity-70"><summary className="cursor-pointer">对应系统项目</summary><p className="mt-2 break-all font-mono">{item.target}</p></details>
          </div>
          <div className="system-advanced-actions">
            <button className={button} disabled={busy || !item.available || item.applied} onClick={() => void execute(item)}>{item.applied ? "已是目标设置" : "备份并应用"}</button>
            <button className={button} disabled={busy || !item.available || !item.backupId} onClick={() => void execute(item, true)}><RotateCcw size={13} />恢复原设置</button>
          </div>
          {item.applied && !item.backupId && <p className="system-advanced-backup-note mt-2 text-[11px] opacity-65">没有本软件的原值备份；此状态可能来自 Windows 或其他工具，不提供猜测恢复。</p>}
        </article>)}
      </div>
      {catalog && visible.length === 0 && <p className="py-6 text-sm">没有匹配的项目。</p>}
    </section>
  );
}

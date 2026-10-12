import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  RefreshCw,
  Rocket,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { hostApi } from "../lib/api";
import {
  executeQuickPlan,
  restoreQuickResults,
  quickPlan,
  quickTiers,
  quickTierFeature,
  type QuickTier,
  type QuickSources,
  type QuickRow,
  type QuickResult,
} from "../lib/quickPresets";
import { requestConfirmation } from "./ConfirmationDialog";
import glassSculpture from "../assets/graphite-glass.png";
import {requireVip,useVip} from './VipNotice';
import {userError} from '../lib/userError';

const journalKey = "synapsex.quick-optimization.v1";
const button = "prism-button-secondary px-4 py-2 text-sm disabled:opacity-40";
const empty: QuickSources = { system: [], advanced: [], expert: [] };
async function loadSources(): Promise<QuickSources> {
  const results = await Promise.allSettled([
    hostApi.systemCatalog(),
    hostApi.advancedSystemCatalog(),
    hostApi.expertCatalog(),
  ]);
  return {
    system: results[0].status === "fulfilled" ? results[0].value : [],
    advanced: results[1].status === "fulfilled" ? results[1].value.items : [],
    expert: results[2].status === "fulfilled" ? results[2].value.items : [],
    errors: results.flatMap((r, i) =>
      r.status === "rejected"
        ? [
            `${["基础设置", "服务与任务", "高级参数"][i]}读取失败：${String(r.reason)}`,
          ]
        : [],
    ),
  };
}
function readJournal(): QuickResult[] {
  try {
    const saved = JSON.parse(localStorage.getItem(journalKey) ?? "{}");
    return Array.isArray(saved.results)
      ? saved.results.map((r: QuickResult) =>
          r.status === "running" ||
          r.status === "pending" ||
          r.status === "restoring"
            ? {
                ...r,
                status: "failed",
                message: "上次执行中断，结果待核实；请重新检测并查看原值备份。",
              }
            : r,
        )
      : [];
  } catch {
    return [];
  }
}
export function QuickOptimizationPanel() {
  const vip = useVip();
  const [sources, setSources] = useState<QuickSources>(empty),
    [tier, setTier] = useState<QuickTier>("basic"),
    [excluded, setExcluded] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [applying, setApplying] = useState(false),
    [page, setPage] = useState(0),
    [error, setError] = useState(""),
    [accessMessage, setAccessMessage] = useState(""),
    [results, setResults] = useState<QuickResult[]>(readJournal),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState<"all" | QuickRow["kind"]>("all"),
    [status, setStatus] = useState("all");
  const catalogRef = useRef<HTMLElement>(null);
  const tierRequest = useRef(0);
  const lock = useRef(false),
    cancelled = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
      tierRequest.current++;
      cancelled.current = true;
    };
  }, []);
  async function refresh() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const data = await loadSources();
      if (alive.current) setSources(data);
    } catch (e) {
      if (alive.current) setError(String(e));
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const rows = quickPlan(tier, sources).map(row=>row.kind==='expert'&&!vip.features.includes('system.expert')?{...row,available:false,reason:'VIP 高级参数：免费方案自动跳过'}:row),
    selected = rows.filter(
      (r) => r.available && !r.applied && !excluded.includes(r.key),
    ),
    name = quickTiers.find((t) => t.id === tier)!.name;
  const filtered = rows.filter(
    (r) =>
      `${r.title} ${r.effect}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()) &&
      (category === "all" || r.kind === category) &&
      (status === "all" ||
        (status === "selected" && selected.some((s) => s.key === r.key)) ||
        (status === "applied" && r.applied) ||
        (status === "unavailable" && !r.available)),
  );
  const categories = [
    { id: "all" as const, label: "全部项目" },
    { id: "system" as const, label: "基础设置" },
    { id: "advanced" as const, label: "服务与任务" },
    { id: "expert" as const, label: "隐私与权限" },
  ];
  function resetFilters() {
    setQuery("");
    setCategory("all");
    setStatus("all");
    setPage(0);
  }
  const pageCount = Math.max(1, Math.ceil(filtered.length / 12)),
    currentPage = Math.min(page, pageCount - 1);
  function changePage(next: number) {
    setPage(next);
    catalogRef.current?.focus({ preventScroll: true });
    catalogRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }
  async function readRow(row: QuickRow) {
    const data: QuickSources = { ...empty };
    if (row.kind === "system") data.system = await hostApi.systemCatalog();
    else if (row.kind === "advanced")
      data.advanced = (await hostApi.advancedSystemCatalog()).items;
    else data.expert = (await hostApi.expertCatalog()).items;
    return quickPlan("maximum", data).find((x) => x.key === row.key);
  }
  async function apply() {
    if (lock.current || !selected.length) return;
    setError('');setAccessMessage('');
    const feature = quickTierFeature(tier);
    if(feature) { try { await requireVip(feature); } catch(e) { setAccessMessage(userError(e)); return; } }
    if (
      !requestConfirmation(
        `应用${name}方案`,
        `本次只应用已勾选的 ${selected.length} 项，已取消的项目不会修改。\n\n${tier === "maximum" ? "最大档包含权限、服务及更新限制，可影响语音、定位、打印等功能。请展开清单核对本次实际选择，需要保留的功能请取消后重新勾选。" : "请展开清单核对设置名称和目标值；功能影响见页面中的项目说明。"}`,
        {
          danger: tier !== "basic",
          confirmLabel: "备份并应用所选项",
          items: selected.map((r) => `${r.title} → ${r.desired}`),
          note: "按项备份和回读，失败即停止后续项；已完成项不会自动撤销。服务启动方式需重启生效，不会自动重启。",
        },
      )
    )
      return;
    lock.current = true;
    cancelled.current = false;
    setBusy(true);
    setApplying(true);
    setError("");
    try {
      await executeQuickPlan(selected, {
        read: readRow,
        cancelled: () => cancelled.current,
        apply: async (row) => {
          if (!window.synapsexDesktop?.quickApply) throw Error('请在新版桌面客户端执行一键优化。');
          try {
            return await window.synapsexDesktop.quickApply({tier,kind:row.kind,id:row.id,fingerprint:row.expert?.fingerprint,choice:row.choice});
          } catch(e) { throw new Error(userError(e)); }
        },
        publish: (next) => {
          localStorage.setItem(
            journalKey,
            JSON.stringify({
              tier,
              at: new Date().toISOString(),
              results: next,
            }),
          );
          if (alive.current) setResults(next);
        },
      });
    } catch (e) {
      if (alive.current)
        setError(
          `执行记录保存或执行流程异常，已停止：${String(e)}。请到备份与对应设置页核对结果。`,
        );
    } finally {
      lock.current = false;
      if (alive.current) {
        setApplying(false);
        setBusy(false);
        void refresh();
      }
    }
  }
  async function restoreBatch() {
    if (lock.current) return;
    const candidates = results.filter(
      (r) => r.backupId && r.status !== "restored",
    );
    if (
      !candidates.length ||
      !requestConfirmation(
        "恢复本次优化",
        `将按相反顺序恢复本次记录中的 ${candidates.length} 项原值，不使用其他批次的最近备份。当前值出现冲突时停止。`,
        {
          confirmLabel: "恢复本次原值",
          items: candidates.map((r) => `${r.title} · ${r.backupId}`),
        },
      )
    )
      return;
    lock.current = true;
    cancelled.current = false;
    setBusy(true);
    setApplying(true);
    setError("");
    try {
      await restoreQuickResults(results, {
        cancelled: () => cancelled.current,
        read: async (key) => {
          const row = quickPlan("maximum", sources).find((r) => r.key === key);
          return row ? readRow(row) : undefined;
        },
        restore: (row, id) =>
          row.kind === "system"
            ? hostApi.restoreSystem(id)
            : row.kind === "advanced"
              ? hostApi.restoreAdvancedSystem(row.id, id)
              : hostApi.restoreExpert(id),
        publish: (next) => {
          localStorage.setItem(
            journalKey,
            JSON.stringify({
              tier,
              at: new Date().toISOString(),
              results: next,
            }),
          );
          if (alive.current) setResults(next);
        },
      });
    } catch (e) {
      if (alive.current) setError(`恢复流程已停止：${String(e)}`);
    } finally {
      lock.current = false;
      if (alive.current) {
        setApplying(false);
        setBusy(false);
        void refresh();
      }
    }
  }
  return (
    <section className="quick-workspace" aria-label="一键优化方案">
      <div className="quick-tier-grid" aria-label="快速优化档位">
        {quickTiers.map((t, index) => {
          const count = quickPlan(t.id, sources).filter(
            (r) => r.available && !r.applied && (r.kind!=='expert'||vip.features.includes('system.expert')),
          ).length;
          const Icon = [ShieldCheck, SlidersHorizontal, Rocket][index];
          return (
            <button
              key={t.id}
              disabled={busy}
              aria-pressed={tier === t.id}
              className="quick-tier"
              onClick={async () => {
                const request = ++tierRequest.current;
                setError('');setAccessMessage('');
                const feature = quickTierFeature(t.id);
                if(feature) { try { await requireVip(feature); } catch(e) {
                  if(alive.current && request === tierRequest.current) setAccessMessage(userError(e));
                  return;
                } }
                if(!alive.current || request !== tierRequest.current) return;
                setTier(t.id);
                setExcluded([]);
                resetFilters();
              }}
            >
              <span className="quick-tier-heading">
                <span className="quick-tier-icon">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <strong>{t.name}{quickTierFeature(t.id)?' · VIP':''}</strong>
                <span className="quick-tier-check" aria-hidden="true">
                  {tier === t.id && <Check size={13} />}
                </span>
              </span>
              <p>{t.detail}</p>
              <span className="quick-tier-footer">
                <span>
                  {busy && !applying ? (
                    "正在检测…"
                  ) : (
                    <>
                      <b>{count}</b> 项待应用
                    </>
                  )}
                </span>
                <span>
                  {tier === t.id ? "已选择" : "选择方案"}
                  <ChevronRight size={13} aria-hidden="true" />
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {accessMessage && <div role="status" className="my-4 rounded-xl border border-[var(--prism-line)] bg-[var(--skin-input)] p-4 text-sm">
        <span>{accessMessage}</span>
        <button type="button" className="ml-3 underline" onClick={()=>window.dispatchEvent(new CustomEvent('synapsex:open-account',{detail:'register'}))}>登录 / 注册或开通会员</button>
      </div>}
      <div className="quick-workbench">
        <aside className="quick-summary-column" aria-label="执行汇总">
          <section className="quick-summary prism-panel">
            <div className="quick-art"><img src={glassSculpture} alt="" width="1448" height="1086" decoding="async" /></div>
            <h2 className="quick-summary-title">{applying ? "正在处理优化" : "准备应用优化"}</h2>
            <p className="quick-summary-intro">按「{name}」方案核对改动，应用前自动保存原值。</p>
            <header>
              <span>
                <ListChecks size={17} aria-hidden="true" />
                本次优化
              </span>
              <span className="quick-badge">{name}方案</span>
            </header>
            <div className="quick-selection-total" role="status">
              <strong>{selected.length}</strong>
              <span>
                项待应用<small>本档共 {rows.length} 项</small>
              </span>
            </div>
            <dl className="quick-summary-counts">
              <div>
                <dt>已是目标值</dt>
                <dd>{rows.filter((r) => r.applied).length}</dd>
              </div>
              <div>
                <dt>当前不可用</dt>
                <dd>{rows.filter((r) => !r.available).length}</dd>
              </div>
              <div>
                <dt>已取消勾选</dt>
                <dd>
                  {
                    rows.filter(
                      (r) =>
                        r.available && !r.applied && excluded.includes(r.key),
                    ).length
                  }
                </dd>
              </div>
            </dl>
            {tier === "maximum" && (
              <p className="quick-warning">
                <strong>请确认需要保留的功能</strong>
                最大档包含摄像头、麦克风等应用权限限制，以及打印、搜索索引和自动更新调整。不需要的项目请取消勾选。
              </p>
            )}
            <button
              className="prism-button-primary quick-apply"
              disabled={busy || !selected.length}
              onClick={() => void apply()}
            >
              {busy
                ? applying
                  ? "正在处理…"
                  : "正在检测…"
                : `备份并应用${name}（${selected.length} 项）`}
              {!busy && <ArrowRight size={16} aria-hidden="true" />}
            </button>
            {applying && (
              <button
                className={button + " w-full mt-2"}
                onClick={() => {
                  cancelled.current = true;
                }}
              >
                停止后续项目
              </button>
            )}
            <p className="quick-apply-note">
              {!busy && !selected.length
                ? "没有待应用项目。可调整勾选或重新检测。"
                : "应用前确认完整清单，按项备份和核对结果。"}
            </p>
            <details className="quick-boundaries">
              <summary>
                应用与恢复说明
                <ChevronDown size={14} aria-hidden="true" />
              </summary>
              <p>
                选档只载入清单，不直接修改系统。档位越高，关闭或限制的功能越多，不代表帧数越高。切回基础档不会自动恢复已应用的最大档设置。
              </p>
              <p>
                三档均不批量删除文件、卸载设备、关闭安全保护或修改启动计时器。GPU、CPU
                电源和网络按设备或游戏单独配置。未支持的项目显示原因并跳过。
              </p>
              <p>
                失败后停止后续项目；已完成项不会自动撤销。服务启动方式需重启生效，不会自动重启电脑。
              </p>
            </details>
          </section>
          <section
            className="quick-history prism-panel"
            aria-label="最近执行记录"
          >
            <header>
              <h2>最近执行记录</h2>
              <span className="quick-badge">
                {results.length ? `${results.length} 项` : "暂无"}
              </span>
            </header>
            {results.length ? (
              <>
                <p className="quick-muted" role="status">
                  已完成 {results.filter((r) => r.status === "applied").length}{" "}
                  · 已恢复{" "}
                  {results.filter((r) => r.status === "restored").length} ·
                  未完成 {results.filter((r) => r.status === "failed").length}
                </p>
                <button
                  className={button + " w-full mt-3"}
                  disabled={
                    busy ||
                    !results.some((r) => r.backupId && r.status !== "restored")
                  }
                  onClick={() => void restoreBatch()}
                >
                  恢复本次优化
                </button>
                <details
                  className="quick-journal"
                  open={applying ? true : undefined}
                >
                  <summary>
                    查看逐项结果
                    <ChevronDown size={14} aria-hidden="true" />
                  </summary>
                  <p className="quick-muted">
                    新批次更新此处记录，旧备份仍保留。不会自动重试失败项。
                  </p>
                  <div className="quick-journal-list">
                    {results.map((r) => (
                      <div key={r.key}>
                        <strong>{r.title}</strong>
                        <span className="quick-result-state">
                          {
                            {
                              pending: "等待",
                              running: "执行中",
                              applied: "已完成",
                              skipped: "已跳过",
                              failed: "未完成",
                              cancelled: "未执行",
                              restoring: "恢复中",
                              restored: "已恢复",
                            }[r.status]
                          }
                        </span>
                        <p>
                          {r.message}
                          {r.backupId ? ` · 备份 ${r.backupId}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              </>
            ) : (
              <p className="quick-muted">
                应用后在这里查看逐项结果，或恢复本次修改前的设置。
              </p>
            )}
          </section>
        </aside>
        <section
          className="quick-catalog prism-panel"
          aria-labelledby="quick-catalog-title"
          ref={catalogRef}
          tabIndex={-1}
          aria-busy={busy}
        >
          <header className="quick-catalog-heading">
            <div>
              <h2 id="quick-catalog-title">优化项目</h2>
              <p>核对当前值与目标值，取消不需要的项目。</p>
            </div>
            <button
              className={button}
              disabled={busy}
              onClick={() => void refresh()}
            >
              <RefreshCw size={14} aria-hidden="true" />
              重新检测
            </button>
          </header>
          {sources.errors?.map((e) => (
            <p key={e} role="alert" className="quick-error">
              {e}
            </p>
          ))}
          {error && (
            <p role="alert" className="quick-error">
              {error}
            </p>
          )}
          <details className="quick-filters">
          <summary><SlidersHorizontal size={14} aria-hidden="true" />筛选项目<ChevronDown size={14} aria-hidden="true" /></summary>
          <div className="quick-filter-bar">
            <div className="quick-search">
              <Search size={16} aria-hidden="true" />
              <input
                className="prism-input"
                aria-label="搜索方案项目"
                placeholder="搜索名称或功能影响…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
              />
              {query && (
                <button
                  aria-label="清除搜索"
                  onClick={() => {
                    setQuery("");
                    setPage(0);
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <select
              className="prism-input"
              aria-label="按项目状态筛选"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(0);
              }}
            >
              <option value="all">所有状态</option>
              <option value="selected">已勾选</option>
              <option value="applied">已是目标值</option>
              <option value="unavailable">当前不可用</option>
            </select>
          </div>
          <div className="quick-category-tabs" aria-label="项目分类">
            {categories.map((c) => (
              <button
                key={c.id}
                aria-pressed={category === c.id}
                onClick={() => {
                  setCategory(c.id);
                  setPage(0);
                }}
              >
                {c.label}
                <span>
                  {rows.filter((r) => c.id === "all" || r.kind === c.id).length}
                </span>
              </button>
            ))}
          </div>
          </details>
          <div className="quick-list-toolbar">
            <span>
              显示 {filtered.length} 项
              <span className="quick-filter-note"> · 筛选和翻页不改变勾选</span>
            </span>
            <div>
              <button disabled={busy} onClick={() => setExcluded([])}>
                重选本档项目
              </button>
              <button
                disabled={busy}
                onClick={() => setExcluded(rows.map((r) => r.key))}
              >
                清空勾选
              </button>
            </div>
          </div>
          <div className="quick-item-list">
            {filtered
              .slice(currentPage * 12, (currentPage + 1) * 12)
              .map((row) => (
                <article
                  key={row.key}
                  className={`quick-item ${row.applied ? "is-applied" : ""}`}
                >
                  <div className="quick-item-main">
                    <input
                      type="checkbox"
                      id={`quick-${row.key}`}
                      aria-label={row.title}
                      disabled={busy || !row.available || row.applied}
                      checked={
                        row.available &&
                        (row.applied || !excluded.includes(row.key))
                      }
                      onChange={() =>
                        setExcluded((old) =>
                          old.includes(row.key)
                            ? old.filter((x) => x !== row.key)
                            : [...old, row.key],
                        )
                      }
                    />
                    <div className="quick-item-info">
                      <h3>
                        <label htmlFor={`quick-${row.key}`}>{row.title}</label>
                      </h3>
                      <p className="quick-values">
                        <span>当前：{row.current}</span>
                        <ArrowRight size={12} aria-hidden="true" />
                        <span>目标：{row.desired}</span>
                      </p>
                    </div>
                    <span
                      className={`quick-row-status ${!row.available ? "is-unavailable" : row.applied ? "is-applied" : ""}`}
                    >
                      {!row.available
                        ? "不可用"
                        : row.applied
                          ? "已是目标值"
                          : !excluded.includes(row.key)
                            ? "已勾选"
                            : "未勾选"}
                    </span>
                  </div>
                  <details className="quick-item-effect">
                    <summary>
                      功能影响
                      <ChevronDown size={12} aria-hidden="true" />
                    </summary>
                    <p>{row.effect}</p>
                  </details>
                  {!row.available && (
                    <p className="quick-unavailable">
                      未加入执行：{row.reason}
                    </p>
                  )}
                </article>
              ))}
            {!filtered.length && (
              <div className="quick-empty">
                <Search size={26} aria-hidden="true" />
                <h3>{busy ? "正在读取设置…" : "没有匹配的项目"}</h3>
                <p>筛选只影响显示，不会清空已选项目。</p>
                <button className={button} onClick={resetFilters}>
                  清除筛选
                </button>
              </div>
            )}
          </div>
          <footer className="quick-pagination">
            <span>
              第 {currentPage + 1} / {pageCount} 页
            </span>
            <div>
              <button
                className={button}
                disabled={busy || currentPage === 0}
                onClick={() => changePage(currentPage - 1)}
              >
                <ChevronLeft size={14} aria-hidden="true" />
                上一页
              </button>
              <button
                className={button}
                disabled={busy || currentPage + 1 >= pageCount}
                onClick={() => changePage(currentPage + 1)}
              >
                下一页
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          </footer>
        </section>
      </div>
    </section>
  );
}

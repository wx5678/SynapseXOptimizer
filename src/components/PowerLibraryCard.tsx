import { useMemo, useState } from "react";
import { Archive, AlertTriangle } from "lucide-react";
import type { PowerLibrary, PowerLibraryPlan } from "../lib/api";

const field = "w-full rounded-xl border border-white/10 bg-[var(--skin-input)] px-4 py-3 text-[13px] outline-none focus:border-sky-300/60 disabled:opacity-50";
const metrics = [
  ["minProcessor", "最低处理器状态", "%"], ["maxProcessor", "最高处理器状态", "%"],
  ["energyPreference", "能效偏好 EPP", ""], ["coreParkingMin", "最少非停放核心", "%"],
  ["idleDisabled", "禁用处理器空闲", ""], ["autonomousMode", "自主性能控制", ""],
  ["schedulingPolicy", "长线程异类策略", ""], ["shortSchedulingPolicy", "短线程异类策略", ""],
] as const;
function metric(plan: PowerLibraryPlan, key: string, unit: string) {
  const value = plan.values[key];
  if (value == null) return "未提供";
  if (key === "idleDisabled" || key === "autonomousMode") return value === 1 ? "是" : "否";
  if (key.endsWith("chedulingPolicy")) return ["所有处理器", "高性能处理器", "优先高性能", "高效处理器", "优先高效", "自动"][value] ?? String(value);
  return `${value}${unit}`;
}

export function PowerLibraryCard({ library, busy, onApply, onRestore }: {
  library?: PowerLibrary; busy: boolean;
  onApply: (plan: PowerLibraryPlan, full: boolean, risk: boolean) => void;
  onRestore: () => void;
}) {
  const [query, setQuery] = useState("");
  const [id, setId] = useState("");
  const [full, setFull] = useState(false);
  const [risk, setRisk] = useState(false);
  const plans = library?.items ?? [];
  const filtered = useMemo(() => plans.filter(plan => `${plan.name} ${plan.files.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase())), [plans, query]);
  const selected = plans.find(plan => plan.id === id);
  const choose = (value: string) => { setId(value); setFull(false); setRisk(false); };
  return <section aria-labelledby="power-library-title" className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="power-library-title" className="flex items-center gap-3 text-[17px] font-semibold"><Archive size={19} />原始电源计划库</h2>
      <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-400">{plans.length} 份可选 · 手动导入</span>
    </div>
    <p className="mt-3 text-[13px] leading-6 text-slate-400">你提供的原始计划，按文件内容去重保留。不按 CPU 隐藏；计划名称不代表适配结论，也不保证提升帧率。稳妥使用可选下方的 CPU 推荐方案。</p>
    {library?.error && <p role="alert" className="mt-3 text-sm text-amber-300">{library.error}</p>}
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <label className="min-w-0 text-[13px] text-slate-300">搜索名称或原文件名
        <input type="search" value={query} disabled={busy} onChange={e => { setQuery(e.target.value); choose(""); }} placeholder="例如：AMD、纯大核、FSOS…" className={field + " mt-2"} />
      </label>
      <label className="min-w-0 text-[13px] text-slate-300">选择原始计划（{filtered.length} 份）
        <select value={id} disabled={busy || !filtered.length} onChange={e => choose(e.target.value)} className={field + " mt-2"}>
          <option value="">{filtered.length ? "请选择，不会自动应用" : "没有匹配的计划"}</option>
          {filtered.map(plan => <option key={plan.id} value={plan.id}>{plan.highRisk ? "[高风险] " : ""}{plan.name} · {plan.files[0]} · {plan.id.slice(0, 6)}</option>)}
        </select>
      </label>
    </div>
    {selected && <div className="mt-5 rounded-xl border border-white/10 bg-black/10 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3"><h3 className="break-words font-semibold">{selected.name}</h3>{selected.highRisk && <span className="text-xs text-amber-300">含高风险参数</span>}</div>
      <p className="mt-2 break-words text-xs leading-5 text-slate-400">原文件：{selected.files.join(" / ")} · 校验标识 {selected.id.slice(0, 12)}</p>
      <p className="mt-4 text-xs text-slate-400">插电参数摘要 · 导入的是整套原始计划，电池和其他设备设置也会随之切换</p>
      <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">{metrics.map(([key, label, unit]) => <div key={key} className="rounded-lg border border-white/[0.06] p-3"><dt className="text-xs text-slate-400">{label}</dt><dd className="mt-2 text-sm font-medium">{metric(selected, key, unit)}</dd></div>)}</dl>
      <div className="mt-4 flex gap-2 text-[13px] leading-6 text-amber-200/90"><AlertTriangle size={16} className="mt-1 shrink-0" /><div><p>未做本机性能与稳定性验证。可能增加温度、功耗，或影响睡眠和设备节能。</p>{selected.warnings.map((warning, i) => <p key={i}>{warning}</p>)}</div></div>
      <label className="mt-4 flex items-start gap-2 text-[13px] leading-6"><input type="checkbox" className="mt-1.5" checked={full} disabled={busy} onChange={e => setFull(e.target.checked)} />我了解将切换整套插电 / 电池与设备参数，先备份当前计划，再导入并启用所选计划。</label>
      {selected.highRisk && <label className="mt-2 flex items-start gap-2 text-[13px] leading-6 text-amber-200"><input type="checkbox" className="mt-1.5" checked={risk} disabled={busy} onChange={e => setRisk(e.target.checked)} />我仍要测试此高风险计划；它可能禁用空闲 / 自主控制，或限制可用处理器类型。</label>}
    </div>}
    <div className="mt-5 flex flex-wrap gap-3">
      <button className="prism-button-primary rounded-xl px-5 py-3 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-40" disabled={busy || !selected || !full || (selected.highRisk && !risk)} onClick={() => selected && full && (!selected.highRisk || risk) && onApply(selected, full, risk)}>{busy ? "正在处理…" : "备份并启用所选计划"}</button>
      <button className="rounded-xl border border-white/10 px-5 py-3 text-[13px] disabled:opacity-40" disabled={busy} onClick={onRestore}>恢复之前方案</button>
    </div>
    <p className="mt-3 text-xs leading-5 text-slate-400">需要 Windows 管理员权限。仅导入选中的一份；导入成功后也可在上方 Windows 计划列表再次选择。恢复时保留已导入的计划。</p>
    {!!library?.unavailable.length && <details className="mt-4 text-xs text-slate-400"><summary className="cursor-pointer py-2">{library.unavailable.length} 项暂不可导入</summary>{library.unavailable.map(item => <p key={item.name} className="mt-2 break-words leading-5">{item.name}：{item.reason}</p>)}</details>}
  </section>;
}

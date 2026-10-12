import { useEffect, useRef, useState } from "react";
import { RefreshCw, RotateCcw } from "lucide-react";
import { hostApi, type BackgroundKind, type BackgroundItem, type BackgroundCatalog, type BackgroundBackup } from "../lib/api";
import { requestConfirmation } from "./ConfirmationDialog";

const names: Record<BackgroundKind,string> = { tasks:"计划任务管理", packages:"商店应用精简", folders:"启动文件夹管理" };
const button="rounded-xl border border-[var(--prism-line)] bg-[var(--skin-input)] px-4 py-2 text-xs font-semibold text-[var(--prism-text)] disabled:cursor-not-allowed disabled:opacity-40";
export function BackgroundManagerPanel({ taskOnly = false }: { taskOnly?: boolean }) {
  const [kind,setKind]=useState<BackgroundKind>(taskOnly ? "tasks" : "folders");
  const [data,setData]=useState<BackgroundCatalog|null>(null);
  const [busy,setBusy]=useState(false);
  const lock=useRef(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState("all");
  const [page,setPage]=useState(0);
  const generation=useRef(0);

  useEffect(()=>{
    const ticket=++generation.current;
    setBusy(true);setData(null);setError("");setMessage("");setPage(0);setQuery("");setFilter("all");
    hostApi.backgroundCatalog(kind).then(value=>{if(generation.current===ticket)setData(value);})
      .catch(reason=>{if(generation.current===ticket)setError(String(reason instanceof Error?reason.message:reason));})
      .finally(()=>{if(generation.current===ticket)setBusy(false);});
    return ()=>{generation.current++;};
  },[kind]);

  async function act(item?:BackgroundItem,backup?:BackgroundBackup) {
    if(lock.current)return;
    if(item && !requestConfirmation(item.actionLabel,`${item.title}\n${item.target}\n\n${item.effect}`,{danger:true,confirmLabel:item.actionLabel,note:kind==="packages"?"记录不包含应用数据；卸载后不保证能从本地恢复。":"先记录原状态再修改，不结束正在运行的程序。"}))return;
    if(backup && !requestConfirmation(kind==="packages"?"尝试重新注册应用":"恢复原设置",`${backup.title}\n${backup.target}\n${kind==="packages"?"仅在原安装文件仍存在且校验通过时可重新注册。不恢复已丢失的数据，文件缺失需从商店重新安装。":"内容发生变化时不会覆盖当前项目。"}`,{confirmLabel:"确认恢复"}))return;
    lock.current=true;setBusy(true);setError("");setMessage("");
    try{
      if(item||backup){const result=backup?await hostApi.restoreBackground(backup.backupId):await hostApi.applyBackground(item!);setMessage(result.message+(result.backupId?` 记录：${result.backupId}`:""));}
      setData(await hostApi.backgroundCatalog(kind));
    }catch(reason){
      setError(reason instanceof Error?reason.message:String(reason));
      if(item||backup){try{setData(await hostApi.backgroundCatalog(kind));}catch{/* Preserve action failure. */}}
    }finally{setBusy(false);lock.current=false;}
  }

  const rows=(data?.items??[]).filter(item=>`${item.title} ${item.target} ${item.detail}`.toLowerCase().includes(query.toLowerCase()) && (filter==="all" || filter==="available" && item.canApply || filter==="enabled" && item.enabled || filter==="disabled" && !item.enabled));
  const pages=Math.max(1,Math.ceil(rows.length/30));
  const currentPage=Math.min(page,pages-1);
  return <section className="my-6 rounded-2xl border border-[var(--prism-line)] bg-[var(--skin-input)] p-5 text-[var(--prism-text)]">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{names[kind]}</h2><button className={button} disabled={busy} onClick={()=>void act()}><RefreshCw size={14} className={`mr-2 inline ${busy?"animate-spin":""}`} />{busy?"正在处理…":"重新扫描"}</button></div>
    {!taskOnly && <div className="my-3 flex gap-2">{(["folders","packages"] as BackgroundKind[]).map(value=><button key={value} className={button} disabled={busy} aria-pressed={kind===value} onClick={()=>setKind(value)}>{names[value]}</button>)}</div>}
    <p className="mt-2 text-xs leading-6">{kind==="tasks"?"读取本机完整任务列表，支持逐项启用、停用与恢复，不限于预设任务。安全、更新和调度基础任务保留；权限不足时会报告实际错误。":kind==="folders"?"支持当前用户和公共启动文件夹。停用时移动原文件至备份目录，恢复前校验内容并检查同名文件冲突。":"列出当前执行账户的商店应用。系统组件与共享运行库保留；普通桌面软件不在此卸载。卸载不是数据备份，请先保留需要的应用数据。"}</p>
    {data && <p className="mt-2 text-xs opacity-70">执行账户：{data.account} · {data.items.length} 项 · 扫描于 {new Date(data.capturedAt).toLocaleTimeString()}</p>}
    <div className="my-4 flex flex-wrap gap-2"><input aria-label={`搜索${names[kind]}`} placeholder="搜索名称、路径或用途…" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} className="min-w-0 flex-1 rounded-xl border border-[var(--prism-line)] bg-[var(--skin-input)] p-3 text-sm" /><select aria-label="筛选后台项目" className={button} value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);}}><option value="all">全部项目</option><option value="available">可操作</option>{kind==="tasks" && <><option value="enabled">已启用</option><option value="disabled">已停用</option></>}</select></div>
    {error && <p role="alert" className="my-3 break-words rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm">{error}</p>}
    {message && <p role="status" className="my-3 break-words rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm">{message}</p>}
    <div className="space-y-2">{rows.slice(currentPage*30,(currentPage+1)*30).map(item=><article key={item.id} className="rounded-xl border border-[var(--prism-line)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="break-words text-sm font-semibold">{item.title}</h3><p className="mt-1 break-all text-xs opacity-70">{item.target}</p></div><span className="text-xs">{item.state}</span><button className={button} disabled={busy||!item.canApply} onClick={()=>void act(item)}>{item.actionLabel}</button></div>{item.detail && <p className="mt-2 break-words text-xs leading-5">{item.detail}</p>}{item.reason && <p className="mt-2 text-xs">{item.reason}</p>}</article>)}</div>
    {!busy && !rows.length && <p className="py-5 text-sm">没有匹配的项目。</p>}
    <div className="mt-3 flex items-center justify-end gap-3 text-xs"><span>{rows.length} 项 · {currentPage+1}/{pages} 页</span><button className={button} disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>上一页</button><button className={button} disabled={currentPage+1>=pages} onClick={()=>setPage(currentPage+1)}>下一页</button></div>
    <details className="mt-5 border-t border-[var(--prism-line)] pt-4"><summary className="cursor-pointer text-sm font-semibold">本软件的修改记录与恢复（{data?.backups.length??0}）</summary><div className="mt-3 space-y-2">{data?.backups.map(backup=><div key={backup.backupId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--prism-line)] p-3"><div className="min-w-0 flex-1"><strong className="break-words text-xs">{backup.title}</strong><p className="mt-1 text-xs opacity-70">{new Date(backup.createdAt).toLocaleString()}</p></div><button className={button} disabled={busy} onClick={()=>void act(undefined,backup)}><RotateCcw size={13} className="mr-2 inline" />{kind==="packages"?"尝试重新注册":"恢复原设置"}</button></div>)}{!data?.backups.length&&<p className="text-xs opacity-70">尚无本软件的修改记录；不会猜测其他工具修改前的值。</p>}</div></details>
  </section>;
}

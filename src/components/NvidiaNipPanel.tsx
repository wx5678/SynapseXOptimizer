import {useEffect,useState} from 'react';
import {FileUp,RefreshCw,ShieldCheck} from 'lucide-react';
import {hostApi,type NvidiaNipLibrary,type NvidiaNipPreview,type NvidiaNipValue} from '../lib/api';
import {requestConfirmation} from './ConfirmationDialog';
const field='min-w-0 w-full rounded-xl border border-white/10 bg-[var(--skin-input)] px-3 py-3 text-[13px] disabled:opacity-50';
const button='prism-button-secondary rounded-xl px-4 py-3 text-[13px] disabled:opacity-40';
function valueText(v:NvidiaNipValue){if(!v.supported)return '不可读取';return v.type==='Dword'?`${v.value} · 0x${Number(v.value).toString(16).padStart(8,'0').toUpperCase()}`:v.value||'（空）';}
export function NvidiaNipPanel(){
 const [library,setLibrary]=useState<NvidiaNipLibrary>({items:[],backups:[]});
 const [id,setId]=useState(''),[filePath,setFilePath]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [preview,setPreview]=useState<NvidiaNipPreview|null>(null),[accept,setAccept]=useState(false),[filter,setFilter]=useState(''),[backupId,setBackupId]=useState('');
 useEffect(()=>{let current=true;hostApi.nvidiaNipLibrary().then(r=>{if(current){setLibrary(r);setBackupId(r.backups[0]?.id??'');}}).catch(e=>{if(current)setError(String(e));});return()=>{current=false;};},[]);
 const reset=()=>{setPreview(null);setAccept(false);setError('');setMessage('');setFilter('');};
 async function run(action:()=>Promise<void>){setBusy(true);setError('');setMessage('');try{await action();}catch(e){setError((e instanceof Error?e.message:String(e)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,''));}finally{setBusy(false);}}
 async function refreshLibrary(){const data=await hostApi.nvidiaNipLibrary();setLibrary(data);setBackupId(data.backups[0]?.id??'');}
 const rows=preview?.rows.filter(r=>`${r.target.name} ${r.target.id} ${r.target.id.toString(16)} ${r.reason}`.toLowerCase().includes(filter.trim().toLowerCase()))??[];
 return <section aria-labelledby="nvidia-nip-title" className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
  <header className="flex flex-wrap items-center justify-between gap-3"><h2 id="nvidia-nip-title" className="flex items-center gap-3 text-[17px] font-semibold"><FileUp size={19}/>NVIDIA 配置导入</h2><span className="rounded-full border border-amber-300/25 px-3 py-1 text-xs text-amber-200">全局驱动配置</span></header>
  <p className="mt-3 text-[13px] leading-6 text-slate-400">内置 {library.items.length} 份你提供的 .nip，也可选择本机文件。当前支持单个 Base Profile；会影响其他游戏，不安装驱动、不执行附带脚本，不修改超频电压。</p>
  <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-end">
   <label className="min-w-0 flex-1 text-[13px] text-slate-300">选择配置<select aria-label="选择 NVIDIA 配置" className={field+' mt-2'} value={id} disabled={busy} onChange={e=>{setId(e.target.value);setFilePath('');reset();}}><option value="">{filePath?'使用本机文件':'请选择配置，不会自动应用'}</option>{library.items.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
   <button className={button} disabled={busy} onClick={()=>void run(async()=>{if(!window.synapsexDesktop?.selectNvidiaNip)throw Error('请在桌面版中选择文件。');const file=await window.synapsexDesktop.selectNvidiaNip();if(file){setFilePath(file);setId('');reset();}})}><FileUp size={15} className="mr-2 inline"/>选择 .nip 文件</button>
   <button className={button} disabled={busy||(!id&&!filePath)} onClick={()=>{reset();void run(async()=>setPreview(await hostApi.nvidiaNipPreview(id,filePath)));}}><RefreshCw size={15} className="mr-2 inline"/>{busy?'正在处理…':'读取并预览差异'}</button>
  </div>
  {filePath&&<p className="mt-3 break-all text-xs text-slate-400">本机文件：{filePath}</p>}
  {error&&<p role="alert" className="mt-4 break-words rounded-xl border border-red-300/20 bg-red-300/5 p-4 text-sm leading-6 text-red-200">{error}</p>}
  {message&&<p role="status" className="mt-4 rounded-xl border border-emerald-300/20 p-4 text-sm leading-6 text-emerald-200">{message}</p>}
  {preview&&<div className="mt-5 rounded-xl border border-white/10 p-4">
   <h3 className="font-semibold">{preview.name}</h3>
   <p className="mt-2 text-[13px] leading-6 text-slate-300">{preview.scope} · 共 {preview.total} 项 · 待改变 {preview.changed} 项 · 跳过 {preview.skipped} 项</p>
   <p className="mt-2 text-xs leading-5 text-amber-200">原始方案未经本机性能验证，可能改变画质、同步、功耗及兼容性。来源电脑 GPU 绑定、不可读取或类型不符的项目会跳过。只合并可应用的差异，不清空其他参数。</p>
   <label className="mt-4 block text-xs text-slate-400">筛选参数<input type="search" className={field+' mt-2'} value={filter} onChange={e=>setFilter(e.target.value)} placeholder="参数名称 / ID / 跳过原因"/></label>
   <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-white/10" tabIndex={0} aria-label="NVIDIA 配置差异列表">
    {rows.map(r=><div key={r.target.id} className="grid gap-2 border-b border-white/[0.06] p-3 text-xs leading-5 lg:grid-cols-[1fr_1fr_1fr]"><div className="min-w-0"><strong className="block break-words">{r.target.name||'未命名参数'}</strong><span className="text-slate-500">0x{r.target.id.toString(16).padStart(8,'0').toUpperCase()} · {r.target.type}</span></div><div className="min-w-0 break-all text-slate-400">当前：{valueText(r.before)}</div><div className="min-w-0 break-all">目标：{valueText(r.target)}<span className={'block '+(r.reason?'text-amber-200':r.changed?'text-sky-200':'text-slate-500')}>{r.reason|| (r.changed?'待应用':'已是目标值')}</span></div></div>)}
    {!rows.length&&<p className="p-4 text-xs text-slate-400">没有匹配的参数。</p>}
   </div>
   <label className="mt-4 flex items-start gap-2 text-[13px] leading-6"><input type="checkbox" className="mt-1.5" checked={accept} disabled={busy} onChange={e=>setAccept(e.target.checked)}/>我了解这是全局修改：备份后应用 {preview.changed} 项差异，跳过 {preview.skipped} 项。建议先关闭游戏，再导入并重新启动游戏。</label>
   <button className="prism-button-primary mt-4 rounded-xl px-5 py-3 text-[13px] font-semibold disabled:opacity-40" disabled={busy||!accept||!preview.changed} onClick={()=>{
    if(!requestConfirmation('导入 NVIDIA 全局配置',`将合并“${preview.name}”的 ${preview.changed} 项差异，跳过 ${preview.skipped} 项，会影响其他游戏。先保存原值，失败尝试回滚。`))return;
    void run(async()=>{try{const r=await hostApi.applyNvidiaNip(preview.token,accept);setMessage(`已应用 ${r.changed} 项，跳过 ${r.skipped} 项。备份：${r.backupId}。请重新启动游戏验证效果。`);}finally{setPreview(null);setAccept(false);try{await refreshLibrary();}catch{setError('备份列表刷新失败，请重新打开页面查看恢复记录。');}}});
   }}><ShieldCheck size={15} className="mr-2 inline"/>备份并导入差异</button>
  </div>}
  <div className="mt-5 border-t border-white/10 pt-4"><h3 className="text-sm font-semibold">恢复 NIP 导入前设置</h3><p className="mt-2 text-xs leading-5 text-slate-400">只恢复该备份涉及的参数；发现之后又被其他工具改动时会停止，避免覆盖。备份保存在本机。</p><div className="mt-3 flex flex-col gap-3 sm:flex-row"><select aria-label="选择 NIP 恢复备份" className={field} value={backupId} disabled={busy||!library.backups.length} onChange={e=>setBackupId(e.target.value)}><option value="">暂无选择</option>{library.backups.map(item=><option key={item.id} value={item.id}>{item.createdAt} · {item.id}</option>)}</select><button className={button+' shrink-0'} disabled={busy||!backupId} onClick={()=>{if(!requestConfirmation('恢复 NVIDIA 配置原值','恢复所选备份涉及的全局参数，不重置整个驱动。'))return;void run(async()=>{const r=await hostApi.restoreNvidiaNip(backupId);setPreview(null);setAccept(false);setMessage(`已恢复“${r.name}”导入前的 ${r.changed} 项参数。`);});}}>恢复所选备份</button></div></div>
 </section>;
}

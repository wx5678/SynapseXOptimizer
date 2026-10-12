import {useState} from 'react';
import {hostApi,type NicAudit} from '../lib/api';
import {requestConfirmation} from './ConfirmationDialog';
import {useVip,requireVip} from './VipNotice';
export function NicPropertyEditor({audit,onChange}:{audit:NicAudit;onChange:(value:NicAudit)=>void}) {
  const [values,setValues]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const unlocked=useVip().features.includes('network.nic');
  return <section className="rounded-xl border border-[var(--prism-line)] p-5"><h3 className="font-semibold">逐项调整驱动属性</h3><p className="my-3 text-sm">只提供本机驱动支持的选项。应用前保存原值，不立即重启网卡；部分设置需重启电脑生效。</p>{message&&<p role="status" className="my-3 text-sm">{message}</p>}<div className="space-y-3">{audit.properties.map(item=>{
    const options=Array.isArray(item.options)?item.options:[];
    const numeric=item.minimum!=null&&item.maximum!=null;
    const current=String(item.registryValue?.[0]??'');
    const value=values[item.registryKeyword]??current;
    const edit=options.length>0||numeric;
    return <div key={item.registryKeyword} className="grid gap-3 border-t border-[var(--prism-line)] py-3 md:grid-cols-[1fr_200px_auto]"><div><strong className="text-sm">{item.displayName}</strong><p className="text-xs">当前：{item.displayValue||current}</p>{!edit&&<p className="text-xs">驱动未提供合法可选值或数值范围，仅可查看。</p>}</div>{options.length?<select aria-label={item.displayName} className="prism-input" disabled={busy} value={value} onChange={e=>setValues(v=>({...v,[item.registryKeyword]:e.target.value}))}>{!options.some(x=>x.value===current)&&<option value={current}>保留当前值 {current}</option>}{options.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select>:numeric?<input className="prism-input" aria-label={item.displayName} type="number" min={Number(item.minimum)} max={Number(item.maximum)} step={Number(item.step)||1} disabled={busy} value={value} onChange={e=>setValues(v=>({...v,[item.registryKeyword]:e.target.value}))}/>:<span/>}<button className="prism-button-secondary px-3 py-2 disabled:opacity-40" disabled={busy||!audit.elevated||!edit||value===current} onClick={async()=>{try{await requireVip('network.nic');}catch(e){setMessage(e instanceof Error?e.message:String(e));return;}if(!requestConfirmation('修改网卡高级属性',`${audit.interfaceAlias}：${item.displayName}\n${current} → ${value}\n设置不合适可能影响联网。`))return;setBusy(true);try{const result=await hostApi.applyNicProperty(audit.interfaceAlias,item.registryKeyword,value,current);onChange(result.audit);setValues({});setMessage('已写入并核验。备份：'+result.backupId);}catch(e){setMessage(String(e))}finally{setBusy(false)}}}>{unlocked?'备份并应用':'VIP 应用'}</button></div>
  })}</div></section>;
}

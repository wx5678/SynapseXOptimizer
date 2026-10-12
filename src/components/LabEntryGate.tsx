import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FlaskConical, Info, X } from 'lucide-react';
import { hostApi } from '../lib/api';
import { designPreview } from '../lib/designPreview';
import './lab-experience.css';

export function LabEntryGate({ children, onLeave }: { children: ReactNode; onLeave: () => void }) {
  const [ready, setReady] = useState(false), [open, setOpen] = useState(false);
  const [suppressed, setSuppressed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let active=true;
    const load = async () => {
    setBusy(true); setError('');
    try {
      const value = designPreview ? { suppressed: sessionStorage.getItem('synapsex.preview.lab-notice') === 'off' } : await hostApi.labSession<{ suppressed: boolean }>('notice');
      if(!active)return;
      setSuppressed(value.suppressed); setReady(value.suppressed); setOpen(!value.suppressed);
    } catch { if(active){setOpen(true); setError('无法读取提醒设置。可继续查看；关闭永久提醒时需成功保存。');} }
    finally { if(active)setBusy(false); }
    };
    void load();return()=>{active=false;};
  }, []);
  useEffect(() => {
    const element = dialog.current;
    if(open && element && !element.open) element.showModal();
    return () => { if(element?.open) element.close(); };
  }, [open]);
  const close = () => { setOpen(false); if(!ready) onLeave(); else trigger.current?.focus(); };
  const enter = async () => {
    if(busy) return;
    setBusy(true); setError('');
    try {
      if(designPreview) sessionStorage.setItem('synapsex.preview.lab-notice', suppressed ? 'off' : 'on');
      else await hostApi.labSession('notice', { suppressed });
      setReady(true); setOpen(false); trigger.current?.focus();
    } catch { setError('提醒偏好保存失败。请重试，或仅本次进入；未记录为永久关闭。'); }
    finally { setBusy(false); }
  };
  return <>
    <p className="lab-notice" role="status">免费：系统延迟、鼠标与驱动诊断，兼容性读取、游戏库管理和全部恢复操作。VIP：进阶调度及配置应用。实验功能不保证提升性能，需逐项确认；高风险项目不作为会员效果承诺。</p>
    <div className="my-3 flex gap-3"><button className="prism-button-secondary px-4 py-2 text-sm" onClick={()=>void hostApi.labSession('stop',{confirmation:'RESTORE'}).then(()=>setError('已停止会话，请在恢复记录中核对结果。')).catch(e=>setError(String(e)))}>停止会话并恢复</button><button className="prism-button-secondary px-4 py-2 text-sm" onClick={()=>void hostApi.labRestore().then(()=>setError('已请求恢复，请在调度状态中核对结果。')).catch(e=>setError(String(e)))}>恢复调度实验</button></div>
    {!open && error && <p role="status">{error}</p>}
    {ready ? <><div className="lab-entry-help"><button ref={trigger} onClick={() => setOpen(true)}><Info size={15}/>实验须知与提醒设置</button></div>{children}</> : !open && <p role="status">正在读取实验室设置…</p>}
    <dialog ref={dialog} className="lab-entry-dialog" aria-labelledby="lab-entry-title" aria-describedby="lab-entry-description" onCancel={event => { event.preventDefault(); if(!busy) close(); }}>
      <button className="lab-entry-close" aria-label="关闭实验室提醒" disabled={busy} onClick={close}><X size={18}/></button>
      <div className="lab-entry-icon"><FlaskConical size={26}/></div><p className="lab-eyebrow">进入前请了解</p>
      <h2 id="lab-entry-title">实验室，不同配置按需使用</h2>
      <p id="lab-entry-description">这里包含测试工具和进阶设置。部分项目会改变进程、显卡或设备策略，不保证提升帧率；支持情况取决于 Windows、硬件与驱动。</p>
      <ul><li>先记录基线，每次只改变一项，在相同场景复测。</li><li>采样本身有开销，不建议在排位或重要对局中测试。</li><li>限时调度实验可自动恢复；启动、设备及驱动设置需手动恢复，部分需要重启。</li><li>关闭此提醒不会关闭各项操作确认，也不会自动启用实验。</li></ul>
      <label className="lab-notice-checkbox"><input type="checkbox" checked={suppressed} disabled={busy} onChange={e => setSuppressed(e.target.checked)}/>以后进入不再提示<small>保存在本机，重启软件后仍有效；可在“实验须知与提醒设置”恢复。</small></label>
      {error && <p role="alert" className="lab-error">{error}</p>}
      <div className="lab-entry-actions"><button disabled={busy} onClick={close}>{ready?'取消':'返回工作台'}</button>{error && <button disabled={busy} onClick={() => { setReady(true); setOpen(false); }}>仅本次进入</button>}<button className="workbench-primary" disabled={busy} onClick={() => void enter()}>{busy?'读取 / 保存中…':ready?'保存设置':'了解并进入'}</button></div>
    </dialog>
  </>;
}

import {useEffect,useRef,useState} from 'react';
import {Download,ShieldCheck,Thermometer,X} from 'lucide-react';
import './close-window-dialog.css';
import './sensor-install-dialog.css';

export function SensorInstallDialog() {
  const api=window.synapsexDesktop?.sensorPrompt;
  const dialog=useRef<HTMLDialogElement>(null),active=useRef<string|null>(null),submitting=useRef(false);
  const cancelButton=useRef<HTMLButtonElement>(null);
  const [request,setRequest]=useState<{id:string;version:string}|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  function hide(){active.current=null;dialog.current?.close();setRequest(null);}
  useEffect(()=>{
    if(!api)return;
    const off=api.onRequest(value=>{active.current=value.id;submitting.current=false;setBusy(false);setError('');setRequest(value);});
    const dismiss=api.onDismiss(id=>{if(active.current===id)hide();});
    void api.ready(true).catch(()=>{});
    return ()=>{off();dismiss();void api.ready(false).catch(()=>{});};
  },[api]);
  useEffect(()=>{
    if(!request||!api)return;
    dialog.current?.showModal();
    cancelButton.current?.focus();
    void api.acknowledge(request.id).then(ok=>{if(!ok&&active.current===request.id)hide();}).catch(()=>{if(active.current===request.id)hide();});
  },[request,api]);
  async function respond(accepted:boolean){
    if(!api||!request||submitting.current)return;
    submitting.current=true;setBusy(true);setError('');
    try {await api.respond({id:request.id,accepted});if(active.current===request.id)hide();}
    catch {setError('确认未完成，请重试；尚未授权安装。');}
    finally {submitting.current=false;setBusy(false);}
  }
  return <dialog ref={dialog} className="close-window-dialog sensor-install-dialog desktop-no-drag" aria-labelledby="sensor-install-title" aria-describedby="sensor-install-description sensor-install-caution"
    onCancel={event=>{event.preventDefault();void respond(false);}} onKeyDown={event=>event.stopPropagation()}>
    <button className="close-window-dismiss" aria-label="取消安装驱动" disabled={busy} onClick={()=>void respond(false)}><X size={18}/></button>
    <div className="close-window-mark"><Thermometer size={23}/></div>
    <p className="close-window-eyebrow">硬件监控 · 可选组件</p>
    <h2 id="sensor-install-title">启用 CPU 温度读取</h2>
    <p id="sensor-install-description" className="close-window-description">安装官方 PawnIO 驱动，为 CPU 温度监控提供底层读取支持。</p>
    <div className="sensor-install-package"><span className="sensor-install-package-icon"><Download size={20}/></span><div><strong>PawnIO <span>{request?.version}</span></strong><p>官方安装程序 · 免费第三方组件</p></div></div>
    <div className="sensor-install-trust"><ShieldCheck size={17}/><p>下载后校验安装包哈希与数字签名，通过后才打开官方安装程序。</p></div>
    <div className="sensor-install-caution" id="sensor-install-caution"><strong>安装前请确认</strong><ul><li>将新增内核驱动服务，需要 Windows 管理员授权。</li><li>安装可能要求重启，请先保存正在进行的工作。</li><li>请在官方安装程序中阅读并确认安装条款。</li></ul></div>
    <p className="sensor-install-safety">不会关闭内存完整性、杀毒软件或其他安全保护。取消不影响其他监控功能。</p>
    {error&&<p className="close-window-error" role="alert">{error}</p>}
    <footer><button ref={cancelButton} className="prism-button-secondary" disabled={busy} onClick={()=>void respond(false)}>暂不安装</button><button className="prism-button-primary" disabled={busy} onClick={()=>void respond(true)}><Download size={16}/>{busy?'正在确认…':'下载并安装'}</button></footer>
  </dialog>;
}

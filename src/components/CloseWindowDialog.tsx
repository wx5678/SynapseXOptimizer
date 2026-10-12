import {useEffect,useRef,useState} from 'react';
import {Check,PanelBottomClose,Power,X} from 'lucide-react';
import './close-window-dialog.css';

export function CloseWindowDialog() {
  const api=window.synapsexDesktop?.closePrompt;
  const dialog=useRef<HTMLDialogElement>(null);
  const requestRef=useRef<string|null>(null), submitting=useRef(false);
  const [request,setRequest]=useState<string|null>(null);
  const [action,setAction]=useState<'tray'|'quit'>('tray');
  const [remember,setRemember]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const hide=()=>{requestRef.current=null;dialog.current?.close();setRequest(null);};
  useEffect(()=>{
    if(!api)return;
    const offRequest=api.onRequest(id=>{
      requestRef.current=id;submitting.current=false;setBusy(false);setAction('tray');setRemember(false);setError('');setRequest(id);
    });
    const offDismiss=api.onDismiss(id=>{if(requestRef.current===id)hide();});
    void api.ready(true).catch(()=>{});
    return ()=>{offRequest();offDismiss();void api.ready(false).catch(()=>{});};
  },[api]);
  useEffect(()=>{
    if(!request || !api)return;
    dialog.current?.showModal();
    void api.acknowledge(request).then(accepted=>{if(!accepted&&requestRef.current===request)hide();}).catch(()=>{if(requestRef.current===request)hide();});
  },[request,api]);
  async function respond(choice:'tray'|'quit'|'cancel') {
    if(!api || !request || submitting.current)return;
    submitting.current=true;setBusy(true);setError('');
    try {await api.respond({id:request,action:choice,remember:choice!=='cancel'&&remember});hide();}
    catch {setError('未能完成操作，请重试。');}
    finally {submitting.current=false;setBusy(false);}
  }
  return <dialog ref={dialog} className="close-window-dialog desktop-no-drag" aria-labelledby="close-window-title" aria-describedby="close-window-description"
    onCancel={event=>{event.preventDefault();void respond('cancel');}}
    onKeyDown={event=>event.stopPropagation()}>
    <button className="close-window-dismiss" aria-label="取消关闭窗口" disabled={busy} onClick={()=>void respond('cancel')}><X size={18}/></button>
    <div className="close-window-mark"><PanelBottomClose size={23}/></div>
    <p className="close-window-eyebrow">窗口与后台运行</p>
    <h2 id="close-window-title">关闭窗口后，如何运行？</h2>
    <p id="close-window-description" className="close-window-description">选择留在后台，或结束本次使用。</p>
    <fieldset className="close-window-options" disabled={busy}>
      <legend className="sr-only">关闭窗口后的操作</legend>
      {([{value:'tray',title:'最小化到托盘',detail:'隐藏主窗口，已开启的监控和悬浮窗继续运行。',Icon:PanelBottomClose},
        {value:'quit',title:'退出软件',detail:'停止后台任务，同时关闭游戏悬浮窗。',Icon:Power}] as const).map(option=><label key={option.value} className={`close-window-option ${action===option.value?'is-selected':''}`}>
          <input type="radio" name="close-window-action" value={option.value} checked={action===option.value} onChange={()=>setAction(option.value)}/>
          <span className="close-window-option-icon"><option.Icon size={20}/></span>
          <span className="close-window-option-copy"><strong>{option.title}{option.value==='tray'&&<small>保持后台运行</small>}</strong><span>{option.detail}</span></span>
          <span className="close-window-radio" aria-hidden="true">{action===option.value&&<Check size={13}/>}</span>
        </label>)}
    </fieldset>
    <div className="close-window-preference"><label><input type="checkbox" checked={remember} disabled={busy} onChange={event=>setRemember(event.target.checked)}/><span>记住我的选择</span></label><p>之后可在「软件设置 → 关闭主窗口时」中修改。</p></div>
    {error&&<p className="close-window-error" role="alert">{error}</p>}
    <footer><button autoFocus className="prism-button-secondary" disabled={busy} onClick={()=>void respond('cancel')}>取消</button><button className="prism-button-primary" disabled={busy} onClick={()=>void respond(action)}>{busy?'正在处理…':action==='tray'?'最小化到托盘':'退出软件'}</button></footer>
    <p className="close-window-footnote">双击任务栏右下角的 SynapseX 图标，可重新打开工作台。</p>
  </dialog>;
}

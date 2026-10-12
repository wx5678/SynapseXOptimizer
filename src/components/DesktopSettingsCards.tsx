import {useEffect, useState} from 'react';
import {Download, PanelBottomClose} from 'lucide-react';
import './startup-settings.css';

export function DesktopSettingsCards() {
  const api = window.synapsexDesktop;
  const [behavior,setBehavior] = useState<WindowBehavior|null>(null);
  const [product,setProduct] = useState<ProductState|null>(null);
  const [saving,setSaving] = useState(false), [checking,setChecking] = useState(false);
  const [error,setError] = useState('');
  useEffect(()=>{
    let active=true;
    void Promise.all([api?.windowBehavior?.read(),api?.product?.state()]).then(([b,p])=>{if(active){setBehavior(b||null);setProduct(p||null);}}).catch(()=>{if(active)setError('无法读取桌面设置，请稍后重试。');});
    return ()=>{active=false;};
  },[api]);
  async function check() {
    if(!api?.product || checking)return;
    setChecking(true);setError('');
    try {
      const next=await api.product.refresh();setProduct(next);
      window.dispatchEvent(new CustomEvent('synapsex:product-checked',{detail:next}));
    } catch {setError('检查更新失败，请检查网络后重试。');}
    finally {setChecking(false);}
  }
  return <>
    <section className="startup-settings-card" aria-label="软件更新">
      <div className="startup-settings-heading"><span className="startup-settings-icon"><Download size={19}/></span><div><h2>软件更新</h2><p>当前版本 {product?.version||'—'} · 启动时及运行期间每 15 分钟自动检查。</p></div>
        <button className="startup-settings-switch" disabled={!api?.product||checking} onClick={()=>void check()}>{checking?'正在检查…':'检查更新'}</button></div>
      <p className="startup-settings-hint" role="status">{product?.error ? `检查失败：${product.error}` : product?.available ? `发现 ${product.config?.update.version} · ${product.required?'必须更新':'可选更新'}` : product?.checked ? '检查完成，当前没有已发布的更新。' : '点击检查更新，无需登录或开通会员。'}</p>
      <p className="startup-settings-hint">新版本从码云下载，显示进度并校验完整性。当前为便携版：下载后打开文件夹，退出旧版再运行新版；不会自动覆盖原文件。</p>
    </section>
    <section className="startup-settings-card" aria-label="关闭窗口设置">
      <div className="startup-settings-heading"><span className="startup-settings-icon"><PanelBottomClose size={19}/></span><div><h2>关闭主窗口时</h2><p>设置右上角 × 的行为；最小化按钮仍收起到任务栏。</p></div>
        <select className="startup-settings-switch" aria-label="关闭主窗口时" disabled={!behavior||saving} value={behavior?.closeAction||'ask'} onChange={event=>{
          const closeAction=event.target.value as WindowBehavior['closeAction'];
          setSaving(true);setError('');
          void api?.windowBehavior?.save({closeAction}).then(setBehavior).catch(()=>setError('关闭窗口设置保存失败，请重试。')).finally(()=>setSaving(false));
        }}><option value="ask">每次询问</option><option value="tray">最小化到托盘</option><option value="quit">退出软件</option></select></div>
      <p className="startup-settings-hint">托盘位于任务栏右下角，图标可能在“隐藏的图标”中。双击可打开工作台，右键可检查更新或彻底退出。后台运行时，已开启的监控和悬浮窗继续工作。</p>
      {!api && <p className="startup-settings-feedback">请在桌面正式版中设置。</p>}
    </section>
    {error&&<p role="alert">{error}</p>}
  </>;
}

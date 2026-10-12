import { useEffect, useRef, useState } from 'react';
import { Power } from 'lucide-react';
import './startup-settings.css';

export function StartupSettingsCard() {
  const api = window.synapsexDesktop?.startup;
  const [state, setState] = useState<StartupSettings | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false);
  const readVersion = useRef(0);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (!api || lock.current) return;
      const version = ++readVersion.current;
      void api.read().then(value => { if (active && version === readVersion.current) { setState(value); setError(''); } })
        .catch(() => { if (active && version === readVersion.current) setError('无法读取启动项，请稍后重试。'); });
    };
    refresh(); window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); };
  }, [api]);
  const toggle = async () => {
    if (!api || !state || lock.current) return;
    lock.current = true; readVersion.current++; setBusy(true); setError('');
    try { setState(await api.save({ enabled: !state.enabled })); }
    catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : '启动项保存失败。');
      try { setState(await api.read()); } catch { /* Keep the visible error, not an optimistic success. */ }
    } finally { lock.current = false; setBusy(false); }
  };
  return <section className="startup-settings-card" aria-label="开机启动设置">
    <div className="startup-settings-heading"><span className="startup-settings-icon"><Power size={19}/></span><div><h2>开机启动软件</h2><p>登录 Windows 后在托盘后台运行，不弹出工作台，不启动 FPS 采集或系统优化服务。</p></div>
      <button type="button" role="switch" aria-label="开机启动软件" aria-checked={state?.enabled === true} disabled={!state?.supported || busy} className={`startup-settings-switch ${state?.enabled ? 'is-on' : ''}`} onClick={() => void toggle()}><span/>{busy ? '保存中…' : state?.enabled ? '已开启' : '已关闭'}</button>
    </div>
    <p className="startup-settings-hint">搭配社区签到中的“打开软件自动签到”，并勾选参与的账号，即可在登录 Windows 后自动签到。登录失效时仍需完成官方验证；双击托盘图标可打开工作台。</p>
    {state?.enabled && <p className="startup-settings-hint">移动软件文件或更换版本后，请在新位置重新开启此选项。</p>}
    {(error || state?.reason || !api) && <p className="startup-settings-feedback" role="status">{error || state?.reason || '请使用桌面正式版设置开机启动。'}</p>}
  </section>;
}

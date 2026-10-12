import { WorkspaceNavigation } from './WorkspaceNavigation';
import { useEffect, useRef, useState } from 'react';
import {useVip} from './VipNotice';
import { LogIn, RefreshCw, ShieldCheck, CalendarCheck, Plus, Users, Check, Clock3, ChevronRight, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useCommunityAccounts, signinLabel, accountDays, serverName, accountTitle, accountIdentity } from '../lib/communityAccounts';
import './community-signin.css';
import { StartupSettingsCard } from './StartupSettingsCard';

export function CommunitySigninPanel() {
  const vip = useVip();
  const { api, data, error: readError, reload } = useCommunityAccounts();
  const [catalog, setCatalog] = useState<CommunityCatalog>({groups: [], servers: []});
  const [accountId, setAccountId] = useState(''), [picked, setPicked] = useState<string[]>([]);
  const [groupId, setGroupId] = useState(''), [optionKey, setOptionKey] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [note, setNote] = useState('');
  const [adding, setAdding] = useState(false), [name, setName] = useState(''), [editName, setEditName] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false), [confirmAuto, setConfirmAuto] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const lock = useRef(false);
  const accounts = data?.accounts || [];
  const active = accounts.find(a => a.id === accountId) || accounts[0];
  const blocked = busy || !!data?.busy || !api;
  const run = async (action: () => Promise<void>) => {
    if (lock.current || data?.busy) return;
    lock.current = true; setBusy(true); setError(''); setNote('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : '操作失败，请重试。'); }
    finally { await reload(); lock.current = false; setBusy(false); }
  };
  const loadCatalog = async () => { if (api) setCatalog(await api.catalog()); };
  useEffect(() => { if (api) void loadCatalog().catch(() => setError('服务器列表暂不可用，请点击刷新状态。')); }, [api]);
  useEffect(() => {
    setGroupId(active?.state?.choice.groupId || ''); setOptionKey(active?.state?.choice.optionKey || '');
    setEditName(active?.name || ''); setConfirmRemove(false); setShowHistory(false);
  }, [active?.id, active?.state?.choice.optionKey, active?.name]);
  const visibleServers = catalog.servers.filter(s => showHistory || s.active);
  const visibleGroups = catalog.groups.filter(g => visibleServers.some(s => s.groupId === g.id));
  const groupServers = visibleServers.filter(s => s.groupId === groupId);
  const selected = groupServers.find(s => s.optionKey === optionKey);
  const serverId = selected?.id || '';
  const signed = accounts.filter(a => a.status === 'signed').length;
  const selectedIds = picked.filter(id => accounts.some(a => a.id === id));
  const sign = (ids: string[]) => run(async () => { await api!.batch({confirm: 'sign-selected-accounts', accountIds: ids}); setNote('本次任务已结束，各账号结果见下方列表。'); });
  return <motion.section className="community-signin" initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}}>
    <WorkspaceNavigation><header className="workspace-page-header"><span className="glass-icon"><CalendarCheck size={23}/></span><div><p>九阴真经 · 社区活动</p><h1>社区签到</h1><p>多个账号，各自保存登录与区服。今日进度，一目了然。</p></div></header></WorkspaceNavigation>
    <p className="signin-notice">免费用户 1 个账号，VIP 最多 3 个。当前可用 {vip.signinLimit} 个；超额账号保留数据，移除不需要的账号可释放位置。</p>
    {!api && <p className="signin-notice">浏览器仅展示页面。请打开桌面软件添加账号、登录并签到。</p>}
    <section className="signin-summary" aria-label="今日签到概览">
      <div className="signin-summary-title"><span className="signin-symbol"><CalendarCheck size={27}/></span><div><span>{data?.date || '今日'} · 北京时间</span><h2>{signed === accounts.length && accounts.length ? '今日签到已完成' : '今天也别忘了签到'}</h2><p>{accounts.length ? `${accounts.length - signed} 个账号尚未确认今日签到` : '添加第一个账号，开始记录签到进度'}</p></div></div>
      <div className="signin-totals"><div><strong>{signed}<small> / {accounts.length}</small></strong><span>今日已签到</span></div><div><strong>{accounts.filter(a => a.status === 'login' || a.status === 'error').length}</strong><span>需要处理</span></div></div>
    </section>
    <StartupSettingsCard/>
    <section className="signin-automation"><div><strong>打开软件自动签到</strong><p>开启后，手动打开或开机后台启动时，依次签到勾选“参与自动签到”的账号。已确认签到的账号当天跳过。</p></div><button role="switch" aria-label="打开软件自动签到" aria-checked={!!data?.autoSign} className={`signin-switch ${data?.autoSign ? 'is-on' : ''}`} disabled={blocked} onClick={() => { if (data?.autoSign) void run(async () => { await api!.settings({autoSign: false}); }); else setConfirmAuto(true); }}><span/>{data?.autoSign ? '已开启' : '已关闭'}</button></section>
    {confirmAuto && <section className="signin-notice" role="region" aria-label="确认自动签到"><strong>启用后，从下次启动生效</strong><p>将使用各账号保存的官方会话与区服提交签到。每天自动尝试一次；登录过期、验证要求或网络异常请手动处理。关闭软件后不运行后台任务。</p><div className="signin-actions"><button className="workbench-primary" disabled={blocked} onClick={() => void run(async () => { await api!.settings({autoSign: true, confirm: 'enable-startup-sign'}); setConfirmAuto(false); })}>确认开启</button><button className="workbench-secondary" disabled={blocked} onClick={() => setConfirmAuto(false)}>取消</button></div></section>}
    {(error || readError || note || data?.storageError) && <div className="signin-notice" role="status">{error || readError || data?.storageError || note}</div>}
    {data?.progress && <div className="signin-progress" role="status"><RefreshCw size={15}/><span>{data.busy ? `正在处理：${data.progress.current || '准备中'}` : '最近一次任务已结束'} · {data.progress.completed} / {data.progress.total}</span><progress value={data.progress.completed} max={data.progress.total}/></div>}
    <div className="signin-workspace">
      <section className="signin-card signin-accounts"><header><Users size={19}/><h2>我的账号</h2><button className="workbench-secondary" disabled={blocked} onClick={() => setAdding(v => !v)}><Plus size={15}/>添加账号</button></header>
        {adding && <form className="signin-add-form" onSubmit={e => {e.preventDefault(); void run(async () => {const next = await api!.addAccount({name}); setAccountId(next.accountId); setName(''); setAdding(false); await loadCatalog(); setNote('账号已添加，请在右侧打开官方登录。');});}}><label>备注（选填）<input autoFocus maxLength={40} placeholder="可不填写，登录后显示实际账号" value={name} onChange={e => setName(e.target.value)}/></label><button className="workbench-primary" disabled={blocked}>保存账号</button><button type="button" className="workbench-secondary" onClick={() => setAdding(false)}>取消</button></form>}
        <div className="signin-list-toolbar"><label><input type="checkbox" aria-label="选择全部账号" disabled={blocked || !accounts.length} checked={!!accounts.length && selectedIds.length === accounts.length} onChange={e => setPicked(e.target.checked ? accounts.map(a => a.id) : [])}/>已选 {selectedIds.length} / {accounts.length}</label><button disabled={blocked || !accounts.length} onClick={() => void run(async () => {await api!.refreshAccounts(); await loadCatalog();})}><RefreshCw size={14}/>刷新状态</button></div>
        <div className="signin-account-list">{accounts.map((a, i) => <article key={a.id} className={`signin-account-row ${active?.id === a.id ? 'is-selected' : ''}`}>
          <input aria-label={`选择账号 ${accountTitle(a)}`} type="checkbox" disabled={blocked} checked={selectedIds.includes(a.id)} onChange={e => setPicked(ids => e.target.checked ? [...ids, a.id] : ids.filter(id => id !== a.id))}/>
          <button className="signin-account-select" aria-label={`管理账号 ${accountTitle(a)}`} aria-pressed={active?.id === a.id} disabled={blocked} onClick={() => setAccountId(a.id)}><span className="signin-avatar">{String(i + 1).padStart(2, '0')}</span><span className="signin-account-info"><strong>{accountTitle(a)}</strong>{(a.name || !a.accountName) && <small className="signin-account-identity">账号：{accountIdentity(a)}</small>}<small>{serverName(a)}</small><span className={`signin-badge is-${a.status}`}>{a.status === 'signed' ? <Check size={13}/> : <Clock3 size={13}/>} {signinLabel(a)}{accountDays(a) != null ? ` · 累计 ${accountDays(a)} 天` : ''}</span>{a.error && <small className="signin-row-error">{a.error}</small>}</span><ChevronRight size={16}/></button>
        </article>)}</div>
        {!accounts.length && <div className="signin-empty"><Users size={28}/><h3>还没有保存账号</h3><p>添加账号后完成官方登录，备注可选填，登录状态分别保存。</p></div>}
        <div className="signin-batch-bar"><span>逐个签到 · 单个失败不影响其余账号</span><button className="workbench-primary" disabled={blocked || !selectedIds.length} onClick={() => void sign(selectedIds)}><CalendarCheck size={16}/>{busy || data?.busy ? '处理中…' : `一键签到所选 (${selectedIds.length})`}</button></div>
      </section>
      <aside className="signin-card signin-detail" aria-label="账号设置">{active ? <><header><ShieldCheck size={19}/><h2>{accountTitle(active)}</h2><span>账号设置</span></header>
        <p className="signin-account-identity">账号：{accountIdentity(active)}</p><label>备注（选填）<div className="signin-inline"><input maxLength={40} value={editName} onChange={e => setEditName(e.target.value)} disabled={blocked}/><button className="workbench-secondary" disabled={blocked || editName === active.name} onClick={() => void run(async () => {await api!.updateAccount({accountId: active.id, name: editName});})}>保存</button></div></label>
        <div className="signin-login-box"><strong>{active.state?.loginOpen ? '官方登录窗口已打开' : active.state?.loggedIn ? '已登录官方账号' : '请完成官方登录'}</strong><p>重新登录会清理此账号的旧会话，不影响其他账号。密码及安全口令仅在官方窗口输入；账号名称单独保存用于显示。</p><div className="signin-actions"><button className="workbench-secondary" disabled={blocked} onClick={() => void run(async () => {await api!.openLogin({accountId: active.id});})}><LogIn size={15}/>{active.accountName || active.state?.loggedIn || active.state?.windowError ? '重新登录' : '打开官方登录'}</button><button className="workbench-secondary" disabled={blocked} onClick={() => void run(async () => {await api!.refreshAccounts({accountId: active.id}); await loadCatalog();})}><RefreshCw size={14}/>刷新</button></div></div>
        <label>游戏分区<select className="prism-input" value={visibleGroups.some(g => g.id === groupId) ? groupId : ''} disabled={blocked} onChange={e => {setGroupId(e.target.value); setOptionKey('');}}><option value="">请选择分区</option>{visibleGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
        <label>服务器<select className="prism-input" value={selected?.optionKey || ''} disabled={blocked || !groupServers.length} onChange={e => setOptionKey(e.target.value)}><option value="">请选择服务器</option>{groupServers.map(s => <option key={s.optionKey} value={s.optionKey}>{s.name}{s.active ? '' : '（历史列表）'}</option>)}</select></label>
        <label className="signin-history"><input type="checkbox" checked={showHistory} disabled={blocked} onChange={e => {setShowHistory(e.target.checked); setOptionKey('');}}/>显示历史服务器</label>
        <button className="workbench-secondary" disabled={blocked || !selected} onClick={() => void run(async () => {await api!.selectServer({accountId: active.id, groupId, serverId, optionKey}); setNote(`已为 ${accountTitle(active)} 保存：${selected!.name}。`);})}>保存区服</button>
        <label className="signin-history signin-auto-account"><input type="checkbox" disabled={blocked} checked={active.enabled} onChange={e => {const enabled = e.target.checked; void run(async () => {await api!.updateAccount({accountId: active.id, enabled});});}}/>参与自动签到</label>
        <div className="signin-count"><span>{signinLabel(active)}<small>区服累计签到（官方返回）</small></span><strong>{accountDays(active) ?? '—'}<small> 天</small></strong></div>
        <p className="signin-caption">已保存区服：{serverName(active)}{optionKey && active.state?.choice.optionKey !== optionKey ? ' · 当前选择尚未保存' : ''}</p>
        <button className="workbench-primary signin-single" disabled={blocked || !active.state?.choice.optionKey || active.state.loginOpen || active.status === 'signed' || active.state.choice.optionKey !== optionKey} onClick={() => void sign([active.id])}><CalendarCheck size={16}/>{active.status === 'signed' ? '今日已签到' : '签到此账号'}</button>
        <small>{active.state?.checkedAt ? `最近查询：${new Date(active.state.checkedAt).toLocaleString()}` : '尚未查询官方状态'}</small>
        {(active.state?.storageError || active.state?.windowError) && <p className="signin-row-error">{active.state.storageError || active.state.windowError}</p>}
        {active.status === 'signed' && <p className="signin-confirmed" role="status"><Check size={14}/>{data?.date} · 今日签到已确认，无需重复提交。</p>}
        {active.state?.lastResult && <details className="signin-result-history"><summary>上次签到记录</summary><p className="signin-caption">{new Date(active.state.lastResult.at).toLocaleString()} · {active.state.lastResult.message}</p></details>}
        <div className="signin-remove">{confirmRemove ? <><p>移除“{accountTitle(active)}”的本机登录凭据和账号记录，不注销游戏账号。</p><div className="signin-actions"><button disabled={blocked} className="workbench-secondary" onClick={() => setConfirmRemove(false)}>取消</button><button disabled={blocked} className="workbench-secondary" onClick={() => void run(async () => {await api!.removeAccount({accountId: active.id, confirm: 'remove-local-account'}); setConfirmRemove(false);})}>确认移除</button></div></> : <button disabled={blocked} onClick={() => setConfirmRemove(true)}><Trash2 size={14}/>移除本机账号</button>}</div>
      </> : <div className="signin-empty"><ShieldCheck size={28}/><h3>选择账号进行设置</h3><p>保存的登录、区服与签到结果互不覆盖。</p></div>}</aside>
    </div>
    <footer className="signin-footer"><ShieldCheck size={17}/><p>刷新状态仅查询，不提交签到。已保存的今日官方确认记录会自动显示为已签到；缺少确认依据时显示“今日待确认”。累计天数不能用于判断今天是否签到。</p></footer>
  </motion.section>;
}

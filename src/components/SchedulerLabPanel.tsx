import { WorkspaceNavigation } from './WorkspaceNavigation';
import { VipNotice } from './VipNotice';
import { useEffect, useRef, useState } from 'react';
import { FlaskConical, RefreshCw, Undo2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { hostApi, type LabState, type LabSample, type MonitorTarget } from '../lib/api';
import { requestConfirmation } from './ConfirmationDialog';
import { designPreview } from '../lib/designPreview';
import './scheduler-lab.css';
import { SessionLabPanel } from './SessionLabPanel';
import { LabDiagnosticsPanel } from './LabDiagnosticsPanel';
import { LabRegistryPanel } from './LabRegistryPanel';
import { LabGpuPanel } from './LabGpuPanel';
import { LatencyTestPanel } from './LatencyTestPanel';
import type { SectionRequest } from './SidebarFlyout';

export function SchedulerLabPanel({ sectionRequest }: { sectionRequest?: SectionRequest }) {
  const [mainTab,setMainTab]=useState('session');
  useEffect(()=>{if(sectionRequest && ['session','latency','diagnostics','registry','gpu','thread'].includes(sectionRequest.section))setMainTab(sectionRequest.section);},[sectionRequest]);
  const [targets,setTargets]=useState<MonitorTarget[]>([]),[pid,setPid]=useState(0);
  const [sample,setSample]=useState<LabSample|null>(null),[state,setState]=useState<LabState>({Status:'idle',Message:'尚未启动实验。'});
  const [tid,setTid]=useState(0),[seconds,setSeconds]=useState(60),[kind,setKind]=useState<'thread'|'background'>('thread');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''); const lock=useRef(false);
  const [now,setNow]=useState(Date.now());
  const active=['active','restore-failed','other-instance'].includes(state.Status);
  const run=async(action:()=>Promise<void>)=>{
    if(lock.current || designPreview)return;lock.current=true;setBusy(true);setError('');
    try{await action();}catch(e){setError(e instanceof Error?e.message:'操作失败');try{setState(await hostApi.labState());}catch{}}
    finally{lock.current=false;setBusy(false);}
  };
  const refresh=()=>run(async()=>{const data=await hostApi.monitorTargets(true);setTargets(data.candidates);setSample(null);setTid(0);setPid(p=>data.candidates.some(t=>t.processId===p)?p:data.detected?.processId||data.candidates[0]?.processId||0);setState(await hostApi.labState());});
  useEffect(()=>{if(mainTab==='thread')void refresh();},[mainTab]);
  useEffect(()=>{if(!sample)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[sample]);
  useEffect(()=>{
    if(!active || designPreview)return;
    const timer=setInterval(()=>{if(!lock.current)void hostApi.labState().then(setState).catch(()=>setError('状态查询失败，请重新连接本地服务。'));},2500);
    return()=>clearInterval(timer);
  },[active]);
  const start=()=>{
    if(!sample || Date.parse(sample.validUntil)<=Date.now() || !requestConfirmation(kind==='thread'?'开始线程优先级实验':'开始后台 CPU 让步实验',`目标：${sample.sample.Process.Name} · PID ${pid}${kind==='thread'?` · TID ${tid}`:''}。持续 ${seconds} 秒后恢复。`,{note:'只调整所选目标的 CPU 调度优先级；不是提帧保证。到时自动恢复，也可提前停止。'}))return;
    void run(async()=>{setState(await hostApi.labStart(sample.offer,kind,tid,seconds));setSample(null);setTid(0);});
  };
  const names:Record<string,string>={idle:'未运行',active:'实验中',restored:'已恢复',exited:'目标已退出',unchanged:'未改变','restore-failed':'恢复待处理','other-instance':'其他服务正在运行'};
  return <motion.section className="scheduler-lab" initial={{opacity:0}} animate={{opacity:1}}>
    <WorkspaceNavigation><header className="lab-heading"><FlaskConical size={25}/><div><p>实验功能 · 按需启用</p><h1>实验室</h1><p>管理游戏会话、核心分配和驱动实验，查看每项执行与恢复结果。</p></div></header>
    <nav className="lab-tabs lab-primary-nav" aria-label="实验室功能">{[['session','会话与游戏库'],['latency','系统延迟测试'],['diagnostics','输入与驱动诊断'],['registry','启动与中断'],['gpu','显卡驱动扩展'],['thread','线程实验']].map(([id,label])=><button key={id} aria-pressed={mainTab===id} onClick={()=>{setMainTab(id); window.scrollTo({top:0,behavior:"instant"});}}>{label}</button>)}</nav></WorkspaceNavigation>
    {designPreview && <p className="lab-notice">界面预览不执行实验，请在桌面软件中使用。</p>}
    {['latency','diagnostics'].includes(mainTab)&&<p className="lab-notice">免费检测 · 无需会员，可开始测量并查看结果；检测不会替你应用优化设置。</p>}
    {['registry','gpu','thread'].includes(mainTab)&&<VipNotice feature="lab.all" title="进阶调度与配置应用"/>}
    {mainTab==='latency'&&<LatencyTestPanel onDpc={()=>setMainTab('diagnostics')}/>}
    {mainTab==='session'&&<SessionLabPanel />}
    {mainTab==='diagnostics'&&<LabDiagnosticsPanel />}
    {mainTab==='registry'&&<LabRegistryPanel />}
    {mainTab==='gpu'&&<LabGpuPanel />}
    {mainTab==='thread'&&<>
    <section className="lab-card"><h2>调度实验</h2><p>线程实验调整单个线程，不修改整个游戏的进程优先级。后台让步仅降低所选应用的 CPU 优先级，不限制 IO、显存或网速。</p>
      <div className="lab-controls"><label>实验类型<select value={kind} disabled={busy||active} onChange={e=>setKind(e.target.value as 'thread'|'background')}><option value="thread">单线程优先级 +1</option><option value="background">后台应用 CPU 让步</option></select></label><label>持续时间<select value={seconds} disabled={busy||active} onChange={e=>setSeconds(Number(e.target.value))}><option value={30}>30 秒</option><option value={60}>60 秒</option><option value={300}>5 分钟</option></select></label></div>
      <div className="lab-controls"><label>目标程序<select value={pid} disabled={busy||active} onChange={e=>{setPid(Number(e.target.value));setSample(null);setTid(0);}}><option value={0}>请选择运行中的程序</option>{targets.map(t=><option key={t.processId} value={t.processId}>{t.processName} · PID {t.processId} {t.title}</option>)}</select></label><button className="workbench-secondary" disabled={busy||active||designPreview} onClick={()=>void refresh()}><RefreshCw size={15}/>重新扫描</button><button className="workbench-primary" disabled={busy||active||!pid||designPreview} onClick={()=>void run(async()=>{const next=await hostApi.labSample(pid);setSample(next);setTid(next.sample.Threads.find(t=>t.CpuMs>0&&t.Priority>=0&&t.Priority<2)?.ThreadId||0);})}>{busy?'处理中…':'采样线程'}</button></div>
      {kind==='background' && <p className="lab-notice">请选择希望让出 CPU 时间的后台应用，不要选择正在玩的游戏。音视频处理或下载应用的响应可能变慢。</p>}
      {sample && <><p className="lab-caption">可读取 {sample.sample.Observed} 条线程，访问失败 {sample.sample.Inaccessible} 条。本次采样 {Math.round(sample.sample.ElapsedMs)} ms；数据两分钟内有效。</p>
        {kind==='thread' && <div className="lab-table"><table><thead><tr><th>选择</th><th>线程 ID</th><th>CPU 时间</th><th>单核占用</th><th>相对优先级</th></tr></thead><tbody>{sample.sample.Threads.slice(0,20).map(t=><tr key={t.ThreadId}><td><input type="radio" name="lab-thread" aria-label={`选择线程 ${t.ThreadId}`} disabled={busy||active||t.CpuMs<=0||t.Priority<0||t.Priority>=2} checked={tid===t.ThreadId} onChange={()=>setTid(t.ThreadId)}/></td><td>{t.ThreadId}</td><td>{t.CpuMs.toFixed(1)} ms</td><td>{t.SingleCorePercent}%</td><td>{t.Priority}</td></tr>)}</tbody></table></div>}
        <p className="lab-caption">CPU 时间最多的线程只是候选项，不能据此确认它负责渲染或决定帧率。访问失败不显示为 0% 成功采样。</p></>}
      <div className="lab-actions"><button className="workbench-primary" disabled={busy||active||!sample||Date.parse(sample.validUntil)<=now||(kind==='thread'&&!tid)||designPreview} onClick={start}>备份并开始实验</button><button className="workbench-secondary" disabled={busy||designPreview||!['active','restore-failed'].includes(state.Status)} onClick={()=>void run(async()=>setState(await hostApi.labRestore()))}><Undo2 size={15}/>停止并恢复</button></div>
    </section>
    <section className="lab-card" role="status"><h2>{names[state.Status]||state.Status}</h2><p>{state.Message}</p>{state.Target&&<p>{state.Target.Name} · PID {state.Target.ProcessId}{state.Target.Kind==='thread'?` · TID ${state.Target.ThreadId}`:''} · 原值 {state.Target.Original} · 应用值 {state.Applied} · 回读 {state.Actual}</p>}{state.Status==='active'&&state.Until&&<p>预计恢复：{new Date(state.Until).toLocaleTimeString()}</p>}{error&&<p className="lab-error">{error}</p>}</section>
    </>}
    <section className="lab-card"><h2>实验说明</h2><p>访问被拒绝时会显示错误，不绕过进程或线程访问限制。可恢复实验到时或关闭工作台时恢复；异常退出留下的记录会在本地服务下次启动时尝试恢复。工作集回收是一次性操作，不提供虚假的撤销。</p><p>显卡驱动配置、电源、TCP / DNS、MSI 和鼠标加速继续使用原有模块，不重复添加。</p></section>
  </motion.section>;
}

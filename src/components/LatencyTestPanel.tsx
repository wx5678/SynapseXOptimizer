import { useEffect, useRef, useState } from 'react';
import { Play, Square, RefreshCw } from 'lucide-react';
import { hostApi } from '../lib/api';
import { designPreview } from '../lib/designPreview';
import { requestConfirmation } from './ConfirmationDialog';
type Result = { Id: string; Status: string; Message: string; Started: string; Label: string; Method: string; TimerMode: string; PowerScheme: string; Os: string; LogicalProcessors: number; DurationSeconds: number; Count: number; ElapsedSeconds: number; MeanMs: number; P95Ms: number; P99Ms: number; MaximumMs: number; HostCpuOneCorePercent: number; Points: {Seconds: number; MaximumMs: number}[] };
const list = <T,>(v: T[] | T | undefined): T[] => v == null ? [] : Array.isArray(v) ? v : [v];
const ms = (value: number | undefined) => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : '—';
const statusNames: Record<string, string> = { idle: '未开始', running: '测量中', complete: '已完成', cancelled: '已停止', error: '测量失败' };
export function LatencyTestPanel({ onDpc }: { onDpc: () => void }) {
  const [result, setResult] = useState<Result | null>(null), [history, setHistory] = useState<Result[]>([]);
  const [seconds, setSeconds] = useState(30), [label, setLabel] = useState(''), [selected, setSelected] = useState(''), [baseline, setBaseline] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false); const lock = useRef(false), alive = useRef(true);
  const running = result?.Status === 'running';
  const refreshHistory = async () => { const h = await hostApi.labSession<{records: Result[]}>('latency-history'); if(alive.current) setHistory(list(h.records)); };
  const normalize = (r: Result) => ({ ...r, Points: list(r.Points) });
  const run = async (action: () => Promise<void>) => {
    if(lock.current || designPreview) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); } catch(e) { if(alive.current) setError(String(e)); }
    finally { lock.current = false; if(alive.current) setBusy(false); }
  };
  useEffect(() => { alive.current=true; void run(async () => { const r=await hostApi.labSession<Result>('latency'); if(alive.current) setResult(normalize(r)); await refreshHistory(); }); return () => { alive.current=false; }; }, []);
  useEffect(() => {
    if(!running || designPreview) return;
    const timer=setInterval(() => { if(!lock.current) void run(async () => { const r=await hostApi.labSession<Result>('latency'); if(alive.current) setResult(normalize(r)); if(r.Status!=='running') await refreshHistory(); }); },1000);
    return () => clearInterval(timer);
  }, [running]);
  const start = () => {
    if(!requestConfirmation('开始系统响应延迟测试', `连续采集 ${seconds} 秒。请保持相同电源方案和后台负载，不要同时运行其他诊断。`, { confirmLabel: '开始测试', note: '只测量测试线程的唤醒耗时，不修改系统设置或游戏进程。测量会产生额外开销，不是网络 Ping 或鼠标到屏幕延迟。' })) return;
    void run(async () => { const r=await hostApi.labSession<Result>('latency-start', { seconds, label:label.trim(), confirmation:'MEASURE' }); if(alive.current) {setSelected('');setResult(normalize(r));} });
  };
  const shown=selected ? history.find(r=>r.Id===selected) : result;
  const base=history.find(r=>r.Id===baseline);
  const points=list(shown?.Points), ymax=Math.max(.1,...points.map(p=>p.MaximumMs));
  const comparable=shown?.Status==='complete' && base?.Status==='complete' && shown.Id!==base.Id && shown.Method===base.Method && shown.TimerMode===base.TimerMode && shown.DurationSeconds===base.DurationSeconds && shown.Os===base.Os && shown.LogicalProcessors===base.LogicalProcessors;
  return <section className="lab-card latency-panel">
    <div className="lab-status-heading"><div><p className="lab-eyebrow">LATENCY TEST</p><h2>系统响应延迟测试</h2></div><span className="latency-state" role="status">{statusNames[result?.Status||'idle']||'未知状态'}</span></div>
    <p>测量测试线程完成 1 ms 等待后的额外唤醒耗时，包含定时器与 CPU 调度影响。支持 AMD / Intel 等处理器，不按型号套用“正常分数”。</p>
    <details><summary>测试前须知与结果含义</summary><ul className="latency-guidance"><li>先关闭其他诊断和 FPS 采集，固定电源方案与后台负载；建议测试三次再比较。</li><li>平均值代表总体水平，P95 / P99 反映较慢样本，峰值显示单次尖峰；单次结果不能证明某个驱动有问题。</li><li>测试线程保持普通优先级，不绑核、不修改系统计时器分辨率。系统不支持高精度计时器时使用普通计时器，并标明模式。</li><li>这是软件唤醒延迟，不是网络、游戏操作或鼠标到屏幕延迟；采样期间有额外开销。</li><li>功能方向参考 BoosterX 的 PC Latency Test，使用独立测量方法，数值不能直接横向比较。</li></ul></details>
    <div className="lab-controls"><label>记录名称<input maxLength={80} value={label} disabled={busy||running} onChange={e=>setLabel(e.target.value)} placeholder="例如：平衡方案 · 优化前"/></label><label>测试时长<select value={seconds} disabled={busy||running} onChange={e=>setSeconds(Number(e.target.value))}><option value={15}>15 秒</option><option value={30}>30 秒</option><option value={60}>60 秒</option></select></label></div>
    <div className="lab-actions"><button className="workbench-primary" disabled={busy||running||designPreview} onClick={start}><Play size={15}/>开始测试</button><button className="workbench-secondary" disabled={busy||!running||designPreview} onClick={()=>void run(async()=>{const r=await hostApi.labSession<Result>('latency-stop',{confirmation:'STOP'});if(alive.current)setResult(normalize(r));await refreshHistory();})}><Square size={15}/>停止测试</button><button className="workbench-secondary" disabled={busy||designPreview} onClick={()=>void run(async()=>{const r=await hostApi.labSession<Result>('latency');if(alive.current)setResult(normalize(r));await refreshHistory();})}><RefreshCw size={15}/>刷新记录</button></div>
    {running && <><progress aria-label="测试进度" value={result.ElapsedSeconds||0} max={result.DurationSeconds}/><p>{Math.min(result.DurationSeconds, result.ElapsedSeconds||0).toFixed(1)} / {result.DurationSeconds} 秒 · {result.Count||0} 个样本。切换页面后继续，关闭软件则停止。</p></>}
    {error && <p role="alert" className="lab-error">{error}</p>}
    <div className="lab-controls"><label>查看记录<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">本次测试</option>{history.map(r=><option key={r.Id} value={r.Id}>{r.Label||'未命名测试'} · {new Date(r.Started).toLocaleString()} · {statusNames[r.Status]}</option>)}</select></label><label>对比基线<select value={baseline} onChange={e=>setBaseline(e.target.value)}><option value="">不对比</option>{history.filter(r=>r.Status==='complete').map(r=><option key={r.Id} value={r.Id}>{r.Label||'未命名测试'} · {new Date(r.Started).toLocaleString()}</option>)}</select></label></div>
    <div className="latency-metrics">{([['MeanMs','平均'],['P95Ms','P95'],['P99Ms','P99'],['MaximumMs','峰值']] as const).map(([key,title])=><div key={key}><span>{title}</span><strong>{shown && shown.Status!=='running' && shown.Count>0 ? ms(shown[key]):'—'}<small> ms</small></strong>{comparable && <small>较基线 {(shown[key]-base[key])>0?'+':''}{ms(shown[key]-base[key])} ms</small>}</div>)}</div>
    {!!baseline && !comparable && <p className="lab-notice">请选择两个不同的完整测试，且测量方法、计时器模式、系统信息与时长相同，才能计算差值。</p>}
    {comparable && <p className="lab-notice">差值为当前记录减去基线，负值表示本次更低，不代表已证明优化有效。{shown.PowerScheme!==base.PowerScheme?'两次电源方案不同。':'两次电源方案相同。'}后台负载和游戏场景仍需保持一致。</p>}
    <div className="latency-chart"><header><strong>唤醒延迟趋势</strong><span>每约 250 ms 样本组峰值 · ms</span></header>{points.length ? <svg viewBox="0 0 800 180" role="img" aria-label={`唤醒延迟趋势，共 ${points.length} 个采样组，纵轴最高 ${ms(ymax)} ms`}><text x="0" y="15">{ms(ymax)} ms</text><line x1="72" y1="20" x2="795" y2="20"/><line x1="72" y1="150" x2="795" y2="150"/><text x="30" y="154">0</text><polyline points={points.map(p=>`${72+p.Seconds/Math.max(1,shown?.ElapsedSeconds||shown?.DurationSeconds||30)*720},${150-p.MaximumMs/ymax*130}`).join(' ')}/><text x="72" y="176">0 秒</text><text x="718" y="176">{(shown?.ElapsedSeconds||0).toFixed(1)} 秒</text></svg>:<p>开始测试后显示真实采样曲线</p>}</div>
    {shown && <p className="lab-notice">{shown.Message}<br/>{shown.TimerMode==='high-resolution'?'高精度计时器':shown.TimerMode==='standard-fallback'?'普通计时器（兼容模式）':'计时器尚未就绪'} · {shown.Count||0} 个样本{shown.PowerScheme&&<><br/>{shown.PowerScheme}</>}{shown.Status!=='running' && shown.Count>0 && <><br/>本地服务进程在测量期间的 CPU 消耗：{shown.HostCpuOneCorePercent.toFixed(2)}%（一个逻辑核心为 100%，包含同进程其他任务）</>}</p>}
    <button className="workbench-secondary" onClick={onDpc}>前往 DPC / ISR 驱动诊断</button><p>驱动诊断独立运行，不与此测试同时采集。</p>
  </section>;
}

import { useEffect, useRef, useState } from 'react';
import { hostApi } from '../lib/api';
import { designPreview } from '../lib/designPreview';
import { requestConfirmation } from './ConfirmationDialog';
type Probe={Status:string;Message:string;Until?:string;Report?:string;Trace?:string;Devices?:Array<{Device:string;Reports:number;ObservedHz:number;MedianIntervalMs:number;P95IntervalMs:number;SpanMs:number}>};
type Result={mouse:Probe;dpc:Probe;xperfAvailable:boolean};
export function LabDiagnosticsPanel(){
  const [data,setData]=useState<Result>({mouse:{Status:'idle',Message:'尚未测试'},dpc:{Status:'idle',Message:'尚未采样'},xperfAvailable:false});
  const [busy,setBusy]=useState(false),[error,setError]=useState('');const lock=useRef(false);
  const run=async(fn:()=>Promise<Result>)=>{if(lock.current||designPreview)return;lock.current=true;setBusy(true);setError('');try{setData(await fn());}catch(e){setError(e instanceof Error?e.message:String(e));}finally{lock.current=false;setBusy(false);}};
  useEffect(()=>{void run(()=>hostApi.labSession<Result>('diagnostics'));},[]);
  const running=[data.mouse.Status,data.dpc.Status].some(x=>['running','analyzing'].includes(x));
  useEffect(()=>{if(!running||designPreview)return;const id=setInterval(()=>{if(!lock.current)void run(()=>hostApi.labSession<Result>('diagnostics'));},1500);return()=>clearInterval(id);},[running]);
  const start=(kind:string)=>{if(!requestConfirmation(kind==='mouse'?'测试鼠标输入频率':'采集 DPC / ISR',kind==='mouse'?'请连续移动鼠标 10 秒；按设备分别统计消息频率。':'采集 15 秒系统调度及驱动事件，在本机生成 ETL 与模块统计。',{confirmLabel:'开始测量',note:kind==='mouse'?'只统计鼠标移动消息时间，不采集按键、点击或屏幕坐标。':'此诊断会产生采集开销，日志含程序和驱动路径。不是优化开关，不会修改驱动或中断分配。'}))return;void run(()=>hostApi.labSession<Result>('diagnostic-start',{kind,confirmation:'MEASURE'}));};
  const devices=data.mouse.Devices?Array.isArray(data.mouse.Devices)?data.mouse.Devices:[data.mouse.Devices]:[];
  return <section className="lab-card"><h2>输入与驱动诊断</h2><p>按需运行，默认不采集。测量过程中会有额外开销，请不要把采集期间的帧率当成纯游戏性能。</p><div className="lab-actions"><button className="workbench-secondary" disabled={busy||running||designPreview} onClick={()=>start('mouse')}>鼠标输入频率 · 10 秒</button><button className="workbench-secondary" disabled={busy||running||!data.xperfAvailable||designPreview} onClick={()=>start('dpc')}>DPC / ISR 驱动统计 · 15 秒</button><button className="workbench-secondary" disabled={busy||!running||designPreview} onClick={()=>void run(()=>hostApi.labSession<Result>('diagnostic-stop',{confirmation:'STOP'}))}>停止测量</button><button disabled={busy||designPreview} onClick={()=>void run(()=>hostApi.labSession<Result>('diagnostics'))}>刷新诊断状态</button></div>{!data.xperfAvailable&&<p>驱动统计需要本机安装 <a href="https://learn.microsoft.com/windows-hardware/test/wpt/" target="_blank" rel="noreferrer">Windows Performance Toolkit</a> 的 Xperf；未安装时不可运行。</p>}{error&&<p className="lab-error">{error}</p>}<h3>鼠标</h3><p>{data.mouse.Message}</p>{devices.map(d=><div className="lab-library-row" key={d.Device}><span>{d.ObservedHz} Hz · {d.Reports} 条移动消息<small>消息间隔中位数 {d.MedianIntervalMs} ms · P95 {d.P95IntervalMs} ms · 采样跨度 {(d.SpanMs/1000).toFixed(2)} 秒</small><small>{d.Device}</small></span></div>)}<h3>DPC / ISR</h3><p>{data.dpc.Message}</p>{data.dpc.Trace&&<p className="lab-path">本地报告：{data.dpc.Trace}</p>}{data.dpc.Report&&<pre className="lab-raw-report">{data.dpc.Report}</pre>}</section>;
}

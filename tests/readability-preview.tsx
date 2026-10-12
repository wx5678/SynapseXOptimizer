// Development-only visual fixture. No production requests or real report writes.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MotionConfig} from 'framer-motion';
import {hostApi, type PerformanceReport} from '../src/lib/api';
import {PerformanceReportsPanel} from '../src/components/PerformanceReports';
import {ConfirmationDialogHost,requestConfirmation} from '../src/components/ConfirmationDialog';
import '../src/index.css'; import '../src/workspace.css'; import '../src/skins.css';
import '../src/optimization-layout.css'; import '../src/graphite.css'; import '../src/home.css'; import '../src/readability.css';
const stats=(average:number)=>({average,minimum:average*.7,maximum:average*1.2,p95:average*1.1});
const sample:PerformanceReport={schemaVersion:1,id:'visual-fixture',createdAt:'2026-09-14T00:00:00Z',source:'automatic-session-recorder',
  game:{processName:'example.exe',title:'示例报告 · 不是真实采集',processId:0,path:'',bindingMode:'manual',startedAt:'2026-09-14T00:00:00Z',endedAt:'2026-09-14T00:05:00Z',durationSeconds:300},
  samples:{telemetry:60,fps:60,latency:60,unreachableLatency:0},fps:{average:75,minimum:55,maximum:95,onePercentLowAverage:61,frameTimeAverageMs:13.3,frameTimeP95Ms:18,source:'fixture'},
  cpu:{system:stats(42),game:stats(28)},gpu:{name:'示例显卡',utilization:stats(60),temperature:stats(55),power:stats(110),memoryPeakMB:3000},memory:{systemUsedPercent:stats(50),gameMB:stats(2500)},
  latency:{target:'example.invalid',kind:'fixture',milliseconds:stats(25),jitterMs:2,unreachableSamples:0},network:{adapter:'示例网卡',downloadMbps:stats(3),uploadMbps:stats(1)},
  timeline:Array.from({length:30},(_,i)=>({elapsedSeconds:i*10,fps:70+10*Math.sin(i),onePercentLow:54+7*Math.cos(i),cpu:35,gpu:60,latency:25})),
  observations:[{level:'good',title:'成功状态',detail:'检查绿色文字与图标。'},{level:'warn',title:'警告状态',detail:'检查警告文字与图标。'}]};
hostApi.performanceReports=async()=>[sample];
hostApi.deletePerformanceReport=async()=>{throw new Error('示例页面不允许删除');};
function Fixture(){return <MotionConfig reducedMotion="always"><div className="desktop-workspace p-6">
  <div className="mb-5 flex gap-3"><button className="workbench-secondary" onClick={()=>document.documentElement.dataset.skin='light'}>银白测试</button><button className="workbench-secondary" onClick={()=>document.documentElement.dataset.skin='dark'}>石墨测试</button><button className="workbench-secondary" onClick={()=>requestConfirmation('普通确认测试','检查说明文字、关闭图标、取消和主按钮。')}>普通弹窗</button><button className="workbench-secondary" onClick={()=>requestConfirmation('危险确认测试','这只是外观测试，不执行任何修改。',{danger:true})}>危险弹窗</button></div>
  <PerformanceReportsPanel/><ConfirmationDialogHost/>
</div></MotionConfig>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);

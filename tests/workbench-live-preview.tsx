// Isolated browser fixture. No real game, server, collector or report writes.
import React from 'react';import {createRoot} from 'react-dom/client';
import drawerStyles from '../src/membership.css?raw';
import App from '../src/App';import {hostApi} from '../src/lib/api';
import '../src/index.css';import '../src/workspace.css';import '../src/skins.css';import '../src/optimization-layout.css';import '../src/graphite.css';import '../src/home.css';import '../src/readability.css';import '../src/detail-polish.css';import '../src/membership.css';import '../src/interface-refinement.css';
localStorage.setItem('synapsex.reports.auto','0');localStorage.setItem('synapsex.monitor.mode','auto');
let frame=0, connected=true;
const controls=document.createElement('div');controls.style.cssText='position:fixed;bottom:8px;right:8px;z-index:99999;background:#fff;color:#000;padding:12px;display:flex;gap:12px';
for(const [label,action] of [
 ['模拟封面失败',()=>document.querySelector('.game-cover img')?.dispatchEvent(new Event('error'))],
 ['模拟服务断开',()=>{connected=false;}],['恢复服务连接',()=>{connected=true;}],
] as const){const button=document.createElement('button');button.textContent=label;button.onclick=action;controls.appendChild(button);}document.body.appendChild(controls);
const measure=document.createElement('button'),meter=document.createElement('output');measure.textContent='测量侧栏动画（6秒）';meter.setAttribute('aria-live','polite');controls.append(measure,meter);
// Exercise the production open-state rules at deterministic intervals. This
// test-only class is never emitted by the application or shipped in its entry.
const motionStyles=document.createElement('style');motionStyles.textContent=[...drawerStyles.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(match=>match[1].includes('.workspace-sidebar-frame:is(:hover, :has(:focus-visible))')).map(match=>`${match[1].replaceAll('.workspace-sidebar-frame:is(:hover, :has(:focus-visible))','.workspace-sidebar-frame.motion-qa-open')}{${match[2]}}`).join('\n');document.head.appendChild(motionStyles);
measure.onclick=()=>{
 measure.disabled=true;meter.textContent='采样中，自动往返侧栏';
 const sidebar=document.querySelector('.workspace-sidebar-frame');const toggle=window.setInterval(()=>sidebar?.classList.toggle('motion-qa-open'),360);
 const deltas:number[]=[],widths:number[]=[];let last=0;const start=performance.now();
 const sample=(time:number)=>{if(last)deltas.push(time-last);last=time;const main=document.querySelector('.workspace-main');if(main)widths.push(main.getBoundingClientRect().width);
  if(time-start<6000)requestAnimationFrame(sample);else{clearInterval(toggle);sidebar?.classList.remove('motion-qa-open');const sorted=[...deltas].sort((a,b)=>a-b);meter.textContent=`完成：${deltas.length}帧，P95 ${sorted[Math.floor(sorted.length*.95)]?.toFixed(1)}ms，最长 ${Math.max(...deltas).toFixed(1)}ms，>33ms ${deltas.filter(x=>x>33).length}帧，内容宽度变化 ${(Math.max(...widths)-Math.min(...widths)).toFixed(1)}px`;measure.disabled=false;}
 };requestAnimationFrame(sample);
};
window.synapsexDesktop={fpsState:async()=>{frame++;return {running:true,status:'capturing',targetProcessId:9999,targetProcessName:'fxgame.exe',fps:630+Math.sin(frame)*30,frameTimeMs:1.59+Math.sin(frame)*.2,onePercentLow:390,sampleCount:100}},} as Window['synapsexDesktop'];
hostApi.status=async()=>({connected,gameRunning:true,elevated:false} as Awaited<ReturnType<typeof hostApi.status>>);
hostApi.backups=async()=>[];
hostApi.monitorSample=async()=>({sampledAt:new Date().toISOString(),game:{id:9999,name:'fxgame.exe',title:'九阴真经 · 模拟采样',running:true,cpuPercent:10,memoryMB:1000,priority:'Normal'},cpu:{totalPercent:18,logicalProcessors:16},gpu:{utilizationPercent:91}} as Awaited<ReturnType<typeof hostApi.monitorSample>>);
hostApi.monitorTargets=async()=>({candidates:[],detected:{processId:4,processName:'System.exe'}} as Awaited<ReturnType<typeof hostApi.monitorTargets>>);
createRoot(document.getElementById('root')!).render(<App/>);

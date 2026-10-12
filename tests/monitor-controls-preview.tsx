// Isolated UI fixture. No native process, driver, game or account calls.
import React from 'react';import {createRoot} from 'react-dom/client';
import {RealtimeMonitorPanel} from '../src/components/RealtimeMonitor';
import {hostApi} from '../src/lib/api';
import '../src/index.css';import '../src/workspace.css';import '../src/skins.css';import '../src/graphite.css';import '../src/readability.css';
document.documentElement.dataset.skin=new URLSearchParams(location.search).get('skin')==='light'?'light':'dark';
let controls={overlayEnabled:false,clickThrough:false,autoCapture:false,mode:'auto',manualProcess:'',overlayVisible:false,waitingForGame:false,error:'',...JSON.parse(localStorage.getItem('test-monitor-controls')||'{}')};
let capturing=false;
const fps=()=>({available:true,running:capturing,status:capturing?'capturing':'stopped',fps:capturing?144:null,onePercentLow:110,frameTimeMs:6.94,targetProcessId:99,targetProcessName:'fxgame.exe',sampleCount:100,source:'测试数据',error:''});
window.synapsexDesktop={monitorControls:async()=>controls,saveMonitorControls:async patch=>{controls={...controls,...patch};controls.overlayVisible=controls.overlayEnabled;localStorage.setItem('test-monitor-controls',JSON.stringify(controls));return controls;},fpsState:async()=>fps(),startFps:async()=>{capturing=true;return fps()},stopFps:async()=>{capturing=false;return fps()},configureOverlay:async()=>({}),openSensorHelp:async()=>{},installSensorDriver:async()=>({status:'cancelled',message:'隔离测试：已取消安装，没有下载或安装驱动。'})} as unknown as Window['synapsexDesktop'];
const game={processId:99,processName:'fxgame.exe',title:'测试游戏',gpuPercent:25,autoEligible:true};
hostApi.monitorTargets=async()=>({candidates:[game],detected:game,note:'隔离测试进程',capturedAt:''}) as any;
hostApi.monitorSample=async()=>({game:{id:99,name:'fxgame.exe',memoryMB:1000,cpuPercent:10},cpu:{totalPercent:20,logicalProcessors:16,temperatureC:null,temperatureStatus:'driver-missing',temperatureMessage:'未安装 PawnIO 温度读取驱动；当前不会自动安装。'},gpu:null,memory:{usedPercent:40,usedGB:12,totalGB:32},network:{downloadMbps:0,uploadMbps:0},latency:{reachable:false}}) as any;
createRoot(document.getElementById('root')!).render(<main className="desktop-workspace" style={{padding:32}}><p>隔离测试 · 所有读数与进程均为模拟</p><RealtimeMonitorPanel/></main>);

// Actual toolbar components, isolated account/product fixtures; no server writes.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {WorkspaceTopActions} from '../src/components/WorkspaceTopActions';
import {OptimizationAssistant} from '../src/components/OptimizationAssistant';
import {JiuYinFpsUnlockCard} from '../src/components/JiuYinFpsUnlockCard';
import {WorkspaceNavigationLayout,WorkspaceNavigation} from '../src/components/WorkspaceNavigation';
import {AppearanceContext,useAppearance} from '../src/lib/appearance';
import '../src/index.css';import '../src/workspace.css';import '../src/skins.css';import '../src/optimization-layout.css';import '../src/graphite.css';import '../src/home.css';import '../src/readability.css';import '../src/detail-polish.css';import '../src/membership.css';import '../src/interface-refinement.css';
const params=new URLSearchParams(location.search),role=params.get('role')||'admin';
localStorage.setItem('synapsex.appearance.v1',JSON.stringify({skin:params.get('skin')||'dark',followSystem:false,motion:false,particles:false}));
const account={status:role==='guest'?'logged_out':'active',user:role==='guest'?null:{username:params.get('long')?'VeryLongAccountName1234567890':'1'},administrator:role==='admin',features:role==='vip'?['vip']:[],expiresAt:1800000000};
const product={checked:true,available:false,required:false,currentVersion:'0.39.25'};
window.synapsexDesktop={softwareAccount:{state:async()=>account},product:{state:async()=>product,refresh:async()=>{document.body.dataset.refreshed='yes';return product;}}} as unknown as Window['synapsexDesktop'];
function Fixture(){const appearance=useAppearance(false);return <AppearanceContext.Provider value={appearance}><div className="desktop-workspace"><main className="workspace-main" style={{paddingTop:48,minHeight:'100vh'}}><WorkspaceNavigationLayout context={<div className="workspace-context is-overview"><span>工作台　›　<strong>总览</strong></span><WorkspaceTopActions connected={params.get('offline')!=='1'}/></div>}><WorkspaceNavigation><div className="dashboard-heading"><div><h1>游戏工作台</h1><p>游戏、性能与配置，一处掌握。</p></div></div></WorkspaceNavigation><div style={{marginTop:24,padding:28,border:'1px solid var(--prism-line)',borderRadius:16,background:'var(--skin-surface)'}}><h2>九阴真经</h2><p>工具栏布局与交互隔离测试</p></div></WorkspaceNavigationLayout></main></div></AppearanceContext.Provider>}
if(params.has('fps')){
 const original={supported:true,gameRoot:'D:/fixture',cap:999,visualRange:450,running:false,hasBackup:false,canApply:false,canRestore:false,backupPath:'',message:'需要原版备份'};
 const control={calls:0,writes:0,resolve:(_value:unknown)=>{},reject:(_value:unknown)=>{}};
 Object.assign(window,{fpsTest:control});
 window.synapsexDesktop={jiuyinFps:{state:async()=>{control.calls++;if(control.calls===1)return original;return new Promise((resolve,reject)=>{control.resolve=(patch)=>resolve({...original,...patch as object});control.reject=reject;});},apply:async()=>{control.writes++;return original;}}} as unknown as Window['synapsexDesktop'];
 createRoot(document.getElementById('root')!).render(<div className="desktop-workspace" style={{padding:28}}><JiuYinFpsUnlockCard gameRoot="D:/fixture"/></div>);
}else createRoot(document.getElementById('root')!).render(<><Fixture/>{params.get('help')==='1'&&<OptimizationAssistant page="system" gameRunning={false} connected={true} visualMode="eco" onNavigate={()=>{}}/>}</>);

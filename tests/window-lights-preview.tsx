import React from 'react';import {createRoot} from 'react-dom/client';
import {AppearanceContext,useAppearance} from '../src/lib/appearance';
import {WindowLightEffect} from '../src/components/WindowLightEffect';
import '../src/index.css';import '../src/workspace.css';import '../src/skins.css';import '../src/graphite.css';
const params=new URLSearchParams(location.search);
localStorage.setItem('synapsex.appearance.v1',JSON.stringify({skin:params.get('skin')||'dark',followSystem:false,motion:!params.has('off'),particles:false}));
function Fixture(){const p=useAppearance(params.has('game'));return <AppearanceContext.Provider value={{...p,reducedMotion:params.has('reduced')||p.reducedMotion}}><div className="desktop-workspace" style={{minHeight:'100vh',padding:60,background:'var(--prism-canvas)',color:'var(--prism-text)'}}><h1 style={{fontSize:30,fontWeight:600}}>SynapseX</h1><p>游戏性能工作台</p><section style={{marginTop:36,border:'1px solid var(--prism-line)',borderRadius:20,padding:32,background:'var(--skin-surface)'}}><h2 style={{fontSize:24}}>九阴真经</h2><p style={{margin:'20px 0'}}>游戏、性能与配置，一处掌握。</p><button id="focus-target" className="prism-button-primary">查看优化建议</button></section><WindowLightEffect/></div></AppearanceContext.Provider>}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture/></React.StrictMode>);

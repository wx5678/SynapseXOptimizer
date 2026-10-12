import React from 'react';
import {createRoot} from 'react-dom/client';
import {SensorInstallDialog} from '../src/components/SensorInstallDialog';
import '../src/index.css';import '../src/workspace.css';import '../src/skins.css';import '../src/graphite.css';import '../src/readability.css';import '../src/detail-polish.css';import '../src/interface-refinement.css';
document.documentElement.dataset.skin=new URLSearchParams(location.search).get('skin')==='light'?'light':'dark';
document.documentElement.dataset.motion='off';
createRoot(document.getElementById('root')!).render(<React.StrictMode><div className="desktop-workspace" style={{minHeight:'100vh',padding:40,background:'var(--prism-canvas)',color:'var(--prism-text)'}}><button id="preview-focus">温度监控</button><SensorInstallDialog/></div></React.StrictMode>);

import React from 'react';
import {createRoot} from 'react-dom/client';
import {CloseWindowDialog} from '../src/components/CloseWindowDialog';
import '../src/index.css';import '../src/workspace.css';import '../src/skins.css';import '../src/graphite.css';import '../src/readability.css';import '../src/detail-polish.css';import '../src/interface-refinement.css';
document.documentElement.dataset.skin=new URLSearchParams(location.search).get('skin')==='light'?'light':'dark';
document.documentElement.dataset.motion='off';
createRoot(document.getElementById('root')!).render(<React.StrictMode><div className="desktop-workspace" style={{minHeight:'100vh',padding:50,background:'var(--prism-canvas)',color:'var(--prism-text)'}}><button id="preview-focus">SynapseX · 关闭窗口隔离测试</button><CloseWindowDialog/></div></React.StrictMode>);

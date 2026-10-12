import React from 'react';
import {createRoot} from 'react-dom/client';
import {PowerLibraryCard} from '../src/components/PowerLibraryCard';
import library from '../host/power-library/catalog.json';
import '../src/index.css';import '../src/workspace.css';import '../src/skins.css';import '../src/graphite.css';import '../src/readability.css';import '../src/detail-polish.css';import '../src/interface-refinement.css';
document.documentElement.dataset.skin=new URLSearchParams(location.search).get('skin')==='light'?'light':'dark';
document.documentElement.dataset.motion='off';
createRoot(document.getElementById('root')!).render(<React.StrictMode><div className="desktop-workspace" style={{minHeight:'100vh',padding:24,background:'var(--prism-canvas)',color:'var(--prism-text)'}}><PowerLibraryCard library={library} busy={false} onApply={(plan,full,risk)=>{document.body.dataset.applied=JSON.stringify({id:plan.id,full,risk});}} onRestore={()=>{document.body.dataset.restored='yes';}}/></div></React.StrictMode>);

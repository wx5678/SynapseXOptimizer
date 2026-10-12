import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import type { WorkspacePage } from './OptimizerWorkspace';
export type SectionRequest = { page: WorkspacePage; section: string; sequence: number };
type Shortcut = { label: string; page: WorkspacePage; section?: string };
export const sidebarShortcuts: Partial<Record<WorkspacePage, Shortcut[]>> = {
  system: ['基础与显卡','常用调整','服务与设备','计划任务','空间清理','高级参数','Windows 工具','未连接设备'].map(label=>({label,page:'system',section:label})),
  network: [['连接状态','status'],['稳定性 / 路由','stability'],['DNS','dns'],['TCP / QoS','tcp'],['网卡高级','nic'],['Hosts','hosts'],['MTU','mtu']].map(([label,section])=>({label,page:'network',section})),
  lab: [['系统响应延迟测试','latency'],['会话与游戏库','session'],['输入与驱动诊断','diagnostics'],['启动与中断','registry'],['显卡驱动扩展','gpu'],['线程实验','thread']].map(([label,section])=>({label,page:'lab',section})),
  monitor: [{label:'实时监控与悬浮窗',page:'monitor'},{label:'性能诊断',page:'diagnostics'},{label:'性能报告',page:'reports'}],
};
export const extraShortcuts: Shortcut[] = [{label:'性能诊断',page:'diagnostics'},{label:'游戏进程会话',page:'runtime'},{label:'应用与启动项',page:'startup'},{label:'修复中心',page:'repair'}];
export function SidebarFlyout({ label, items, children, onNavigate }: {label: string; items?: Shortcut[]; children: ReactNode; onNavigate: (page: WorkspacePage, section?: string)=>void}) {
  const id=useId(), anchor=useRef<HTMLDivElement>(null), panel=useRef<HTMLDivElement>(null), trigger=useRef<HTMLButtonElement>(null);
  const openTimer=useRef<ReturnType<typeof setTimeout>>(), closeTimer=useRef<ReturnType<typeof setTimeout>>();
  const [position,setPosition]=useState<{left:number;top:number}|null>(null);
  const clearTimers=()=>{clearTimeout(openTimer.current);clearTimeout(closeTimer.current);};
  const close=()=>{clearTimers();setPosition(null);};
  const show=()=>{clearTimers();const bounds=anchor.current?.getBoundingClientRect();if(bounds)setPosition({left:bounds.right+3,top:Math.max(52,Math.min(bounds.top,window.innerHeight-((items?.length||0)*42+56)-12))});};
  const queueClose=()=>{clearTimeout(openTimer.current);clearTimeout(closeTimer.current);closeTimer.current=setTimeout(()=>{if(!panel.current?.contains(document.activeElement))setPosition(null);},180);};
  useEffect(()=>()=>clearTimers(),[]);
  useEffect(()=>{
    if(!position)return;
    const dismiss=(e:PointerEvent)=>{if(!panel.current?.contains(e.target as Node)&&!anchor.current?.contains(e.target as Node))close();};
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();close();trigger.current?.focus();}};
    const resize=()=>close();
    const scroll=(e:Event)=>{if(!panel.current?.contains(e.target as Node))close();};
    document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',escape);window.addEventListener('resize',resize);window.addEventListener('scroll',scroll,true);
    return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',escape);window.removeEventListener('resize',resize);window.removeEventListener('scroll',scroll,true);};
  },[!!position]);
  if(!items?.length)return <>{children}</>;
  return <div className="sidebar-flyout-anchor" ref={anchor} onPointerEnter={e=>{if(e.pointerType==='mouse'&&matchMedia('(hover: hover) and (pointer: fine)').matches){clearTimers();openTimer.current=setTimeout(show,200);}}} onPointerLeave={queueClose} onBlur={e=>{if(!anchor.current?.contains(e.relatedTarget as Node)&&!panel.current?.contains(e.relatedTarget as Node))queueClose();}}>
    {children}<button className="sidebar-expand" ref={trigger} aria-label={`展开${label}快捷入口`} aria-expanded={!!position} aria-controls={position?id:undefined} onClick={()=>position?close():show()} onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowDown'){e.preventDefault();show();requestAnimationFrame(()=>panel.current?.querySelector('button')?.focus());}}}><ChevronRight size={14}/></button>
    {position&&createPortal(<div ref={panel} id={id} className="sidebar-flyout" style={position} aria-label={`${label}快捷入口`} onPointerEnter={clearTimers} onPointerLeave={queueClose} onBlur={e=>{if(!panel.current?.contains(e.relatedTarget as Node)&&!anchor.current?.contains(e.relatedTarget as Node))queueClose();}} onKeyDown={e=>{const buttons=Array.from(panel.current?.querySelectorAll('button')||[]);const index=buttons.indexOf(document.activeElement as HTMLButtonElement);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();buttons[(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}if(e.key==='Tab'&&((!e.shiftKey&&index===buttons.length-1)||(e.shiftKey&&index===0))){e.preventDefault();close();trigger.current?.focus();}}}>
      <header>{label}<small>快捷入口</small></header>{items.map(item=><button key={item.label} onClick={()=>{close();onNavigate(item.page,item.section);}}>{item.label}<ChevronRight size={13}/></button>)}
    </div>,document.body)}
  </div>;
}

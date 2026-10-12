import {useEffect,useState} from 'react';
import {userError} from '../lib/userError';
export function useVip() {
  const [state,setState]=useState({vip:false,features:[] as string[],signinLimit:1});
  useEffect(()=>{let active=true; const refresh=()=>void window.synapsexDesktop?.vip?.state().then(x=>{if(active)setState(x)}).catch(()=>{}); refresh(); const timer=setInterval(refresh,15000); window.addEventListener('focus',refresh);window.addEventListener('synapsex:account-changed',refresh); return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('synapsex:account-changed',refresh)}},[]);
  return state;
}
export async function requireVip(feature:string) {
  if(!window.synapsexDesktop?.vip) {window.dispatchEvent(new CustomEvent('synapsex:open-account',{detail:'register'}));throw Error('请在桌面软件注册或登录后开通 VIP。');}
  try { await window.synapsexDesktop.vip.require(feature); }
  catch(error) { throw new Error(userError(error)); }
}
export function VipNotice({feature,title}:{feature:string;title:string}) {
  const state=useVip();
  return <div role="status" className="rounded-xl border border-[var(--prism-line)] bg-[var(--skin-input)] p-4 text-sm">{state.features.includes(feature)?`VIP · ${title}已解锁`:<><span>VIP 专属 · {title}。查看原状态、停止任务和恢复备份不受限制。</span><button className="ml-3 underline" onClick={()=>window.dispatchEvent(new CustomEvent('synapsex:open-account',{detail:'register'}))}>注册 / 登录或开通会员</button></>}</div>;
}

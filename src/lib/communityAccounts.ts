import { useSyncExternalStore } from 'react';
export const accountTitle = (a: CommunityAccount) => a.name || a.accountName || (a.state?.loggedIn ? '已登录账号' : '账号名称未识别');
export const accountIdentity = (a: CommunityAccount) => a.accountName || (a.state?.loggedIn ? '名称未识别，不影响签到；可添加备注区分' : '名称未识别');
export const signinLabel = (a: CommunityAccount) => ({signed: '已签到', pending: '今日待确认', login: '需要登录', configure: '待配置区服', error: '需要处理'}[a.status]);
export function accountDays(a: CommunityAccount) { return a.state?.records.find(r => r.serverId === a.state?.choice.serverId)?.days ?? null; }
export function serverName(a: CommunityAccount) {
  try { const parts = JSON.parse(a.state?.choice.optionKey || '[]'); return parts[2] || '尚未选择区服'; } catch { return '请重新选择区服'; }
}
// One local snapshot stream shared by sidebar, home and sign-in screen.
// Adding global reminders must not multiply collectors or official requests.
let snapshot: {data:CommunityAccounts|null;error:string} = {data:null,error:''};
let timer: number | undefined, pending: Promise<void> | null = null;
const subscribers = new Set<()=>void>();
function reload() {
  if (pending) return pending;
  const api = window.synapsexDesktop?.community;
  if (!api) return Promise.resolve();
  pending = (async()=>{
    try { snapshot = {data:await api.accounts(),error:''}; }
    catch { snapshot = {...snapshot,error:'无法读取签到账号，请重新打开软件。'}; }
    for (const listener of subscribers) listener();
  })().finally(()=>{pending=null;});
  return pending;
}
function subscribe(listener:()=>void) {
  subscribers.add(listener);
  if (subscribers.size===1) {void reload(); timer=window.setInterval(()=>{if(!document.hidden)void reload();},2000);}
  return ()=>{subscribers.delete(listener);if(!subscribers.size){window.clearInterval(timer);timer=undefined;}};
}
export function useCommunityAccounts() {
  const value = useSyncExternalStore(subscribe,()=>snapshot);
  return {api:window.synapsexDesktop?.community,...value,reload};
}

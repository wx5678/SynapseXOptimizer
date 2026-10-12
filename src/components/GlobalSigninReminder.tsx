import {CalendarCheck, ChevronRight, AlertCircle} from 'lucide-react';
import {useCommunityAccounts} from '../lib/communityAccounts';
import './community-signin.css';
export function GlobalSigninReminder({onOpen}: {onOpen:()=>void}) {
  const {data,error,api}=useCommunityAccounts();
  const accounts=data?.accounts || [], done=accounts.filter(a=>a.status==='signed').length;
  const needLogin=accounts.filter(a=>a.state?.loggedIn===false).length;
  const allDone=accounts.length>0 && done===accounts.length;
  return <button className={`global-signin-reminder ${allDone?'is-complete':''}`} onClick={onOpen} aria-label="查看今日签到状态" title={`${data?.date || '今日'} · 北京时间`}>
    {error || data?.storageError ? <AlertCircle size={18}/> : <CalendarCheck size={18}/>}
    <span><strong>{data?.busy?'正在处理签到':allDone?'今日已全部签到':'今日签到'}<b>{accounts.length ? `${done} / ${accounts.length}` : '—'}</b></strong><small>{error || data?.storageError ? '状态读取失败，点击查看' : !api ? '打开桌面版管理签到' : !accounts.length ? '添加账号，开始签到' : `${allDone?'今日签到已完成':`还有 ${accounts.length-done} 个账号待确认`}${needLogin ? ` · ${needLogin} 个需登录` : ''}`}</small></span><ChevronRight size={13}/>
  </button>;
}

import { CalendarCheck, ArrowRight, Clock3 } from 'lucide-react';
import { useCommunityAccounts, accountDays, accountTitle } from '../lib/communityAccounts';
import './community-signin.css';
export function CommunitySigninSummary({onOpen}: {onOpen: () => void}) {
  const {data, error} = useCommunityAccounts();
  const list = data?.accounts || [], signed = list.filter(a => a.status === 'signed');
  const pending = list.length - signed.length;
  return <section className="dashboard-signin" aria-label="社区签到功能"><div className="signin-symbol"><CalendarCheck size={23}/></div><div><h2>社区签到 <span>{list.length ? `${signed.length} / ${list.length} 已签到` : '多账号管理'}</span></h2><p>{error || (data?.busy ? `签到处理中：${data.progress?.completed || 0} / ${data.progress?.total || 0}` : pending ? `${pending} 个账号尚未确认今日签到，记得完成。` : signed.length ? '今日已签到，明天再来。' : '保存账号与区服，支持一键批量签到。')}</p>{signed.length > 0 && <p className="dashboard-signin-days">{signed.slice(0, 3).map(a => `${accountTitle(a)} · 已签到${accountDays(a) != null ? ` · 累计 ${accountDays(a)} 天` : ''}`).join('　/　')}{signed.length > 3 ? ' …' : ''}</p>}</div><button className="workbench-secondary" onClick={onOpen}>{pending > 0 ? <Clock3 size={15}/> : <CalendarCheck size={15}/>}签到管理<ArrowRight size={15}/></button></section>;
}

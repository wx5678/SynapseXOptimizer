// Activity responses are not interchangeable: 4026 is throttling, NOT logout.
function loginResponse(value) {
  const code=String(value?.msgcode);
  if(code==='1') return true;
  if(code==='4028') return false;
  const error=new Error(code==='4026' ? '官方请求过于频繁，请稍后刷新；登录状态未被清除。' : '官方暂未确认账号状态，请稍后刷新。');
  error.code=code; throw error;
}
const alreadyToday=message=>{
  const text=String(message||'');
  // Require an explicit today/already-signed statement; never match instructions.
  return !/(?:尚未|还未|未签到|没有签到|如果|若已)/.test(text) && /(?:今日|今天|当天).{0,8}(?:已签到|已经签到|已签过到|已经签过到|已完成签到)|(?:已签到|已经签到|已签过到|已经签过到).{0,8}(?:今日|今天|当天)/.test(text);
};
function createActivityScheduler({interval=2500,now=Date.now,wait=ms=>new Promise(r=>setTimeout(r,ms))}={}) {
  let tail=Promise.resolve(),last=0;
  return task=>{
    const next=tail.catch(()=>{}).then(async()=>{const delay=last+interval-now();if(delay>0)await wait(delay);last=now();return task();});
    tail=next.catch(()=>{});return next;
  };
}
const scheduleActivity=createActivityScheduler();
module.exports={loginResponse,alreadyToday,createActivityScheduler,scheduleActivity};

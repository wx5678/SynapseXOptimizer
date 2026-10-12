// Only a successful online sync can trigger rollback. Never infer expiry from
// network failure, an offline lease, logout, free registration or display role.
function shouldRestore(state) {
  return !!state?.user && state.administrator !== true && state.vipStatus === 'expired';
}
function createFpsExpiry({account, fps, notify = ()=>{}}) {
  let timer, busy=false, stopped=false, pending=Promise.resolve(), status={message:'',gameRoot:'',pending:false};
  const tick = async()=>{
    if(busy || stopped)return;
    busy=true;
    let finished;
    pending=new Promise(resolve=>{finished=resolve;});
    try {
      const roots=fps.managedRoots();
      if(!roots.length || !account.state().user)return;
      const fresh=await account.sync();
      if(stopped)return;
      if(!shouldRestore(fresh)) {status={message:'',gameRoot:'',pending:false};return;}
      for(const root of roots) {
        if(stopped)break;
        const before=await fps.state(root);
        if(before.cap===null || (before.cap<=300 && (before.visualRange ?? 250)<=250))continue;
        try {
          const result=await fps.restoreExpired(root,async()=>{
            if(stopped || !shouldRestore(await account.sync()))throw Error('账号权限已变化，已取消自动恢复。');
          });
          status={gameRoot:root,message:result.message,pending:false};
          notify(status);
        } catch(error) {
          const next={gameRoot:root,message:error.message,pending:true};
          if(next.message!==status.message)notify(next);
          status=next;
        }
      }
    } catch { /* Offline or unconfirmed account: do not modify game files. */ }
    finally {busy=false;finished();}
  };
  return {tick,state:()=>({...status}),start(){if(timer)return;stopped=false;timer=setInterval(()=>void tick(),60000);timer.unref?.();void tick();},stop(){stopped=true;clearInterval(timer);timer=null;return pending;}};
}
module.exports={shouldRestore,createFpsExpiry};

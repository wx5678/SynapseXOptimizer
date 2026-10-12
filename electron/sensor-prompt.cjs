const {randomUUID}=require('node:crypto');
const {RELEASE}=require('./sensor-installer.cjs');

// Consent is per request, main-frame-only (registered in main.cjs), never saved.
function createSensorPrompt({setTimer=setTimeout,clearTimer=clearTimeout}={}) {
  const ready=new WeakSet();let pending=null;
  function finish(accepted) {
    if(!pending)return;
    const p=pending;pending=null;clearTimer(p.timer);
    for(const event of ['destroyed','render-process-gone','did-start-loading'])p.sender.removeListener(event,p.cancel);
    try {if(!p.sender.isDestroyed())p.sender.send('sensor-prompt:dismiss',p.id);}catch { /* Renderer loss must still cancel consent. */ }
    p.resolve(accepted);
  }
  return {
    setReady(sender,value) {
      if(typeof value!=='boolean')throw Error('安装确认界面状态无效');
      if(value)ready.add(sender);else {ready.delete(sender);if(pending?.sender===sender)finish(false);}
    },
    ask(window) {
      const sender=window?.webContents;
      if(!sender||sender.isDestroyed()||!ready.has(sender))return Promise.reject(Error('安装确认界面尚未就绪，请重新打开工作台后再试。'));
      if(pending)return Promise.resolve(false);
      return new Promise(resolve=>{
        const id=randomUUID(),cancel=()=>{ready.delete(sender);finish(false);};
        pending={id,sender,resolve,cancel,timer:null,acknowledged:false};
        for(const event of ['destroyed','render-process-gone','did-start-loading'])sender.once(event,cancel);
        pending.timer=setTimer(()=>{if(pending?.id===id)finish(false);},2500);
        try {sender.send('sensor-prompt:request',{id,version:RELEASE.version});}catch {finish(false);}
      });
    },
    acknowledge(sender,id) {
      if(!pending||pending.sender!==sender||pending.id!==id)return false;
      pending.acknowledged=true;clearTimer(pending.timer);return true;
    },
    respond(sender,value) {
      if(!pending||pending.sender!==sender||pending.id!==value?.id||!pending.acknowledged)throw Error('安装确认已失效，请重试。');
      if(typeof value.accepted!=='boolean')throw Error('安装确认无效');
      finish(value.accepted);return true;
    },
    stop:()=>finish(false),
  };
}
module.exports={createSensorPrompt};

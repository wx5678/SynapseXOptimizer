const {randomUUID}=require('node:crypto');

// Renderer supplies presentation only; the main process still decides whether
// to save preferences, hide the window or exit, for one outstanding request.
function createClosePrompt({dialog,setTimer=setTimeout,clearTimer=clearTimeout}) {
  const ready=new WeakSet();
  let pending=null;
  const cancelled={response:2,checkboxChecked:false};
  function finish(result) {
    if(!pending)return;
    const request=pending;pending=null;
    clearTimer(request.timer);
    request.sender.removeListener('destroyed',request.cancel);
    request.sender.removeListener('render-process-gone',request.cancel);
    request.sender.removeListener('did-start-loading',request.cancel);
    request.resolve(result);
  }
  function setReady(sender,value) {
    if(typeof value!=='boolean')throw Error('关闭窗口界面状态无效');
    if(value)ready.add(sender);
    else {ready.delete(sender);if(pending?.sender===sender)finish(cancelled);}
  }
  function ask(window,options) {
    const sender=window.webContents;
    if(!ready.has(sender))return dialog.showMessageBox(window,options);
    if(pending)return Promise.resolve(cancelled);
    return new Promise(resolve=>{
      const id=randomUUID();
      const cancel=()=>{ready.delete(sender);finish(cancelled);};
      pending={id,sender,resolve,cancel,timer:null,fallback:false};
      sender.once('destroyed',cancel);sender.once('render-process-gone',cancel);sender.once('did-start-loading',cancel);
      pending.timer=setTimer(async()=>{
        if(!pending || pending.id!==id)return;
        pending.fallback=true;ready.delete(sender);
        if(!sender.isDestroyed())sender.send('window-close:dismiss',id);
        try {const result=await dialog.showMessageBox(window,options);if(pending?.id===id)finish(result);}
        catch {if(pending?.id===id)finish(cancelled);}
      },2500);
      try {sender.send('window-close:prompt',id);} catch {finish(cancelled);}
    });
  }
  function acknowledge(sender,id) {
    if(!pending || pending.sender!==sender || pending.id!==id || pending.fallback)return false;
    clearTimer(pending.timer);return true;
  }
  function respond(sender,value) {
    if(!pending || pending.sender!==sender || pending.id!==value?.id || pending.fallback)throw Error('关闭窗口请求已失效');
    if(!['tray','quit','cancel'].includes(value.action) || typeof value.remember!=='boolean')throw Error('关闭窗口选择无效');
    finish({response:{tray:0,quit:1,cancel:2}[value.action],checkboxChecked:value.action!=='cancel' && value.remember});
    return true;
  }
  return {ask,setReady,acknowledge,respond,stop:()=>finish(cancelled)};
}
module.exports={createClosePrompt};

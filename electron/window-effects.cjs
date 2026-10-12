const {randomUUID}=require('node:crypto');

// Cosmetic handshake only. Animation failure must never prevent hide or quit.
function createWindowEffects({setTimer=setTimeout,clearTimer=clearTimeout}={}) {
  const ready=new WeakSet();let pending=null;
  function finish(allowed=true) {
    if(!pending)return;
    const request=pending;pending=null;clearTimer(request.timer);
    for(const event of ['destroyed','render-process-gone','did-start-loading'])request.sender.removeListener(event,request.lost);
    request.resolve(allowed);
  }
  function send(window,kind,id=randomUUID()) {
    if(!window||window.isDestroyed()||window.webContents.isDestroyed()||!ready.has(window.webContents))return false;
    try {window.webContents.send('window-effects:play',{id,kind});return true;}catch{return false;}
  }
  function enter(window) {
    if(pending?.kind==='quit')return;
    if(pending)finish(false);
    send(window,'enter');
  }
  function cancelHide(window) {if(pending?.kind==='tray'&&pending.sender===window?.webContents)enter(window);}
  function setReady(window,value) {
    if(typeof value!=='boolean')throw Error('窗口动画状态无效');
    if(value){const fresh=!ready.has(window.webContents);ready.add(window.webContents);if(fresh&&window.isVisible())enter(window);}
    else {ready.delete(window.webContents);if(pending?.sender===window.webContents)finish();}
  }
  function leave(window,kind) {
    if(!['tray','quit'].includes(kind))throw Error('窗口动画类型无效');
    if(!window||window.isDestroyed()||!window.isVisible()||window.isMinimized()||!ready.has(window.webContents))return Promise.resolve(true);
    if(pending){if(pending.kind===kind)return pending.promise;finish(false);}
    let resolve;const promise=new Promise(r=>resolve=r),sender=window.webContents,id=randomUUID();
    const lost=()=>{ready.delete(sender);finish();};
    pending={id,sender,kind,resolve,promise,lost,timer:null};
    for(const event of ['destroyed','render-process-gone','did-start-loading'])sender.once(event,lost);
    pending.timer=setTimer(()=>finish(),650);
    if(!send(window,kind,id))finish();
    return promise;
  }
  function complete(sender,id) {if(!pending||pending.sender!==sender||pending.id!==id)return false;finish();return true;}
  return {setReady,enter,cancelHide,leave,complete,stop:()=>finish()};
}
module.exports={createWindowEffects};

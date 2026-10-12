const fs = require('node:fs');
const path = require('node:path');
const defaults = { overlayEnabled:false, clickThrough:false, autoCapture:false, mode:'auto', manualProcess:'' };
function normalize(value) {
  return {overlayEnabled:value?.overlayEnabled===true, clickThrough:value?.clickThrough===true, autoCapture:value?.autoCapture===true,
    mode:value?.mode==='manual'?'manual':'auto', manualProcess:typeof value?.manualProcess==='string'?value.manualProcess.slice(0,260):''};
}
function createMonitorController({directory, targets, fps, startFps, stopFps, openOverlay, closeOverlay, setClickThrough, visible, authorize=()=>{}, timers=globalThis}) {
  const file=path.join(directory,'monitor-controls-v1.json');
  let settings={...defaults};
  try {settings=normalize(JSON.parse(fs.readFileSync(file,'utf8')));} catch {}
  let busy=false, stopped=false, timer, revision=0, missed=0, manualPaused=false, lastTarget=null, error='', retryAfter=0;
  const state=()=>({...settings, overlayVisible:visible(), waitingForGame:settings.overlayEnabled&&!visible(), error});
  function save(patch) {
    for(const [key,value] of Object.entries(patch||{})) {
      if(!Object.hasOwn(defaults,key) || (typeof defaults[key]==='boolean'&&typeof value!=='boolean')) throw Error('无效的监控设置');
      if(key==='mode'&&!['auto','manual'].includes(value))throw Error('无效识别方式');
      if(key==='manualProcess'&&(typeof value!=='string'||value.length>260))throw Error('无效进程名称');
    }
    const next=normalize({...settings,...patch});
    fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(file+'.pending',JSON.stringify(next));fs.renameSync(file+'.pending',file);
    const bindingChanged=next.mode!==settings.mode||next.manualProcess!==settings.manualProcess;
    settings=next;revision++;error='';retryAfter=0;
    if(bindingChanged){missed=0;manualPaused=false;if(settings.autoCapture)stopFps();}
    if(Object.hasOwn(patch,'autoCapture'))manualPaused=false;
    if(!settings.overlayEnabled)closeOverlay();
    setClickThrough(settings.clickThrough);
    if(patch.autoCapture===false)stopFps();
    void tick();return state();
  }
  const eligible=t=>t&&Number.isInteger(t.processId)&&t.processId>4&&!/^(system|idle|dwm|explorer)(\.exe)?$/i.test(t.processName);
  async function tick() {
    if(busy||stopped||(!settings.overlayEnabled&&!settings.autoCapture))return;
    busy=true;const currentRevision=revision;
    try {
      const result=await targets();
      if(stopped||revision!==currentRevision)return;
      const candidates=Array.isArray(result.candidates)?result.candidates:[];
      const running=fps();
      const games=candidates.filter(t=>eligible(t)&&t.autoEligible===true);
      let target=settings.mode==='manual'?candidates.find(t=>t.processName.toLowerCase()===settings.manualProcess.toLowerCase()):
        games.find(t=>t.processId===lastTarget?.processId) ||
        games.find(t=>t.processId===running.targetProcessId) ||
        games.find(t=>t.processId===result.detected?.processId) || games[0];
      if(!eligible(target))target=null;
      if(!target) {
        // A single detection miss is not a game exit (Alt+Tab can change foreground).
        if(++missed>=3){closeOverlay();if(settings.autoCapture)stopFps();lastTarget=null;manualPaused=false;retryAfter=0;}
        return;
      }
      if(lastTarget&&lastTarget.processId!==target.processId){manualPaused=false;retryAfter=0;}
      missed=0;lastTarget=target;
      if(settings.overlayEnabled&&!visible()) {
        authorize();await openOverlay();
        if(stopped||revision!==currentRevision){closeOverlay();return;}
        setClickThrough(settings.clickThrough);
      }
      if(settings.autoCapture&&!manualPaused&&(!running.running||running.targetProcessId!==target.processId)&&Date.now()>=retryAfter) {
        if(running.running)stopFps();
        authorize();retryAfter=Date.now()+30000;
        await startFps({...target,displayName:target.title||target.processName,mode:settings.mode});
        if(stopped||revision!==currentRevision)stopFps();
      }
      error='';
    } catch(reason){error=reason instanceof Error?reason.message:String(reason);} finally {busy=false;}
  }
  return {state,save,tick,
    start(){stopped=false;if(!timer)timer=timers.setInterval(()=>void tick(),3000);timer?.unref?.();void tick();},
    stop(){stopped=true;revision++;if(timer)timers.clearInterval(timer);timer=null;},
    pauseCapture(){manualPaused=true;stopFps();},
    resumeCapture(){manualPaused=false;retryAfter=0;},
  };
}
module.exports={createMonitorController,normalize};

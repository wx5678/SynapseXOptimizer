const fs = require('node:fs');
const path = require('node:path');

function clampBounds(bounds, area) {
  const width = Math.max(1, Math.min(Math.round(bounds.width), area.width));
  const height = Math.max(1, Math.min(Math.round(bounds.height), area.height));
  return {width, height,
    x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)))};
}
function createOverlayPositionStore({directory, screen, timers = globalThis, log = ()=>{}}) {
  const file = path.join(directory, 'overlay-position-v1.json');
  let saved = null;
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (s.version === 1 && ['x','y','areaX','areaY'].every(k=>Number.isFinite(s[k]) && Math.abs(s[k]) < 100000)
      && (typeof s.displayId === 'string' || Number.isSafeInteger(s.displayId))) saved=s;
  } catch { /* First launch/corrupt preference: use the top of the primary screen. */ }
  function resolve(dimensions) {
    const display = saved && screen.getAllDisplays().find(d=>String(d.id) === String(saved.displayId));
    const area = (display || screen.getPrimaryDisplay()).workArea;
    return clampBounds({...dimensions,
      x: display ? area.x + saved.x - saved.areaX : area.x + (area.width - Math.min(dimensions.width,area.width)) / 2,
      y: display ? area.y + saved.y - saved.areaY : area.y + 8}, area);
  }
  function attach(win) {
    let pending, last;
    function flush() {
      if (pending) timers.clearTimeout(pending);
      pending=null;
      if (!last) return;
      const next=last; last=null;
      if (JSON.stringify(next) === JSON.stringify(saved)) return;
      // Keep in-memory recovery even when a read-only/full disk prevents persistence.
      saved=next;
      try {
        fs.mkdirSync(directory,{recursive:true});
        fs.writeFileSync(file + '.pending',JSON.stringify(next));
        fs.renameSync(file + '.pending',file);
      } catch(error) { log('position-save-failed',{message:String(error).slice(0,160)}); }
    }
    function capture() {
      if (win.isDestroyed() || win.isMinimized()) return;
      try {
        const bounds=win.getBounds(), display=screen.getDisplayMatching(bounds), area=display.workArea;
        const fixed=clampBounds(bounds,area);
        last={version:1,displayId:display.id,x:fixed.x,y:fixed.y,areaX:area.x,areaY:area.y};
        if(pending)timers.clearTimeout(pending);
        pending=timers.setTimeout(flush,250);pending?.unref?.();
      } catch(error) { log('position-read-failed',{message:String(error).slice(0,160)}); }
    }
    const moved=()=>{capture();flush();};
    const close=()=>{capture();flush();};
    const closed=()=>{flush();win.removeListener('move',capture);win.removeListener('moved',moved);win.removeListener('close',close);};
    win.on('move',capture);win.on('moved',moved);win.on('close',close);win.once('closed',closed);
    return {flush};
  }
  return {resolve, attach};
}
module.exports={createOverlayPositionStore,clampBounds};

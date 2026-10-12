import {useEffect,useRef} from 'react';
import {useAppearanceContext} from '../lib/appearance';
import './window-light-effect.css';

export function WindowLightEffect() {
  const api=window.synapsexDesktop?.windowEffects;
  const appearance=useAppearanceContext(), preferences=useRef(appearance);
  preferences.current=appearance;
  const layer=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!api||!layer.current)return;
    const element=layer.current;
    element.setAttribute('popover','manual');
    let animations:Animation[]=[],generation=0,keyboard=false;
    const cancel=()=>{generation++;for(const animation of animations)animation.cancel();animations=[];element.hidePopover();};
    const key=()=>{keyboard=true;},pointer=()=>{keyboard=false;};
    document.addEventListener('keydown',key,true);document.addEventListener('pointerdown',pointer,true);
    const off=api.onPlay(({id,kind})=>{
      cancel();const current=++generation;
      const p=preferences.current;
      const finish=()=>{if(current!==generation)return;if(kind==='enter')cancel();else void api.complete(id).catch(()=>cancel());};
      // No repeated keyboard effects, and no decoration while gaming or disabled.
      if(!p.preferences.motion||p.gameRunning||keyboard){finish();return;}
      const reduced=p.reducedMotion,duration=reduced?160:kind==='enter'?280:kind==='tray'?160:220;
      element.dataset.phase=kind;element.dataset.reduced=String(reduced);
      element.showPopover();
      const easing=getComputedStyle(element).getPropertyValue('--ease-out').trim();
      const animate=(selector:string,frames:Keyframe[])=>{
        const target=element.querySelector(selector)!;
        const animation=target.animate(frames,{duration,easing,fill:'both'});animations.push(animation);return animation;
      };
      const entering=kind==='enter';
      const veil=animate('.window-light-veil',entering?[{opacity:1},{opacity:0}]:[{opacity:0},{opacity:kind==='tray'?.78:1}]);
      if(!reduced&&kind!=='tray'){
        animate('.window-light-bloom',entering?[{opacity:.1,transform:'translateX(-50%) scale(.94)'},{opacity:.6,offset:.35},{opacity:0,transform:'translateX(-50%) scale(1)'}]:[{opacity:.45,transform:'translateX(-50%) scale(1)'},{opacity:0,transform:'translateX(-50%) scale(.94)'}]);
        animate('.window-light-line',entering?[{opacity:0,transform:'translateX(-50%) scaleX(.94)'},{opacity:.85,offset:.25},{opacity:0,transform:'translateX(-50%) scaleX(1)'}]:[{opacity:.7,transform:'translateX(-50%) scaleX(1)'},{opacity:0,transform:'translateX(-50%) scaleX(.94)'}]);
        animate('.window-light-rim',entering?[{opacity:.65},{opacity:0}]:[{opacity:.3},{opacity:0}]);
      }
      void veil.finished.then(finish,()=>{});
    });
    void api.ready(true).catch(()=>{});
    return ()=>{off();cancel();document.removeEventListener('keydown',key,true);document.removeEventListener('pointerdown',pointer,true);void api.ready(false).catch(()=>{});};
  },[api]);
  return <div ref={layer} className="window-light-effect" aria-hidden="true"><div className="window-light-veil"/><div className="window-light-bloom"/><div className="window-light-line"/><div className="window-light-rim"/></div>;
}

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Moon, Palette, Sun, X } from "lucide-react";
import { useAppearanceContext } from "../lib/appearance";

export function AppearanceOptions() {
  const optionId = useId();
  const { preferences: p, skin, update, gameRunning, reducedMotion, saveError } = useAppearanceContext();
  return <>
    <div className="skin-choices" role="group" aria-label="选择皮肤">{([{ id: "dark", name: "石墨", icon: Moon }, { id: "light", name: "银白", icon: Sun }] as const).map(item => <button key={item.id} aria-pressed={skin === item.id} className={`skin-choice skin-choice-compact ${skin === item.id ? "selected" : ""}`} onClick={() => update({ skin: item.id, followSystem: false })}><item.icon size={22} aria-hidden="true" /><strong>{item.name}</strong>{skin === item.id && <Check size={15} aria-hidden="true" />}</button>)}</div>
    <div className="appearance-switches">{([{ key: "followSystem", label: "跟随系统", description: "随 Windows 浅色 / 深色模式切换" }, { key: "motion", label: "立体动效", description: "轻微卡片倾斜、跟随高光与页面过渡" }, { key: "particles", label: "粒子效果", description: "为工作台添加流动的微光粒子" }] as const).map(item => <div className="appearance-option" key={item.key}><label htmlFor={`${optionId}-${item.key}`}>{item.label}<small>{item.description}</small></label><button id={`${optionId}-${item.key}`} role="switch" aria-checked={p[item.key]} aria-label={item.label} className="appearance-switch" onClick={() => update({ [item.key]: !p[item.key] })}><span /></button></div>)}</div>
    <p className="appearance-footnote">{gameRunning ? "游戏运行中，装饰动效已自动暂停。" : reducedMotion ? "正在遵循系统的减少动态效果设置。" : "进入游戏或窗口隐藏时，自动暂停装饰动效。"}</p>
    <p className="appearance-save" role="status">{saveError || "外观自动保存，不影响游戏设置"}</p>
  </>;
}
export function AppearancePanel() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  const { effectsActive } = useAppearanceContext();
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", key); };
  }, [open]);
  return <div className="appearance-anchor" ref={root}><button className="appearance-trigger" ref={trigger} aria-expanded={open} aria-controls="appearance-popover" onClick={() => setOpen(v => !v)}><Palette size={17} />外观</button><AnimatePresence>{open && <motion.section id="appearance-popover" className="appearance-popover" aria-label="外观设置" initial={{ opacity: 0, y: effectsActive ? -6 : 0 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: effectsActive ? .18 : 0 }}><header><h2>外观设置</h2><button ref={closeButton} aria-label="关闭外观设置" onClick={() => { setOpen(false); trigger.current?.focus(); }}><X size={18} /></button></header><AppearanceOptions /></motion.section>}</AnimatePresence></div>;
}

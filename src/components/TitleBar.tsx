import { Minus, Square, X } from "lucide-react";
import { SynapseXLogo } from "./SynapseXLogo";

export function TitleBar() {
  const desktop = window.synapsexDesktop;
  return (
    <header className="prism-titlebar desktop-drag fixed inset-x-0 top-0 z-[100] flex h-12 items-center justify-between px-4">
      <div className="flex items-center gap-2.5 text-[12px] text-white/75">
        <SynapseXLogo className="h-4 w-4" />
        <span className="font-bold tracking-tight">SynapseX</span>
        <span className="text-white/25">游戏优化器</span>
      </div>
      <div className="desktop-no-drag flex h-12 items-stretch">
        <button onClick={() => desktop?.minimize()} className="grid w-12 place-items-center text-white/40 transition hover:bg-white/10 hover:text-white" aria-label="最小化"><Minus size={15} strokeWidth={1.5} /></button>
        <button onClick={() => desktop?.toggleMaximize()} className="grid w-12 place-items-center text-white/40 transition hover:bg-white/10 hover:text-white" aria-label="最大化"><Square size={12} strokeWidth={1.5} /></button>
        <button onClick={() => desktop?.close()} className="grid w-12 place-items-center text-white/40 transition hover:bg-red-500/80 hover:text-white" aria-label="关闭"><X size={16} strokeWidth={1.5} /></button>
      </div>
    </header>
  );
}

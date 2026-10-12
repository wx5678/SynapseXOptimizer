import { useEffect, useRef, type HTMLAttributes } from "react";
import { useAppearanceContext } from "../lib/appearance";

// Pointer-driven only: no idle animation loop, no per-frame React updates.
export function DepthCard({ children, className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const { effectsActive } = useAppearanceContext();
  useEffect(() => {
    const node = ref.current;
    if (!node || !effectsActive || !matchMedia("(pointer: fine)").matches) return;
    let frame = 0;
    const reset = () => { cancelAnimationFrame(frame); frame = 0; node.style.removeProperty("--tilt-x"); node.style.removeProperty("--tilt-y"); node.removeAttribute("data-pointer"); };
    const move = (e: PointerEvent) => { const x = e.clientX, y = e.clientY; if (frame) cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { frame = 0; const rect = node.getBoundingClientRect(); const px = (x - rect.left) / rect.width, py = (y - rect.top) / rect.height; node.style.setProperty("--tilt-x", `${(0.5 - py) * 3}deg`); node.style.setProperty("--tilt-y", `${(px - 0.5) * 3}deg`); node.style.setProperty("--light-x", `${px * 100}%`); node.style.setProperty("--light-y", `${py * 100}%`); node.dataset.pointer = "1"; }); };
    node.addEventListener("pointermove", move); node.addEventListener("pointerleave", reset);
    return () => { reset(); node.removeEventListener("pointermove", move); node.removeEventListener("pointerleave", reset); };
  }, [effectsActive]);
  return <div ref={ref} className={`depth-card ${className}`} {...props}>{children}</div>;
}

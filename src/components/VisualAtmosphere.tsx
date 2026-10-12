import { useEffect, useRef } from "react";

export type VisualMode = "full" | "balanced" | "eco";
export type VisualPalette = "emerald" | "blue" | "violet";

type Particle = { x: number; y: number; vx: number; vy: number; size: number; alpha: number };

export function VisualAtmosphere({ mode, palette }: { mode: VisualMode; palette: VisualPalette }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const count = reducedMotion ? 24 : mode === "full" ? 104 : mode === "balanced" ? 68 : 26;
    const particles: Particle[] = Array.from({ length: count }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: reducedMotion ? 0 : (Math.random() - 0.5) * (mode === "eco" ? 0.000045 : 0.00016),
      vy: reducedMotion ? 0 : (Math.random() - 0.5) * (mode === "eco" ? 0.00004 : 0.00013),
      size: 1.05 + Math.random() * (mode === "eco" ? 1.35 : 2.45),
      alpha: 0.38 + Math.random() * (mode === "eco" ? 0.3 : 0.46),
    }));
    let width = 0;
    let height = 0;
    let frame = 0;
    let previousFrame = 0;
    let visible = !document.hidden;
    let accent = "46, 230, 166";
    let secondary = "56, 189, 248";
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const style = getComputedStyle(document.documentElement);
      accent = style.getPropertyValue("--prism-accent").trim() || accent;
      secondary = style.getPropertyValue("--prism-secondary").trim() || secondary;
    };
    const draw = (timestamp = 0) => {
      if (!visible) return;
      const interval = mode === "eco" ? 50 : mode === "balanced" ? 24 : 16;
      if (!reducedMotion && timestamp && timestamp - previousFrame < interval) { frame = window.requestAnimationFrame(draw); return; }
      previousFrame = timestamp;
      context.clearRect(0, 0, width, height);
      particles.forEach((particle, index) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        if (particle.x < -0.03) particle.x = 1.03;
        if (particle.x > 1.03) particle.x = -0.03;
        if (particle.y < -0.03) particle.y = 1.03;
        if (particle.y > 1.03) particle.y = -0.03;
        const x = particle.x * width;
        const y = particle.y * height;
        context.beginPath();
        context.arc(x, y, particle.size, 0, Math.PI * 2);
        context.shadowBlur = mode === "eco" ? 2 : 10;
        context.shadowColor = `rgba(${accent}, ${particle.alpha * 0.75})`;
        context.fillStyle = `rgba(${accent}, ${particle.alpha})`;
        context.fill();
        context.shadowBlur = 0;
        if (mode !== "eco" && index % 13 === 0) {
          context.beginPath();
          context.arc(x, y, particle.size + 4.5, 0, Math.PI * 2);
          context.strokeStyle = `rgba(${secondary}, ${particle.alpha * 0.22})`;
          context.lineWidth = 0.8;
          context.stroke();
        }
        if (mode === "eco") return;
        for (let otherIndex = index + 1; otherIndex < particles.length; otherIndex++) {
          const other = particles[otherIndex];
          const dx = x - other.x * width;
          const dy = y - other.y * height;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const range = mode === "full" ? 170 : 125;
          if (distance > range) continue;
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(other.x * width, other.y * height);
          context.strokeStyle = `rgba(${secondary}, ${(1 - distance / range) * (mode === "full" ? 0.19 : 0.11)})`;
          context.lineWidth = mode === "full" ? 0.8 : 0.55;
          context.stroke();
        }
      });
      if (reducedMotion || mode === "eco") return;
      frame = window.requestAnimationFrame(draw);
    };
    const visibility = () => {
      visible = !document.hidden;
      if (visible) draw(performance.now());
      else window.cancelAnimationFrame(frame);
    };
    // Read palette tokens after App's effect has updated the root attributes.
    frame = window.requestAnimationFrame(() => { resize(); draw(performance.now()); });
    const redraw = () => { window.cancelAnimationFrame(frame); resize(); draw(); };
    window.addEventListener("resize", redraw);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", redraw);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [mode, palette]);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="prism-ambient absolute inset-0" />
      <canvas ref={canvasRef} className="absolute inset-0 opacity-100" />
      <div className="prism-noise absolute inset-0" />
    </div>
  );
}

export function FluidMetricCard({
  eyebrow,
  value,
  unit,
  detail,
  accent = "emerald",
}: {
  eyebrow: string;
  value: string | number;
  unit?: string;
  detail: string;
  accent?: VisualPalette;
}) {
  return (
    <div className={`fluid-metric-card fluid-${accent}`}>
      <div className="fluid-metric-content">
        <p className="text-[12px] font-medium tracking-wide text-slate-300">{eyebrow}</p>
        <div className="mt-4 flex items-end gap-1.5"><strong className="text-[36px] font-semibold leading-none tracking-[-0.055em] text-white">{value}</strong>{unit && <span className="pb-1 text-[12px] text-white/55">{unit}</span>}</div>
        <p className="mt-3 text-[12px] leading-5 text-slate-400">{detail}</p>
      </div>
    </div>
  );
}

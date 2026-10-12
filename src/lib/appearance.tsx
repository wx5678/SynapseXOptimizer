import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";

export type Appearance = { skin: "light" | "dark"; followSystem: boolean; motion: boolean; particles: boolean };
const key = "synapsex.appearance.v1";
const defaults: Appearance = { skin: "dark", followSystem: false, motion: true, particles: false };
function read(): Appearance {
  try { const p = JSON.parse(localStorage.getItem(key) || "null"); return { skin: p?.skin === "light" ? "light" : "dark", followSystem: p?.followSystem === true, motion: typeof p?.motion === "boolean" ? p.motion : defaults.motion, particles: p?.particles === true }; } catch { return defaults; }
}
function useMedia(query: string) {
  const [matches, set] = useState(() => matchMedia(query).matches);
  useEffect(() => { const media = matchMedia(query); const update = () => set(media.matches); media.addEventListener("change", update); update(); return () => media.removeEventListener("change", update); }, [query]);
  return matches;
}
export function useAppearance(gameRunning: boolean, enabled = true) {
  const [preferences, setPreferences] = useState<Appearance>(read);
  const systemDark = useMedia("(prefers-color-scheme: dark)");
  const reducedMotion = useMedia("(prefers-reduced-motion: reduce)");
  const [hidden, setHidden] = useState(document.hidden);
  useEffect(() => { const update = () => setHidden(document.hidden); document.addEventListener("visibilitychange", update); return () => document.removeEventListener("visibilitychange", update); }, []);
  const skin = preferences.followSystem ? systemDark ? "dark" : "light" : preferences.skin;
  const effectsActive = preferences.motion && !gameRunning && !reducedMotion && !hidden;
  useLayoutEffect(() => {
    if (!enabled) return;
    document.documentElement.dataset.skin = skin;
    document.documentElement.dataset.motion = effectsActive ? "on" : "off";
    document.documentElement.dataset.visualMode = effectsActive ? "balanced" : "eco";
    document.documentElement.dataset.palette = "blue";
  }, [skin, effectsActive, enabled]);
  const [saveError, setSaveError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    try { localStorage.setItem(key, JSON.stringify(preferences)); setSaveError(""); } catch { setSaveError("无法保存外观设置，本次切换仍然有效。"); }
    void window.synapsexDesktop?.saveAppearance?.(preferences).catch(() => { if (active) setSaveError("外观文件保存失败，重启后可能不会保留。"); });
    return () => { active = false; };
  }, [preferences, enabled]);
  const update = (patch: Partial<Appearance>) => setPreferences(p => ({ ...p, ...patch }));
  return { preferences, skin, effectsActive, reducedMotion, gameRunning, update, saveError };
}
export type AppearanceState = ReturnType<typeof useAppearance>;
export const AppearanceContext = createContext<AppearanceState | null>(null);
export function useAppearanceContext() { const value = useContext(AppearanceContext); if (!value) throw new Error("Appearance provider missing"); return value; }

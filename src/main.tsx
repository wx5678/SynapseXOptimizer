import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./workspace.css";
import "./skins.css";
import "./optimization-layout.css";
import "./graphite.css";
import "./home.css";
import "./readability.css";
import "./detail-polish.css";
import "./membership.css";
import "./interface-refinement.css";

async function mount() {
  if(window.synapsexDesktop?.monitorControls && new URLSearchParams(location.search).get('overlay')!=='1') {
    try {const controls=await window.synapsexDesktop.monitorControls();localStorage.setItem('synapsex.monitor.mode',controls.mode);localStorage.setItem('synapsex.monitor.manualProcess',controls.manualProcess);}catch{}
  }
  if (window.synapsexDesktop?.readGamePaths && new URLSearchParams(location.search).get("overlay") !== "1") {
    try {
      const paths = await window.synapsexDesktop.readGamePaths();
      if (paths.gameRoot) localStorage.setItem("synapsex-game-root", paths.gameRoot);
      if (paths.gpuExecutable) localStorage.setItem("synapsex.gpu.gameExecutable", paths.gpuExecutable);
    } catch { /* Native store unavailable; retain this session's paths. */ }
  }
  if (window.synapsexDesktop?.readAppearance && new URLSearchParams(location.search).get("overlay") !== "1") {
    try { const appearance = await window.synapsexDesktop.readAppearance(); localStorage.setItem("synapsex.appearance.v1", JSON.stringify(appearance)); } catch { /* Keep the last local appearance if the native store is unavailable. */ }
  }
  ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
}
void mount();

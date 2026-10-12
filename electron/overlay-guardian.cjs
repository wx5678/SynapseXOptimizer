// Window recovery only; never reads or injects into a game process.
function attachOverlayGuardian(win, { screen, powerMonitor, wanted, log = () => {}, timers = globalThis }) {
  let stopped = false, locked = false, suspended = false, recovering = false, pending = null, lastCrash = 0, crashes = 0;
  const listeners = [];
  const on = (target, event, handler) => { if (target?.on) { target.on(event, handler); listeners.push([target, event, handler]); } };
  const active = () => !stopped && !locked && !suspended && wanted() && !win.isDestroyed();
  const attempt = (step, run) => {
    try { run(); } catch (error) { log('recovery-error', {step, message: String(error).slice(0, 160)}); }
  };
  function recover(reason = 'check') {
    if (!active() || recovering) return;
    recovering = true;
    try {
      // A transient monitor-query failure must not prevent showing the HUD.
      attempt('bounds', () => {
      const bounds = win.getBounds();
      const area = screen.getDisplayMatching(bounds).workArea;
      const next = {width: Math.min(bounds.width, area.width), height: Math.min(bounds.height, area.height)};
      next.x = Math.max(area.x, Math.min(bounds.x, area.x + area.width - next.width));
      next.y = Math.max(area.y, Math.min(bounds.y, area.y + area.height - next.height));
      if (Object.keys(next).some(key => next[key] !== bounds[key])) { win.setBounds(next, false); log('reposition', next); }
      });
      attempt('restore', () => { if (win.isMinimized()) { win.restore(); log('restore'); } });
      attempt('topmost', () => {
        const lost = !win.isAlwaysOnTop();
        // Windows can retain the flag while another topmost game covers us.
        // Reassert without a false/true toggle (which causes visible flashing).
        win.setAlwaysOnTop(true, 'screen-saver');
        if (lost) log('topmost-restored');
      });
      attempt('show', () => { if (!win.isVisible()) { win.showInactive(); log('shown', {reason}); } });
      // Changes z-order only, unlike focus()/show(); no keyboard focus theft.
      attempt('z-order', () => win.moveTop());
      // A transparent surface can remain blank after a display/fullscreen
      // transition even when isVisible() remains true. Repaint, don't reload
      // its React tree or restart FPS collection.
      attempt('paint', () => win.webContents.invalidate());
    } finally { recovering = false; }
  }
  function schedule(reason) {
    if (!active() || recovering || pending) return;
    pending = timers.setTimeout(() => { pending = null; recover(reason); }, 200);
  }
  for (const event of ['hide', 'minimize', 'blur', 'always-on-top-changed']) on(win, event, () => { log(event); schedule(event); });
  for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) on(screen, event, () => schedule(event));
  on(powerMonitor, 'lock-screen', () => { locked = true; log('lock-screen'); });
  on(powerMonitor, 'suspend', () => { suspended = true; log('suspend'); });
  on(powerMonitor, 'unlock-screen', () => { locked = false; schedule('unlock-screen'); });
  on(powerMonitor, 'resume', () => { suspended = false; schedule('resume'); });
  on(win.webContents, 'render-process-gone', (_event, details) => {
    log('renderer-gone', {reason: details.reason, exitCode: details.exitCode});
    if (!active()) return;
    const now = Date.now(); if (now - lastCrash > 60000) crashes = 0;
    lastCrash = now;
    if (++crashes <= 2) attempt('renderer-reload', () => win.webContents.reload());
    else log('renderer-retry-limit');
  });
  on(win.webContents, 'did-finish-load', () => schedule('loaded'));
  // A non-focusable HUD need not receive blur when the user Alt+Tabs. The
  // lightweight fallback therefore runs even without an Electron hide event.
  const interval = timers.setInterval(() => recover(), 1000);
  interval?.unref?.();
  function stop() {
    stopped = true; timers.clearInterval(interval); if (pending) timers.clearTimeout(pending);
    for (const [target, event, handler] of listeners) target.removeListener(event, handler);
  }
  on(win, 'closed', stop);
  return {recover, stop};
}
module.exports = {attachOverlayGuardian};

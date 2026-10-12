const { randomUUID } = require("crypto");

function parseCsvLine(line) {
  const result = []; let value = ""; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { result.push(value); value = ""; }
    else value += c;
  }
  result.push(value); return result;
}

// Read stdout incrementally; never reread an ever-growing CSV on Electron's UI thread.
function createFpsCollector({ spawn, executable, exists, now = Date.now }) {
  let current = null;
  const cleanups = new Set();
  function state() {
    const s = current;
    const base = { available: exists(executable), running: Boolean(s?.running), source: "PresentMon 2.4.1（ETW，精简帧采集）",
      targetProcessName: s?.target.processName || "", targetProcessId: s?.target.processId || 0,
      targetDisplayName: s?.target.displayName || "", targetMode: s?.target.mode || "",
      fps: null, frameTimeMs: null, onePercentLow: null, sampleCount: 0,
      status: s?.status || "stopped", error: s?.error || "" };
    if (!s?.running) return base;
    const rows = s.rows.filter(r => now() - r.at <= 3000);
    if (rows.length < 2) return { ...base, status: now() - s.startedAt >= 10000 ? "no-frame-data" : "waiting-target",
      error: now() - s.startedAt >= 10000 ? "已启动采集，但未收到目标进程的帧事件。请确认游戏正在显示画面；若持续无数据，请完全退出本软件后以管理员身份运行，再重试采集。" : s.error };
    // Pick the busiest recent swap chain; do not mix independent render surfaces.
    const groups = new Map();
    for (const row of rows) { const group = groups.get(row.swap) || []; group.push(row.value); groups.set(row.swap, group); }
    const frames = [...groups.values()].sort((a, b) => b.length - a.length)[0];
    const intervals = []; let covered = 0;
    for (let i = frames.length - 1; i >= 0 && intervals.length < 360; i--) {
      intervals.push(frames[i]); covered += frames[i];
      if (covered >= 1200 && intervals.length >= 12) break;
    }
    if (intervals.length < 2) return { ...base, status: "waiting-target" };
    const average = covered / intervals.length;
    const sorted = [...intervals].sort((a, b) => a - b);
    return { ...base, status: "capturing", error: "", fps: +(1000 / average).toFixed(1), frameTimeMs: +average.toFixed(2),
      onePercentLow: +(1000 / sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .99))]).toFixed(1), sampleCount: intervals.length };
  }
  function stop() {
    const s = current; current = null;
    if (s) {
      s.running = false;
      // Clean only this collector's unique session. Delayed cleanup cannot kill its replacement.
      if (s.child && exists(executable)) {
        let resolveCleanup;
        const done = new Promise(resolve => { resolveCleanup = resolve; });
        cleanups.add(done);
        let finished = false;
        const finish = () => {
          if (finished) return; finished = true; clearTimeout(timeout);
          if (!s.child.killed && s.child.exitCode == null) s.child.kill();
          cleanups.delete(done); resolveCleanup();
        };
        const timeout = setTimeout(finish, 4000);
        try {
          // Stop ETW first, then end the process; killing first can leave the logger orphaned.
          const cleanup = spawn(executable, ["--terminate_existing_session", "--session_name", s.session], { windowsHide: true, stdio: "ignore" });
          cleanup.once("error", finish); cleanup.once("close", finish);
        } catch { finish(); }
      }
    }
    return state();
  }
  function start(target = {}) {
    const name = String(target.processName || "").trim();
    const pid = Number(target.processId);
    if (!/^[^\\/:*?"<>|]{1,128}\.exe$/i.test(name) || !Number.isInteger(pid) || pid <= 0 || pid > 4294967295)
      return { ...state(), status: "target-missing", error: "请选择正在运行的游戏进程，重新扫描后再开始采集。" };
    if (current?.target.processId === pid && current.target.processName.toLowerCase() === name.toLowerCase() && (current.running || !target.retry)) return state();
    stop();
    const s = { target: { processName: name, processId: pid, displayName: String(target.displayName || name), mode: target.mode === "manual" ? "manual" : "auto" },
      session: `SynapseX-${randomUUID()}`, startedAt: now(), rows: [], pending: "", headers: null, running: false, status: "waiting-target", error: "", child: null };
    current = s;
    if (!exists(executable)) { s.status = "collector-missing"; s.error = "PresentMon 采集器缺失"; return state(); }
    const fail = message => { if (current !== s) return; s.running = false; s.status = /access|privilege|denied|权限|拒绝|0x80070005/i.test(message) ? "permission-denied" : "collector-error"; s.error = message; };
    try {
      s.child = spawn(executable, ["--process_id", String(pid), "--output_stdout", "--no_console_stats", "--v1_metrics", "--no_track_display", "--no_track_input", "--no_track_gpu", "--session_name", s.session, "--terminate_on_proc_exit"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      s.running = true;
      s.child.stdout.setEncoding("utf8"); s.child.stderr.setEncoding("utf8");
      s.child.stdout.on("data", chunk => {
        if (current !== s) return;
        s.pending += chunk;
        const lines = s.pending.split(/\r?\n/); s.pending = lines.pop();
        if (s.pending.length > 65536) { s.pending = ""; s.error = "采集输出包含异常长行"; }
        for (const line of lines) {
          const row = parseCsvLine(line.replace(/^\uFEFF/, ""));
          if (row.includes("msBetweenPresents") && row.includes("ProcessID")) { s.headers = row; continue; }
          if (!s.headers) { if (line.trim()) s.error = (s.error + "\n" + line).slice(-2000); continue; }
          if (Number(row[s.headers.indexOf("ProcessID")]) !== pid) continue;
          const value = Number(row[s.headers.indexOf("msBetweenPresents")]);
          if (!Number.isFinite(value) || value <= 0 || value > 60000) continue;
          // Dropped presents still contribute to application FPS; this is not displayed FPS.
          s.rows.push({ value, swap: row[s.headers.indexOf("SwapChainAddress")] || "default", at: now() });
        }
        if (s.rows.length > 4096) s.rows = s.rows.slice(-4096);
      });
      s.child.stderr.on("data", chunk => { if (current === s) s.error = (s.error + chunk).slice(-2000); });
      s.child.on("error", e => fail(`采集器启动失败：${e.message}`));
      s.child.once("close", (code, signal) => {
        if (current !== s) return;
        fail(s.error || `采集器已退出（退出码 ${code ?? "无"}${signal ? `，${signal}` : ""}），请检查游戏是否仍在运行后重试。`);
      });
    } catch (error) { fail(error.message); }
    return state();
  }
  return { start, stop, state, shutdown: async () => { stop(); await Promise.all([...cleanups]); } };
}
module.exports = { createFpsCollector, parseCsvLine };

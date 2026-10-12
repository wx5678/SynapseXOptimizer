const path = require('node:path');
const fs = require('node:fs');

const STARTUP_ARG = '--synapsex-startup';
const STARTUP_NAME = 'SynapseX';

// The portable launcher extracts Electron into a temporary folder. Register the
// original launcher, never the extracted process.execPath.
function createStartupSettings({ app, platform = process.platform, env = process.env, execPath = process.execPath, exists = fs.existsSync }) {
  const executable = env.PORTABLE_EXECUTABLE_FILE || execPath;
  const supported = platform === 'win32' && app.isPackaged && path.win32.isAbsolute(executable) && exists(executable);
  const options = { path: executable, args: [STARTUP_ARG] };
  function read() {
    if (!supported) return { supported: false, enabled: false, registered: false, blocked: false, executable: '', reason: '请在 Windows 桌面正式版中设置开机启动。' };
    const state = app.getLoginItemSettings(options);
    const entry = state.launchItems?.find(item => item.name === STARTUP_NAME && item.scope === 'user');
    const registered = !!entry || !!state.openAtLogin;
    const enabled = !!state.openAtLogin && (entry ? entry.enabled : state.executableWillLaunchAtLogin === true);
    return { supported: true, enabled, registered, blocked: registered && !enabled, executable,
      reason: registered && !enabled ? '此启动项未生效。点击开启可重新登记；也可检查 Windows 的启动应用设置。' : '' };
  }
  function save(value) {
    if (!supported) throw new Error('请使用 Windows 桌面正式版设置开机启动。');
    if (!value || typeof value.enabled !== 'boolean') throw new Error('启动设置无效。');
    app.setLoginItemSettings({ ...options, name: STARTUP_NAME, openAtLogin: value.enabled, enabled: value.enabled });
    const next = read();
    if (next.enabled !== value.enabled || (!value.enabled && next.registered)) throw new Error('启动项写入后未通过核验，请检查 Windows 启动应用设置。');
    return next;
  }
  return { read, save };
}

// This path deliberately has no dependency on the elevated host or PresentMon.
function createStartupBackground({ Tray, Menu, icon, signin, openWorkspace, checkUpdates, quit, isOnline,
  setTimer = setTimeout, clearTimer = clearTimeout }) {
  let tray = null, stopped = false, timer = null, releaseWait = null;
  let status = '后台启动中';
  const update = () => {
    if (!tray || stopped) return;
    tray.setToolTip(`SynapseX · ${status}`);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: status, enabled: false }, { type: 'separator' },
      { label: '打开工作台', click: openWorkspace },
      ...(checkUpdates ? [{label:'检查更新',click:checkUpdates}] : []),
      { label: '退出 SynapseX', click: quit },
    ]));
  };
  async function start() {
    if (tray || stopped) return;
    tray = new Tray(icon);
    tray.on('double-click', openWorkspace);
    update();
    try {
      const initial = signin.accounts();
      if (!initial.autoSign) { status = '自动签到未开启'; update(); return; }
      if (!initial.accounts.some(a => a.enabled)) { status = '未选择自动签到账号'; update(); return; }
      status = '等待网络连接'; update();
      for (let attempt = 0; !isOnline() && attempt < 30 && !stopped; attempt++) {
        await new Promise(resolve => { releaseWait = resolve; timer = setTimer(resolve, 3000); });
        timer = null; releaseWait = null;
      }
      if (stopped) return;
      // Still attempt once after the bounded wait: isOnline is only advisory.
      status = '正在自动签到'; update();
      await signin.startup();
      if (stopped) return;
      const result = signin.accounts();
      const selected = result.accounts.filter(a => a.enabled);
      const signed = selected.filter(a => a.status === 'signed').length;
      status = result.storageError ? '签到记录异常，请打开工作台' : signed === selected.length
        ? `本次签到已确认 ${signed} / ${selected.length}`
        : `本次已签到 ${signed} / ${selected.length}，请打开工作台查看`;
    } catch { status = '自动签到未完成，请打开工作台查看'; }
    update();
  }
  function stop() {
    stopped = true;
    if (timer !== null) clearTimer(timer);
    releaseWait?.(); releaseWait = null;
    tray?.destroy(); tray = null;
  }
  return { start, stop };
}

module.exports = { STARTUP_ARG, STARTUP_NAME, createStartupSettings, createStartupBackground };

const fs = require('node:fs');
const path = require('node:path');
const ACTIONS = ['ask', 'tray', 'quit'];

function createWindowBehavior({directory, dialog, Tray, Menu, icon, openWorkspace, checkUpdates, quit, isQuitting, hasBackgroundTray = () => false, confirmClose = (window,options)=>dialog.showMessageBox(window,options), beforeHide = async()=>true}) {
  const file = path.join(directory, 'window-behavior.json');
  let action = 'ask', pending = false, tray = null;
  try { const saved = JSON.parse(fs.readFileSync(file, 'utf8')); if (ACTIONS.includes(saved.closeAction)) action = saved.closeAction; } catch { /* Ask by default, including corrupt settings. */ }
  const read = () => ({closeAction:action});
  function save(value) {
    if (!value || !ACTIONS.includes(value.closeAction)) throw Error('关闭窗口设置无效。');
    fs.mkdirSync(directory, {recursive:true});
    fs.writeFileSync(file + '.tmp', JSON.stringify({closeAction:value.closeAction}), {mode:0o600});
    fs.renameSync(file + '.tmp', file);
    action = value.closeAction;
    return read();
  }
  function ensureTray() {
    if (tray || hasBackgroundTray()) return;
    const next = new Tray(icon);
    try {
      next.setToolTip('SynapseX · 后台运行中');
      next.setContextMenu(Menu.buildFromTemplate([
        {label:'打开工作台', click:openWorkspace},
        {label:'检查更新', click:checkUpdates},
        {type:'separator'},
        {label:'退出 SynapseX', click:quit},
      ]));
      next.on('double-click', openWorkspace);
      tray = next;
    } catch (error) { next.destroy(); throw error; }
  }
  async function requestClose(window) {
    if (pending || isQuitting() || window.isDestroyed()) return;
    pending = true;
    try {
      let selected = action, remember = false;
      if (selected === 'ask') {
        const result = await confirmClose(window, {
          type:'question', title:'关闭 SynapseX', message:'关闭窗口后，要让软件继续在后台运行吗？',
          detail:'最小化到托盘：隐藏主窗口，监控、悬浮窗及已开启的后台功能继续运行。双击任务栏右下角的托盘图标可重新打开。退出软件：停止后台任务并关闭悬浮窗。',
          buttons:['最小化到托盘','退出软件','取消'], defaultId:0, cancelId:2, noLink:true,
          checkboxLabel:'记住我的选择（可在软件设置中修改）', checkboxChecked:false,
        });
        if (![0,1].includes(result.response)) return;
        selected = result.response === 0 ? 'tray' : 'quit';
        remember = result.checkboxChecked === true;
      }
      if (isQuitting() || window.isDestroyed()) return;
      if (selected === 'tray') ensureTray(); // Never hide without a working way back.
      if (remember) save({closeAction:selected});
      if (selected === 'quit') quit();
      else if(await beforeHide(window) !== false && !isQuitting() && !window.isDestroyed()) window.hide();
    } catch (error) { dialog.showErrorBox('无法关闭窗口', error.message || String(error)); }
    finally { pending = false; }
  }
  return {read, save, requestClose, stop(){tray?.destroy();tray=null;}};
}
module.exports = {createWindowBehavior};

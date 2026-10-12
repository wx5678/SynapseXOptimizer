const { app, BrowserWindow, dialog, ipcMain, session, safeStorage, Tray, Menu, shell, Notification, screen, powerMonitor, net: electronNet } = require("electron");
const { attachOverlayGuardian } = require('./overlay-guardian.cjs');
const { createOverlayPositionStore, clampBounds } = require('./overlay-position.cjs');
const { createMonitorController } = require('./monitor-controller.cjs');
const { randomUUID } = require("crypto");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");
const { createAppearanceStore } = require("./appearance.cjs");
const { createFpsCollector } = require("./fps-collector.cjs");
const { createGamePathStore } = require("./game-paths.cjs");
const { createCommunityAccounts } = require("./community-accounts.cjs");
const { STARTUP_ARG, createStartupSettings, createStartupBackground } = require("./startup.cjs");
const { createLicensing } = require("./licensing.cjs");
const { createSoftwareAccount } = require("./software-account.cjs");
const { createVipPolicy, routeFeature } = require('./vip-policy.cjs');
const { prepareQuickApply } = require('./quick-apply.cjs');
const { createProductClient } = require('./product-client.cjs');
const { createJiuYinFpsUnlock } = require('./jiuyin-fps-unlock.cjs');
const { createAdminAccess } = require('./admin-access.cjs');
const { createFpsExpiry } = require('./fps-expiry.cjs');
const { createWindowBehavior } = require('./window-behavior.cjs');
const { createClosePrompt } = require('./close-prompt.cjs');
const { createSensorPrompt } = require('./sensor-prompt.cjs');
let sensorPrompt = null;
const { createWindowEffects } = require('./window-effects.cjs');
let windowEffects = null;
let closePrompt = null;
let windowBehavior = null;
let fpsExpiry = null;
let product = null;
let vipPolicy = null;
const vipToken = randomUUID().replaceAll('-', '');
let softwareAccount = null;
let licensing = null;
let communitySignin = null;
let startupBackground = null;
let openingWorkspace = null;
let readyForWindows = false;
let openRequested = false;

let mainWindow = null;
let overlayWindow = null;
let overlayGuardian = null;
let overlayPositions = null;
let overlayCloseRequested = false;
let monitorController = null;
let sensorInstaller = null;
let hostProcess = null;
let shuttingDown = false;
let shutdownComplete = false;
let hostEndpoint = null;
let overlayConfiguration = { layout: "horizontal", scale: "medium" };

function normalizeOverlayConfiguration(options = {}) {
  const layout = options.layout === "grid" ? "grid" : "horizontal";
  const scale = ["small", "medium", "large"].includes(options.scale) ? options.scale : "medium";
  const metricCount = Math.max(1, Math.min(18, Math.floor(Number(options.metricCount) || 6)));
  return { layout, scale, metricCount };
}

function overlayDimensions(configuration) {
  const count = configuration.metricCount || 6;
  const area = screen.getPrimaryDisplay().workArea;
  if (configuration.layout === "grid") {
    const width = configuration.scale === 'small' ? 340 : configuration.scale === 'large' ? 460 : 390;
    const row = configuration.scale === 'large' ? 56 : 44;
    return {width: Math.min(width, area.width), height: Math.min(area.height, 120 + Math.ceil(count / 2) * row)};
  }
  const width = Math.min(area.width, configuration.scale === 'small' ? 760 : configuration.scale === 'large' ? 1120 : 940);
  const columns = Math.max(1, Math.floor((width - 80) / 140));
  const row = configuration.scale === 'large' ? 66 : configuration.scale === 'small' ? 42 : 52;
  return {width, height: Math.min(area.height, Math.ceil(count / columns) * row)};
}

function applyOverlayConfiguration(options = {}) {
  overlayConfiguration = normalizeOverlayConfiguration(options);
  const dimensions = overlayDimensions(overlayConfiguration);
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setMinimumSize(300, 36);
    const bounds = overlayWindow.getBounds();
    overlayWindow.setBounds(clampBounds({...bounds,...dimensions},screen.getDisplayMatching(bounds).workArea), false);
  }
  return { ...overlayConfiguration, ...dimensions };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function waitForHost(port, token, timeoutMs = 30000) {
  return require('./host-ready.cjs').waitForHost(port, token, timeoutMs);
}

function resourcePath(relativePath) {
  const root = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, "..");
  return path.join(root, relativePath);
}

function getPresentMonPath() {
  return resourcePath(path.join("tools", "presentmon", "PresentMon-2.4.1-x64.exe"));
}

let fpsCollector = null;
function getFpsCollector() {
  if (!fpsCollector) fpsCollector = createFpsCollector({ spawn, executable: getPresentMonPath(), exists: fs.existsSync });
  return fpsCollector;
}
function stopFpsCollector() { return getFpsCollector().stop(); }
function startFpsCollector(target = {}) { return getFpsCollector().start(target); }
function getFpsState() { return getFpsCollector().state(); }

async function startLocalHost() {
  const port = await getFreePort();
  const token = randomUUID().replaceAll("-", "");
  const script = resourcePath(path.join("host", "SynapseXHost.ps1"));
  const launcher = resourcePath(path.join("host", "StartElevatedHost.ps1"));
  const args = ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", launcher, "-ScriptPath", script, "-Port", String(port), "-SessionToken", token, "-VipToken", vipToken, "-OwnerProcessId", String(process.pid)];
  hostProcess = spawn("powershell.exe", args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let hostError = "";
  hostProcess.stdout.on("data", () => {});
  hostProcess.stderr.on("data", (chunk) => { hostError = (hostError + chunk.toString()).slice(-8192); });
  hostProcess.once("error", () => { hostError = '无法启动本地服务，请检查 PowerShell 是否可用。'; });
  hostProcess.once("exit", (code) => {
    if (!shuttingDown && code !== null && code !== 0 && mainWindow) dialog.showErrorBox("SynapseX 本地服务异常", hostError.trim() || `服务退出代码：${code}`);
  });
  await waitForHost(port, token);
  return { port, token };
}

function requestHostShutdown() {
  return new Promise((resolve) => {
    if (!hostEndpoint) return resolve();
    const request = http.request({ hostname: "127.0.0.1", port: hostEndpoint.port, path: "/api/shutdown", method: "POST", headers: { "X-SynapseX-Token": hostEndpoint.token }, timeout: 10000 }, (response) => { response.resume(); response.once("end", resolve); });
    request.on("timeout", () => { request.destroy(); resolve(); });
    request.on("error", resolve);
    request.end();
  });
}

function registerWindowControls() {
  ipcMain.on("window:minimize", (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
  ipcMain.on("window:toggle-maximize", (event) => { const window = BrowserWindow.fromWebContents(event.sender); if (!window) return; window.isMaximized() ? window.unmaximize() : window.maximize(); });
  ipcMain.on("window:close", (event) => BrowserWindow.fromWebContents(event.sender)?.close());
  ipcMain.handle("dialog:select-game-executable", async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
    const result = await dialog.showOpenDialog(owner, {
      title: "选择游戏主程序",
      buttonLabel: "选择这个游戏",
      properties: ["openFile"],
      filters: [
        { name: "游戏程序", extensions: ["exe"] },
        { name: "所有文件", extensions: ["*"] },
      ],
    });
    return result.canceled ? "" : (result.filePaths[0] || "");
  });
  ipcMain.handle("dialog:select-game-directory", async (event) => {
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender) ?? mainWindow, {
      title: "选择九阴真经安装目录", buttonLabel: "选择目录", properties: ["openDirectory"],
    });
    return result.canceled ? "" : (result.filePaths[0] || "");
  });
  ipcMain.handle('dialog:select-nvidia-nip', async event => {
    if(!mainWindow || event.sender!==mainWindow.webContents || event.senderFrame!==mainWindow.webContents.mainFrame) throw Error('不支持的文件选择来源');
    const result=await dialog.showOpenDialog(mainWindow,{title:'选择 NVIDIA Profile Inspector 配置',properties:['openFile'],filters:[{name:'NVIDIA 配置',extensions:['nip']}]});
    return result.canceled?'':(result.filePaths[0]||'');
  });
  ipcMain.handle("monitor:start-fps", (_event, target) => {product?.requireAccess();monitorController?.resumeCapture();return startFpsCollector(target);});
  ipcMain.handle("monitor:stop-fps", () => { if(monitorController)monitorController.pauseCapture();else stopFpsCollector(); return getFpsState(); });
  ipcMain.handle("monitor:fps-state", () => getFpsState());
  ipcMain.handle("monitor:open-overlay", async () => { await createOverlayWindow(); return true; });
  ipcMain.handle("monitor:close-overlay", () => { monitorController?.save({overlayEnabled:false}); overlayCloseRequested = true; overlayWindow?.close(); return true; });
  ipcMain.handle("monitor:configure-overlay", (_event, options) => applyOverlayConfiguration(options));
  ipcMain.handle("monitor:overlay-click-through", (_event, enabled) => { monitorController?.save({clickThrough:Boolean(enabled)}); return Boolean(enabled); });
  const requireMonitorMain = event => {if(!mainWindow||event.sender!==mainWindow.webContents||event.senderFrame!==mainWindow.webContents.mainFrame)throw Error('不支持的监控设置来源');};
  ipcMain.handle('monitor:controls', event=>{requireMonitorMain(event);return monitorController?.state();});
  ipcMain.handle('monitor:sensor-help', event=>{requireMonitorMain(event);return shell.openExternal('https://github.com/namazso/PawnIO.Setup/releases');});
  ipcMain.handle('monitor:sensor-install', event=>{
    requireMonitorMain(event);
    sensorInstaller ??= require('./sensor-installer.cjs').createSensorInstaller({
      directory: app.getPath('temp'), scriptPath: resourcePath('host/InstallSensorDriver.ps1'),
      download: file=>require('./sensor-installer.cjs').downloadInstaller(file,(url,options)=>electronNet.fetch(url,{...options,redirect:'follow'})),
      confirm: ()=>sensorPrompt.ask(mainWindow),
    });
    return sensorInstaller.install();
  });
  ipcMain.handle('monitor:save-controls', (event,patch)=>{requireMonitorMain(event);if(patch?.overlayEnabled||patch?.autoCapture)product?.requireAccess();return monitorController.save(patch);});
}

async function createOverlayWindow() {
  if (shuttingDown) return;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayCloseRequested = false;
    overlayWindow.setIgnoreMouseEvents(monitorController?.state().clickThrough===true, {forward:true});
    overlayGuardian?.recover('manual-open');
    return;
  }
  if (!hostEndpoint) throw new Error("本地监控服务尚未就绪");
  const dimensions = overlayDimensions(overlayConfiguration);
  overlayPositions ??= createOverlayPositionStore({directory:app.getPath('userData'),screen});
  const placement = overlayPositions.resolve(dimensions);
  overlayWindow = new BrowserWindow({
    ...placement,
    minWidth: 300,
    minHeight: 36,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    focusable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    title: "SynapseX 实时监控",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setIgnoreMouseEvents(monitorController?.state().clickThrough===true, {forward:true});
  const logOverlay = (event, details = {}) => {
    try {
      const file = path.join(app.getPath('userData'), 'overlay-events.jsonl');
      if (fs.existsSync(file) && fs.statSync(file).size > 262144) { fs.copyFileSync(file, file + '.previous'); fs.writeFileSync(file, ''); }
      fs.appendFileSync(file, JSON.stringify({time: new Date().toISOString(), event, ...details}) + '\n');
    } catch { /* Logging must not close the HUD. */ }
  };
  const currentOverlay = overlayWindow;
  overlayPositions.attach(currentOverlay);
  overlayCloseRequested = false;
  overlayGuardian = attachOverlayGuardian(currentOverlay, {screen, powerMonitor, wanted: () => overlayWindow === currentOverlay && !overlayCloseRequested && !shuttingDown, log: logOverlay});
  overlayWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  overlayCloseRequested = false;
  // Only the X/main close button and whole-app shutdown may dispose the overlay.
  // Non-client window gestures must not close or minimize the frameless HUD.
  overlayWindow.on("close", (event) => { if (!overlayCloseRequested && !shuttingDown) event.preventDefault(); });
  overlayWindow.once("ready-to-show", () => {
    if (overlayWindow === currentOverlay && !overlayCloseRequested && !shuttingDown && !currentOverlay.isDestroyed()) overlayGuardian?.recover('ready');
  });
  overlayWindow.on("closed", () => {
    logOverlay('closed', {requested: overlayCloseRequested, shuttingDown});
    if (overlayWindow === currentOverlay) { overlayWindow = null; overlayGuardian = null; overlayCloseRequested = false; }
  });
  try {await currentOverlay.loadURL(`http://127.0.0.1:${hostEndpoint.port}/?token=${hostEndpoint.token}&overlay=1`);}
  catch(error){if(!currentOverlay.isDestroyed())currentOverlay.destroy();throw error;}
}

async function createWindow() {
  const { port, token } = await startLocalHost();
  hostEndpoint = { port, token };
  if(!monitorController) monitorController=createMonitorController({directory:app.getPath('userData'),
    targets:async()=>{const response=await fetch(`http://127.0.0.1:${hostEndpoint.port}/api/monitor/targets`,{headers:{'X-SynapseX-Token':hostEndpoint.token},signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('游戏检测暂不可用');return response.json();},
    fps:getFpsState,startFps:startFpsCollector,stopFps:stopFpsCollector,openOverlay:createOverlayWindow,
    closeOverlay:()=>{overlayCloseRequested=true;overlayWindow?.close();},
    setClickThrough:enabled=>overlayWindow?.setIgnoreMouseEvents(enabled,{forward:true}),
    visible:()=>!!overlayWindow&&!overlayWindow.isDestroyed(),authorize:()=>product?.requireAccess()});
  monitorController.start();
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: "#000000",
    title: "SynapseX 游戏优化器",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${port}/`)) event.preventDefault();
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on('show',()=>windowEffects?.enter(mainWindow));
  mainWindow.on("close", event => { if (!shuttingDown) { event.preventDefault(); void windowBehavior?.requestClose(mainWindow); } });
  mainWindow.on("closed", () => { mainWindow = null; app.quit(); });
  await mainWindow.loadURL(`http://127.0.0.1:${port}/?token=${token}`);
}

const singleInstance = app.requestSingleInstanceLock();
async function openWorkspace() {
  if (shuttingDown) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    windowEffects?.cancelHide(mainWindow);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show(); mainWindow.focus(); return;
  }
  if (openingWorkspace) return openingWorkspace;
  openingWorkspace = createWindow().then(() => { if (!product?.state().required) void communitySignin?.startup(); }).catch(error => {
    dialog.showErrorBox("SynapseX 启动失败", error instanceof Error ? error.message : String(error));
    if (!startupBackground) app.quit();
  }).finally(() => { openingWorkspace = null; });
  return openingWorkspace;
}
async function openUpdateCenter() {
  await openWorkspace();
  if (!shuttingDown) mainWindow?.webContents.send('product:prompt');
}
if (!singleInstance) app.quit();
else {
  app.on("second-instance", (_event, argv) => {
    if (argv.includes(STARTUP_ARG)) return;
    if (!readyForWindows) { openRequested = true; return; }
    void openWorkspace();
  });
  app.whenReady().then(async () => {
    const appearance = createAppearanceStore(app.getPath("userData"));
    const gamePaths = createGamePathStore(app.getPath("userData"));
    const startup = createStartupSettings({ app });
    closePrompt = createClosePrompt({dialog});
    sensorPrompt = createSensorPrompt();
    windowEffects = createWindowEffects();
    windowBehavior = createWindowBehavior({directory:app.getPath('userData'), dialog, Tray, Menu, icon:resourcePath('build/icon.png'),
      openWorkspace:()=>void openWorkspace(), checkUpdates:()=>void openUpdateCenter(), quit:()=>app.quit(),
      isQuitting:()=>shuttingDown, hasBackgroundTray:()=>!!startupBackground, confirmClose:(window,options)=>closePrompt.ask(window,options), beforeHide:window=>windowEffects.leave(window,'tray')});
    const requireMain = (event) => { if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error("Unsupported appearance sender"); };
    const requireWindowMain = event => {requireMain(event);if(event.senderFrame!==mainWindow.webContents.mainFrame)throw Error('Unsupported window settings sender');};
    ipcMain.handle('window-effects:ready',(event,value)=>{requireWindowMain(event);windowEffects.setReady(mainWindow,value);});
    ipcMain.handle('window-effects:complete',(event,id)=>{requireWindowMain(event);return windowEffects.complete(event.sender,id);});
    ipcMain.handle('window-close:ready',(event,value)=>{requireWindowMain(event);closePrompt.setReady(event.sender,value);});
    ipcMain.handle('window-close:ack',(event,id)=>{requireWindowMain(event);return closePrompt.acknowledge(event.sender,id);});
    ipcMain.handle('window-close:respond',(event,value)=>{requireWindowMain(event);return closePrompt.respond(event.sender,value);});
    ipcMain.handle('sensor-prompt:ready',(event,value)=>{requireWindowMain(event);sensorPrompt.setReady(event.sender,value);});
    ipcMain.handle('sensor-prompt:ack',(event,id)=>{requireWindowMain(event);return sensorPrompt.acknowledge(event.sender,id);});
    ipcMain.handle('sensor-prompt:respond',(event,value)=>{requireWindowMain(event);return sensorPrompt.respond(event.sender,value);});
    ipcMain.handle('window-behavior:read', event=>{requireWindowMain(event);return windowBehavior.read();});
    ipcMain.handle('window-behavior:save', (event,value)=>{requireWindowMain(event);return windowBehavior.save(value);});
    ipcMain.handle('window:quit', event=>{requireWindowMain(event);app.quit();});
    product = createProductClient({app,shell});
    for(const method of ['state','refresh','download','showDownload']) ipcMain.handle(`product:${method}`, event => {requireMain(event);if(event.senderFrame!==mainWindow.webContents.mainFrame)throw Error('Unsupported product sender');return product[method]();});
    await product.refresh();
    product.start();
    licensing = createLicensing({ app, safeStorage });
    for (const method of ['state', 'activate', 'refresh', 'deactivate']) {
      ipcMain.handle(`license:${method}`, (event, value) => {
        requireMain(event);
        if (event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('Unsupported license sender');
        return licensing[method](value);
      });
    }
    licensing.start();
    softwareAccount = createSoftwareAccount({ app, safeStorage });
    for (const method of ['state', 'register', 'login', 'sync', 'redeem', 'logout']) {
      ipcMain.handle(`software-account:${method}`, (event, value) => {
        requireMain(event);
        if (event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('Unsupported account sender');
        return softwareAccount[method](value);
      });
    }
    softwareAccount.start();
    vipPolicy = createVipPolicy(softwareAccount, licensing);
    ipcMain.handle('vip:state', event => { requireMain(event); return vipPolicy.state(); });
    const requireVip = feature => {product.requireAccess();try{vipPolicy.requireFeature(feature);}catch(error){mainWindow?.webContents.send('account:prompt',softwareAccount.state().user?'login':'register');throw error;}};
    const requireAdministrator = createAdminAccess(softwareAccount, product);
    ipcMain.handle('vip:require', async (event, feature) => { requireMain(event); if(feature === 'jiuyin.fps') await requireAdministrator(feature); else requireVip(feature); return true; });
    const jiuyinFps = createJiuYinFpsUnlock({ directory:path.join(app.getPath('userData'),'jiuyin-fps-backups'), authorize:requireAdministrator, replaceScript:resourcePath('host/ReplaceJiuYinFpsResource.ps1') });
    fpsExpiry = createFpsExpiry({account:softwareAccount,fps:jiuyinFps,notify: value => {
      if(Notification.isSupported())new Notification({title:'帧率上限设置',body:value.message}).show();
    }});
    fpsExpiry.start();
    for (const method of ['state','apply','restore','importBackup']) ipcMain.handle(`jiuyin-fps:${method}`, async (event,value) => {
      requireMain(event);
      if(event.senderFrame !== mainWindow.webContents.mainFrame) throw Error('Unsupported FPS settings sender');
      if(method==='state') {
        const result=await jiuyinFps.state(value?.gameRoot), notice=fpsExpiry.state();
        return {...result,autoRestoreMessage:notice.gameRoot===result.gameRoot ? notice.message : ''};
      }
      if(method==='apply') product.requireAccess();
      if(method==='importBackup') {
        const result=await dialog.showOpenDialog(mainWindow,{title:'选择此版本原版 skin.package 备份',properties:['openFile']});
        if(result.canceled || !result.filePaths[0])return null;
        return jiuyinFps.importBackup({gameRoot:value?.gameRoot,sourceFile:result.filePaths[0]});
      }
      return jiuyinFps[method](value);
    });
    const reportOutbox = require('./report-outbox.cjs').createReportOutbox(app.getPath('userData'));
    ipcMain.handle('reports:pending', event => { requireMain(event); return reportOutbox.list(); });
    ipcMain.handle('reports:checkpoint', (event, report) => { requireMain(event); reportOutbox.put(report); });
    const forwardHostRequest = async (event, value) => {
      requireMain(event);
      if (!hostEndpoint || typeof value?.path !== 'string' || !/^\/api\/[a-z0-9/-]+(?:\?[^#]*)?$/.test(value.path) || !['GET','POST'].includes(value.method)) throw Error('无效的本地请求');
      const feature = routeFeature(value.path, value.method);
      if(value.method==='POST'&&!/(?:restore|stop|shutdown)/.test(value.path) && !/^\/api\/(?:monitor\/sample|reports\/(?:list|save))$/.test(value.path))product.requireAccess();
      if(feature) requireVip(feature);
      const payload = await require('./host-request.cjs').requestHostJson(hostEndpoint, value, vipToken);
      if (value.path === '/api/reports/save' && payload.id) reportOutbox.remove(payload.id);
      return payload;
    };
    ipcMain.handle('host:request', forwardHostRequest);
    ipcMain.handle('quick:apply', async (event, value) => {
      requireMain(event);
      product.requireAccess();
      return forwardHostRequest(event, prepareQuickApply(value, requireVip));
    });
    const getSignin = () => communitySignin ??= createCommunityAccounts({ app, BrowserWindow, session, safeStorage, ipcMain, getMainWindow: () => mainWindow, getAccountLimit: () => vipPolicy.state().signinLimit });
    for (const method of ['openLogin', 'accounts', 'refreshAccounts', 'catalog', 'selectServer', 'batch', 'forget', 'addAccount', 'updateAccount', 'removeAccount', 'settings']) {
      ipcMain.handle(`community:${method}`, (event, value) => { requireMain(event); if(['batch','addAccount','openLogin','selectServer'].includes(method))product.requireAccess(); return getSignin()[method](value); });
    }
    ipcMain.handle("appearance:read", (event) => { requireMain(event); return appearance.read(); });
    ipcMain.handle("appearance:save", (event, value) => { requireMain(event); return appearance.write(value); });
    ipcMain.handle("game-paths:read", (event) => { requireMain(event); return gamePaths.read(); });
    ipcMain.handle("game-paths:save", (event, value) => { requireMain(event); return gamePaths.write(value); });
    ipcMain.handle("startup:read", event => { requireMain(event); return startup.read(); });
    ipcMain.handle("startup:save", (event, value) => { requireMain(event); return startup.save(value); });
    registerWindowControls();
    getSignin();
    readyForWindows = true;
    if (process.argv.includes(STARTUP_ARG) && !openRequested && !product.state().required) {
      startupBackground = createStartupBackground({ Tray, Menu, icon: resourcePath('build/icon.png'),
        signin: getSignin(), openWorkspace: () => void openWorkspace(), checkUpdates:()=>void openUpdateCenter(), quit: () => app.quit(), isOnline: () => electronNet.isOnline() });
      void startupBackground.start().catch(error => { dialog.showErrorBox('SynapseX 后台启动失败', String(error)); app.quit(); });
    } else await openWorkspace();
  });
}

app.on("window-all-closed", () => { if (!shuttingDown && !startupBackground) app.quit(); });
app.on("before-quit", (event) => {
  if (shutdownComplete) return;
  event.preventDefault();
  if (shuttingDown) return;
  shuttingDown = true;
  closePrompt?.stop();
  sensorPrompt?.stop();
  windowBehavior?.stop();
  monitorController?.stop();
  startupBackground?.stop();
  licensing?.stop();
  softwareAccount?.stop();
  fpsExpiry?.stop();
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.destroy();
  const lightsOut = windowEffects?.leave(mainWindow,'quit');
  void require('./report-shutdown.cjs').flushReportBeforeQuit(mainWindow, ipcMain).then(() => Promise.allSettled([lightsOut, getFpsCollector().shutdown(), requestHostShutdown(), communitySignin?.shutdown(), product?.stop(), fpsExpiry?.stop()])).finally(() => {
    windowEffects?.stop();
    if (hostProcess && !hostProcess.killed) hostProcess.kill();
    hostEndpoint = null;
    shutdownComplete = true;
    app.quit();
  });
});

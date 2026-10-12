const { contextBridge, ipcRenderer } = require("electron");
const updateListeners = new Set();
let pendingUpdatePrompt = false;
ipcRenderer.on('product:prompt', ()=>{
  if (!updateListeners.size) pendingUpdatePrompt = true;
  else for (const callback of updateListeners) callback();
});

contextBridge.exposeInMainWorld("synapsexDesktop", Object.freeze({
  isDesktop: true,
  sensorPrompt: Object.freeze({
    ready:value=>ipcRenderer.invoke('sensor-prompt:ready',value),
    acknowledge:id=>ipcRenderer.invoke('sensor-prompt:ack',id),
    respond:value=>ipcRenderer.invoke('sensor-prompt:respond',value),
    onRequest:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('sensor-prompt:request',listener);return()=>ipcRenderer.removeListener('sensor-prompt:request',listener);},
    onDismiss:callback=>{const listener=(_event,id)=>callback(id);ipcRenderer.on('sensor-prompt:dismiss',listener);return()=>ipcRenderer.removeListener('sensor-prompt:dismiss',listener);},
  }),
  windowEffects: Object.freeze({
    ready:value=>ipcRenderer.invoke('window-effects:ready',value),
    complete:id=>ipcRenderer.invoke('window-effects:complete',id),
    onPlay:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('window-effects:play',listener);return()=>ipcRenderer.removeListener('window-effects:play',listener);},
  }),
  closePrompt: Object.freeze({
    ready:value=>ipcRenderer.invoke('window-close:ready',value),
    acknowledge:id=>ipcRenderer.invoke('window-close:ack',id),
    respond:value=>ipcRenderer.invoke('window-close:respond',value),
    onRequest:callback=>{const listener=(_event,id)=>callback(id);ipcRenderer.on('window-close:prompt',listener);return()=>ipcRenderer.removeListener('window-close:prompt',listener);},
    onDismiss:callback=>{const listener=(_event,id)=>callback(id);ipcRenderer.on('window-close:dismiss',listener);return()=>ipcRenderer.removeListener('window-close:dismiss',listener);},
  }),
  windowBehavior: Object.freeze({read:()=>ipcRenderer.invoke('window-behavior:read'),save:value=>ipcRenderer.invoke('window-behavior:save',value)}),
  quit:()=>ipcRenderer.invoke('window:quit'),
  onUpdatePrompt: callback=>{updateListeners.add(callback);if(pendingUpdatePrompt){pendingUpdatePrompt=false;callback();}return()=>updateListeners.delete(callback);},
  product: Object.freeze({state:()=>ipcRenderer.invoke('product:state'),refresh:()=>ipcRenderer.invoke('product:refresh'),download:()=>ipcRenderer.invoke('product:download'),showDownload:()=>ipcRenderer.invoke('product:showDownload')}),
  onAccountPrompt: callback => { const listener=(_event,mode)=>callback(mode);ipcRenderer.on('account:prompt',listener);return()=>ipcRenderer.removeListener('account:prompt',listener); },
  vip: Object.freeze({ state: () => ipcRenderer.invoke('vip:state'), require: feature => ipcRenderer.invoke('vip:require', feature) }),
  jiuyinFps: Object.freeze({state:gameRoot=>ipcRenderer.invoke('jiuyin-fps:state',{gameRoot}),apply:value=>ipcRenderer.invoke('jiuyin-fps:apply',value),restore:value=>ipcRenderer.invoke('jiuyin-fps:restore',value),importBackup:gameRoot=>ipcRenderer.invoke('jiuyin-fps:importBackup',{gameRoot})}),
  hostRequest: value => ipcRenderer.invoke('host:request', value),
  pendingReports: () => ipcRenderer.invoke('reports:pending'),
  checkpointReport: report => ipcRenderer.invoke('reports:checkpoint', report),
  onReportShutdown: callback => {
    const listener = () => { Promise.resolve().then(callback).finally(() => ipcRenderer.send('reports:shutdown-ready')).catch(() => {}); };
    ipcRenderer.on('reports:prepare-shutdown', listener);
    return () => ipcRenderer.removeListener('reports:prepare-shutdown', listener);
  },
  quickApply: value => ipcRenderer.invoke('quick:apply', value),
  softwareAccount: Object.freeze({
    state: () => ipcRenderer.invoke('software-account:state'),
    register: (value) => ipcRenderer.invoke('software-account:register', value),
    login: (value) => ipcRenderer.invoke('software-account:login', value),
    sync: () => ipcRenderer.invoke('software-account:sync'),
    redeem: (code) => ipcRenderer.invoke('software-account:redeem', code),
    logout: () => ipcRenderer.invoke('software-account:logout'),
  }),
  license: Object.freeze({
    state: () => ipcRenderer.invoke('license:state'),
    activate: (code) => ipcRenderer.invoke('license:activate', code),
    refresh: () => ipcRenderer.invoke('license:refresh'),
    deactivate: () => ipcRenderer.invoke('license:deactivate'),
  }),
  startup: Object.freeze({
    read: () => ipcRenderer.invoke('startup:read'),
    save: (value) => ipcRenderer.invoke('startup:save', value),
  }),
  community: Object.freeze({
    openLogin: (value) => ipcRenderer.invoke('community:openLogin', value),
    accounts: () => ipcRenderer.invoke('community:accounts'),
    refreshAccounts: (value) => ipcRenderer.invoke('community:refreshAccounts', value),
    catalog: () => ipcRenderer.invoke('community:catalog'),
    selectServer: (value) => ipcRenderer.invoke('community:selectServer', value),
    batch: (value) => ipcRenderer.invoke('community:batch', value),
    forget: (value) => ipcRenderer.invoke('community:forget', value),
    addAccount: (value) => ipcRenderer.invoke('community:addAccount', value),
    updateAccount: (value) => ipcRenderer.invoke('community:updateAccount', value),
    removeAccount: (value) => ipcRenderer.invoke('community:removeAccount', value),
    settings: (value) => ipcRenderer.invoke('community:settings', value),
  }),
  readAppearance: () => ipcRenderer.invoke("appearance:read"),
  readGamePaths: () => ipcRenderer.invoke("game-paths:read"),
  saveGamePaths: (value) => ipcRenderer.invoke("game-paths:save", value),
  saveAppearance: (value) => ipcRenderer.invoke("appearance:save", value),
  minimize: () => ipcRenderer.send("window:minimize"),
  toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
  close: () => ipcRenderer.send("window:close"),
  selectGameExecutable: () => ipcRenderer.invoke("dialog:select-game-executable"),
  selectGameDirectory: () => ipcRenderer.invoke("dialog:select-game-directory"),
  selectNvidiaNip: () => ipcRenderer.invoke('dialog:select-nvidia-nip'),
  startFps: (target) => ipcRenderer.invoke("monitor:start-fps", target),
  stopFps: () => ipcRenderer.invoke("monitor:stop-fps"),
  fpsState: () => ipcRenderer.invoke("monitor:fps-state"),
  monitorControls: () => ipcRenderer.invoke('monitor:controls'),
  openSensorHelp: () => ipcRenderer.invoke('monitor:sensor-help'),
  installSensorDriver: () => ipcRenderer.invoke('monitor:sensor-install'),
  saveMonitorControls: (patch) => ipcRenderer.invoke('monitor:save-controls', patch),
  openOverlay: () => ipcRenderer.invoke("monitor:open-overlay"),
  closeOverlay: () => ipcRenderer.invoke("monitor:close-overlay"),
  configureOverlay: (options) => ipcRenderer.invoke("monitor:configure-overlay", options),
  setOverlayClickThrough: (enabled) => ipcRenderer.invoke("monitor:overlay-click-through", Boolean(enabled)),
}));

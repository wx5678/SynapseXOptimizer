export {};

declare global {
  type JiuYinFpsUnlockState = {supported:boolean;gameRoot:string;cap:number|null;visualRange:number|null;running:boolean;hasBackup:boolean;canApply:boolean;canRestore:boolean;backupPath:string;message:string;autoRestoreMessage?:string};
  type SoftwareAccountState = {configured:boolean; enforcement:boolean; status:string; message:string; features:string[]; administrator?:boolean; user:{id:string;username:string;created_at:number}|null; licenseId?:string; expiresAt?:number; offlineUntil?:number; lastChecked?:number|null};
  type LicenseState = { configured: boolean; enforcement: boolean; endpoint: string; status: string; message: string; features: string[]; licenseId?: string; expiresAt?: number; offlineUntil?: number; lastChecked?: number | null; lastSuccess?: number | null };
  type StartupSettings = { supported: boolean; enabled: boolean; registered: boolean; blocked: boolean; executable: string; reason: string };
  type WindowBehavior = {closeAction:'ask'|'tray'|'quit'};
  interface Window {
    synapsexDesktop?: {
      sensorPrompt?: {ready:(value:boolean)=>Promise<void>;acknowledge:(id:string)=>Promise<boolean>;respond:(value:{id:string;accepted:boolean})=>Promise<boolean>;onRequest:(callback:(value:{id:string;version:string})=>void)=>()=>void;onDismiss:(callback:(id:string)=>void)=>()=>void};
      windowEffects?: {ready:(value:boolean)=>Promise<void>;complete:(id:string)=>Promise<boolean>;onPlay:(callback:(value:{id:string;kind:'enter'|'tray'|'quit'})=>void)=>()=>void};
      closePrompt?: {ready:(value:boolean)=>Promise<void>;acknowledge:(id:string)=>Promise<boolean>;respond:(value:{id:string;action:'tray'|'quit'|'cancel';remember:boolean})=>Promise<boolean>;onRequest:(callback:(id:string)=>void)=>()=>void;onDismiss:(callback:(id:string)=>void)=>()=>void};
      windowBehavior?: {read:()=>Promise<WindowBehavior>;save:(value:WindowBehavior)=>Promise<WindowBehavior>};
      quit?:()=>Promise<void>;
      onUpdatePrompt?:(callback:()=>void)=>()=>void;
      jiuyinFps?: {state:(gameRoot:string)=>Promise<JiuYinFpsUnlockState>;apply:(value:{gameRoot:string;confirm:'apply-jiuyin-fps';cap:number;visualRange:number;acknowledgeSaveRisk:boolean})=>Promise<JiuYinFpsUnlockState>;restore:(value:{gameRoot:string;confirm:'restore-jiuyin-fps'})=>Promise<JiuYinFpsUnlockState>;importBackup:(gameRoot:string)=>Promise<JiuYinFpsUnlockState|null>};
      product?: {state:()=>Promise<ProductState>;refresh:()=>Promise<ProductState>;download:()=>Promise<ProductState>;showDownload:()=>Promise<boolean>};
      onAccountPrompt?:(callback:(mode:'login'|'register')=>void)=>()=>void;
      softwareAccount?: {state:()=>Promise<SoftwareAccountState>; register:(value:{username:string;password:string})=>Promise<SoftwareAccountState>; login:(value:{username:string;password:string})=>Promise<SoftwareAccountState>; sync:()=>Promise<SoftwareAccountState>; redeem:(code:string)=>Promise<SoftwareAccountState>; logout:()=>Promise<SoftwareAccountState>};
      license?: { state: () => Promise<LicenseState>; activate: (code: string) => Promise<LicenseState>; refresh: () => Promise<LicenseState>; deactivate: () => Promise<LicenseState> };
      startup?: { read: () => Promise<StartupSettings>; save: (value: {enabled: boolean}) => Promise<StartupSettings> };
      community: {
        openLogin: (value: {accountId: string}) => Promise<CommunityAccounts>;
        accounts: () => Promise<CommunityAccounts>;
        refreshAccounts: (value?: {accountId?: string}) => Promise<CommunityAccounts>;
        catalog: () => Promise<CommunityCatalog>;
        selectServer: (value: {accountId: string; serverId: string; groupId: string; optionKey?: string}) => Promise<CommunityAccounts>;
        batch: (value: {confirm: 'sign-selected-accounts'; accountIds: string[]}) => Promise<CommunityAccounts>;
        forget: (value: {accountId: string; confirm: 'forget-local-login'}) => Promise<CommunityAccounts>;
        addAccount: (value: {name: string}) => Promise<CommunityAccounts & {accountId: string}>;
        updateAccount: (value: {accountId: string; name?: string; enabled?: boolean}) => Promise<CommunityAccounts>;
        removeAccount: (value: {accountId: string; confirm: 'remove-local-account'}) => Promise<CommunityAccounts>;
        settings: (value: {autoSign: boolean; confirm?: 'enable-startup-sign'}) => Promise<CommunityAccounts>;
      };
      minimize: () => void;
      readGamePaths: () => Promise<{ gameRoot: string; gpuExecutable: string }>;
      saveGamePaths: (value: { gameRoot?: string; gpuExecutable?: string }) => Promise<{ gameRoot: string; gpuExecutable: string }>;
      readAppearance: () => Promise<{ skin: "light" | "dark"; followSystem: boolean; motion: boolean; particles: boolean }>;
      saveAppearance: (value: { skin: "light" | "dark"; followSystem: boolean; motion: boolean; particles: boolean }) => Promise<unknown>;
      toggleMaximize: () => void;
      close: () => void;
      selectGameExecutable: () => Promise<string>;
      selectGameDirectory: () => Promise<string>;
      selectNvidiaNip: () => Promise<string>;
      startFps: (target: { processName: string; processId: number; displayName?: string; mode: "auto" | "manual"; retry?: boolean }) => Promise<FpsCollectorState>;
      stopFps: () => Promise<FpsCollectorState>;
      fpsState: () => Promise<FpsCollectorState>;
      monitorControls: () => Promise<MonitorControls>;
      openSensorHelp: () => Promise<void>;
      installSensorDriver: () => Promise<{status:'installed'|'reboot-required'|'cancelled'|'not-installed';message:string}>;
      saveMonitorControls: (patch: Partial<Pick<MonitorControls,'overlayEnabled'|'clickThrough'|'autoCapture'|'mode'|'manualProcess'>>) => Promise<MonitorControls>;
      openOverlay: () => Promise<boolean>;
      closeOverlay: () => Promise<boolean>;
      configureOverlay: (options: { layout: "horizontal" | "grid"; scale: "small" | "medium" | "large"; metricCount?: number }) => Promise<{ layout: string; scale: string; width: number; height: number }>;
      setOverlayClickThrough: (enabled: boolean) => Promise<boolean>;
      isDesktop: true;
      vip?: { state: () => Promise<{vip:boolean; features:string[]; signinLimit:number}>; require:(feature:string)=>Promise<boolean> };
      hostRequest?: (value:{path:string;method:string;body?:string})=>Promise<unknown>;
      pendingReports?: () => Promise<import('../lib/api').PerformanceReportDraft[]>;
      checkpointReport?: (report: import('../lib/api').PerformanceReportDraft) => Promise<void>;
      onReportShutdown?: (callback: () => Promise<void>) => () => void;
      quickApply?: (value:{tier:'basic'|'optimal'|'maximum';kind:'system'|'advanced'|'expert';id:string;fingerprint?:string;choice?:string})=>Promise<{ok:boolean;backupId:string;message?:string}>;
    };
  }

  type MonitorControls = {overlayEnabled:boolean;clickThrough:boolean;autoCapture:boolean;mode:'auto'|'manual';manualProcess:string;overlayVisible:boolean;waitingForGame:boolean;error:string};
  type FpsCollectorState = {
    available: boolean;
    running: boolean;
    source: string;
    targetProcessName: string;
    targetProcessId?: number;
    targetDisplayName: string;
    targetMode: string;
    fps: number | null;
    frameTimeMs: number | null;
    onePercentLow: number | null;
    sampleCount: number;
    status: string;
    error: string;
  };
  type CommunityResult = {success: boolean; message: string; code: string; at: string; serverId: string};
  type CommunityCatalog = {groups: {id: string; name: string}[]; servers: {id: string; groupId: string; name: string; active: boolean; optionKey: string}[]};
  type CommunityState = {loggedIn: boolean; accountName?: string; message: string; checkedAt: string; choice: {serverId: string; groupId: string; optionKey?: string}; storageError: string; windowError: string; loginOpen: boolean; lastResult: CommunityResult | null; records: {serverId: string; days: number}[]};
  type CommunityAccount = {id: string; name: string; accountName?: string; enabled: boolean; status: 'signed' | 'pending' | 'configure' | 'login' | 'error'; state: CommunityState | null; error: string; receipt: {date: string; serverId: string; at: string} | null};
  type CommunityAccounts = {autoSign: boolean; busy: boolean; date: string; storageError: string; progress: {total: number; completed: number; current: string; automatic: boolean} | null; accounts: CommunityAccount[]};
}

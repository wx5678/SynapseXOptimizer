const fs = require('node:fs');
const path = require('node:path');
const {loginStatusPage} = require('./community-login-page.cjs');
const {loginResponse,scheduleActivity} = require('./community-status.cjs');

const ACTIVITY = 'https://9yin.woniu.com/m/static/act/202205/siginIn/';
const CALLBACK = 'https://gwact.woniu.com/passport/ssologin?goto=' + encodeURIComponent(ACTIVITY);
const LOGIN = 'https://sso.woniu.com/login_embedded?service=' + encodeURIComponent(CALLBACK);
const HOSTS = new Set(['sso.woniu.com', '9yin.woniu.com', 'gwact.woniu.com', 'gwactv2.woniu.com', 'safe.woniu.com', 'www.woniu.com', 'www3.woniu.com', 'cloud.api.woniu.com', 'static.woniu.com']);
function officialUrl(value) {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password && !u.port && HOSTS.has(u.hostname); } catch { return false; }
}
function parseResponse(text) {
  const match = /^\s*synapsexSignin\s*\(([\s\S]*)\)\s*;?\s*$/.exec(text);
  const value = JSON.parse(match ? match[1] : text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('官方响应格式发生变化，请打开官方页面核对。');
  return value;
}
function cookieDetails(c, now = Date.now() / 1000) {
  if (!c || typeof c.domain !== 'string' || typeof c.name !== 'string' || typeof c.value !== 'string') return null;
  const host = c.domain.replace(/^\./, '');
  if (host !== 'woniu.com' && !HOSTS.has(host)) return null;
  if (c.expirationDate != null && (!Number.isFinite(c.expirationDate) || c.expirationDate <= now)) return null;
  const details = { url: `https://${host}${c.path?.startsWith('/') ? c.path : '/'}`, name: c.name, value: c.value, path: c.path || '/', secure: Boolean(c.secure), httpOnly: Boolean(c.httpOnly) };
  if (!c.hostOnly) details.domain = c.domain;
  if (c.expirationDate != null) details.expirationDate = c.expirationDate;
  if (['unspecified', 'no_restriction', 'lax', 'strict'].includes(c.sameSite)) details.sameSite = c.sameSite;
  return details;
}
function cleanMessage(value) { return typeof value === 'string' ? value.replace(/<[^>]*>/g, '').slice(0, 400) : ''; }
function cleanAccountName(value) { return typeof value === 'string' && /^[^\s<>\x00-\x1f]{1,64}$/.test(value) ? value : ''; }
function realmOption(s) {
  const id = String(s.id), groupId = String(s.isp), name = cleanMessage(s.name);
  // Official aliases may share BOTH id and isp. Keep display identity separate
  // from the official server_id sent to the activity endpoint.
  return { id, groupId, name, active: String(s.state) === '1', optionKey: JSON.stringify([groupId, id, name]) };
}
function createCommunitySignin({ app, BrowserWindow, session, safeStorage, ipcMain, getMainWindow, profileId = 'legacy', getProfileName = () => '', activityScheduler = scheduleActivity, onLoginVerified = () => {} }) {
  if (!/^(legacy|[a-f0-9-]{36})$/.test(profileId)) throw new Error('无效的本地账号编号。');
  // Separate Chromium profile: never reuse the privileged local application's session.
  const ses = session.fromPartition(profileId === 'legacy' ? 'persist:synapsex-community-v1' : `persist:synapsex-community-${profileId}`);
  const directory = path.join(app.getPath('userData'), 'community-signin', ...(profileId === 'legacy' ? [] : ['accounts', profileId]));
  const cookieFile = path.join(directory, 'session.bin');
  const settingsFile = path.join(directory, 'settings.json');
  let win = null, storageError = '', windowError = '', timer = null, restoring = true, suspended = false, closing = false;
  let queue = Promise.resolve(), operation = null;
  let initPending=null, initCache=null, authEpoch=0, confirmedLoginEpoch=-1;
  const invalidateAuth=()=>{authEpoch++;initCache=null;initPending=null;};
  const requests = new Set();
  let candidateName = '', submittedName = '', accountName = '', loginTimer = null;
  const receiveName = (event, value) => {
    if (!win || win.isDestroyed() || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) return;
    try { const url = new URL(event.senderFrame.url); if (url.origin !== 'https://sso.woniu.com' || !/^\/login(?:_embedded)?(?:;|\/|$)/.test(url.pathname)) return; } catch { return; }
    candidateName = cleanAccountName(value);
  };
  ipcMain?.on('community:login-name', receiveName);
  let choice = { serverId: '', groupId: '' }, lastResult = null;
  try { const saved = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); choice = { serverId: String(saved.serverId || ''), groupId: String(saved.groupId || ''), optionKey: typeof saved.optionKey === 'string' ? saved.optionKey : '' }; } catch { /* First run. */ }
  const persistCookies = () => {
    const task = queue.catch(() => {}).then(async () => {
      if (suspended) return;
      if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows 加密存储不可用，不能保存跨重启登录凭据。');
      const cookies = (await ses.cookies.get({})).filter(c => cookieDetails(c));
      const encrypted = safeStorage.encryptString(JSON.stringify(cookies));
      await fs.promises.mkdir(directory, { recursive: true });
      await fs.promises.writeFile(cookieFile + '.pending', encrypted);
      await fs.promises.rename(cookieFile + '.pending', cookieFile);
      await ses.cookies.flushStore();
      ses.flushStorageData();
      storageError = '';
    }).catch(() => { storageError = '登录状态未能加密保存；本次仍可使用，但重启后可能需要重新登录。'; });
    queue = task;
    return task;
  };
  const ready = (async () => {
    try {
      if (fs.existsSync(cookieFile)) {
        if (!safeStorage.isEncryptionAvailable()) throw new Error('Encryption unavailable');
        const saved = JSON.parse(safeStorage.decryptString(await fs.promises.readFile(cookieFile)));
        if (!Array.isArray(saved) || saved.length > 2000) throw new Error('Invalid session');
        for (const c of saved) { const details = cookieDetails(c); if (details) await ses.cookies.set(details); }
      }
    } catch { storageError = '之前的登录状态无法恢复，请重新完成官方登录。'; }
    finally { restoring = false; }
  })();
  const cookieChanged = () => {
    if (restoring || suspended || closing) return;
    clearTimeout(timer);
    timer = setTimeout(() => { void persistCookies(); }, 400);
  };
  ses.cookies.on('changed', cookieChanged);
  ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  ses.on('will-download', event => event.preventDefault());
  // Legacy login callbacks contain HTTP URLs; upgrade those exact official hosts,
  // and refuse unencrypted requests rather than disabling web security or TLS checks.
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    if (!officialUrl(details.url)) return callback({ cancel: true });
    const destination = new URL(details.url);
    if (details.method === 'POST' && details.resourceType === 'mainFrame' && destination.origin === 'https://sso.woniu.com' && /^\/login(?:_embedded)?(?:;|\/|$)/.test(destination.pathname)) { invalidateAuth(); submittedName = candidateName; }
    if (details.url.startsWith('http:')) return callback({ redirectURL: details.url.replace(/^http:/, 'https:') });
    callback({});
  });
  async function request(url) {
    await ready;
    if (closing) throw new Error('软件正在退出。');
    const abort = new AbortController();
    requests.add(abort);
    const timeout = setTimeout(() => abort.abort(), 15000);
    try {
      const response = await ses.fetch(url, { credentials: 'include', cache: 'no-store', redirect: 'error', signal: abort.signal });
      if (!response.ok) throw new Error(`官方服务返回 HTTP ${response.status}。`);
      const text = await response.text();
      if (text.length > 2_000_000) throw new Error('官方响应过大。');
      return parseResponse(text);
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('官方请求超时；若刚提交签到，请刷新状态核对，不要连续重试。');
      // Do not surface cookie headers, redirect tickets or arbitrary response bodies.
      throw new Error(error.message?.startsWith('官方') ? error.message : '无法连接官方服务，请检查网络或在官方登录窗口查看。');
    } finally { clearTimeout(timeout); requests.delete(abort); }
  }
  const init = () => {
    if(initCache && Date.now()-initCache.at<3000) return Promise.resolve(initCache.value);
    if(initPending) return initPending;
    const epoch=authEpoch;
    const task=activityScheduler(async()=>{
      if(epoch!==authEpoch) throw new Error('登录状态已变更，请重新刷新。');
      const value=await request('https://gwactv2.woniu.com/9yin/H220519/init?jsoncallback=synapsexSignin');
      if(epoch!==authEpoch) throw new Error('登录状态已变更，请重新刷新。');
      if(loginResponse(value)) initCache={value,at:Date.now()};
      return value;
    });
    initPending=task;
    void task.finally(()=>{if(initPending===task)initPending=null;}).catch(()=>{});
    return task;
  };
  async function catalog() {
    const [groups, servers] = await Promise.all([
      request('https://gwact.woniu.com/api/isp?gid=10&jsoncallback=synapsexSignin'),
      request('https://gwact.woniu.com/api/garea?gid=10&jsoncallback=synapsexSignin'),
    ]);
    if (!Array.isArray(groups.List) || !Array.isArray(servers.realms)) throw new Error('官方服务器列表暂不可用。');
    return { groups: groups.List.map(g => ({ id: String(g.GROUPID), name: cleanMessage(g.GROUPNAME) })), servers: [...new Map(servers.realms.map(s => { const option = realmOption(s); return [option.optionKey, option]; })).values()] };
  }
  async function state({fromLoginWindow=false}={}) {
    const epoch=authEpoch, checkedWindow=win;
    const value = await init();
    if(epoch!==authEpoch) throw new Error('登录状态已变更，请重新刷新。');
    const loggedIn = loginResponse(value);
    if (loggedIn) windowError = '';
    if (loggedIn && submittedName) accountName = submittedName;
    await persistCookies();
    if(epoch!==authEpoch) throw new Error('登录状态已变更，请重新刷新。');
    if(loggedIn) {
      confirmedLoginEpoch=epoch;
      // A manual refresh can recover a pending/error window without another login.
      // Do not invoke onLoginVerified here: refresh runs inside the account lock.
      if(!fromLoginWindow && checkedWindow && win===checkedWindow && !checkedWindow.isDestroyed()) checkedWindow.destroy();
    }
    return { loggedIn, accountName, message: loggedIn ? '官方已确认登录。' : cleanMessage(value.msg) || '需要完成官方登录。', checkedAt: new Date().toISOString(), choice, storageError, windowError, loginOpen: !!win, lastResult,
      // Schema names only, never values or credentials. Used to verify whether
      // the official logged-in response provides an explicit daily-state field.
      queryFields: { root: Object.keys(value).slice(0,64), records: [...new Set((Array.isArray(value.list) ? value.list : []).flatMap(r=>r && typeof r==='object' ? Object.keys(r) : []))].slice(0,64) },
      records: loggedIn && Array.isArray(value.list) ? value.list.map(r => ({ serverId: String(r.server_id), days: Math.max(0, Number(r.days_num) || 0) })) : [] };
  }
  async function openLogin() {
    await ready;
    if (operation || closing) throw new Error('请等待当前操作结束。');
    invalidateAuth();
    // Explicit re-login starts only this profile fresh. A stale SSO cookie may
    // otherwise skip the form and land on an empty/expired activity callback.
    if (win && !win.isDestroyed()) win.destroy();
    suspended = true; clearTimeout(timer); clearTimeout(loginTimer);
    await queue;
    try { await ses.clearStorageData(); await ses.cookies.flushStore(); await ses.clearCache?.(); }
    finally { suspended = false; }
    candidateName = ''; submittedName = ''; accountName = ''; lastResult=null;
    await persistCookies();
    windowError = '';
    const title = `${getProfileName() || '社区签到'} · 蜗牛官方登录`;
    win = new BrowserWindow({ width: 980, height: 760, minWidth: 640, minHeight: 600, parent: getMainWindow(), title, autoHideMenuBar: true, backgroundColor: '#f3f5f8', webPreferences: { session: ses, preload: path.join(__dirname, 'community-login-observer.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
    const currentWindow = win;
    let verification=null, lastStatus='';
    const active=()=>win===currentWindow && !currentWindow.isDestroyed() && !closing;
    const aborted=error=>error?.code==='ERR_ABORTED' || error?.errno===-3;
    currentWindow.on('page-title-updated', event => event.preventDefault());
    const showStatus = (kind, message) => {
      if (win !== currentWindow || currentWindow.isDestroyed() || closing) return;
      if ((kind==='error' || kind==='pending') && confirmedLoginEpoch===authEpoch) return;
      const statusKey=kind+':'+message;
      if(lastStatus===statusKey && currentWindow.webContents.getURL().startsWith('data:')) return;
      lastStatus=statusKey;
      clearTimeout(loginTimer);
      if (kind === 'error' || kind === 'pending') windowError = message;
      else if (kind === 'success') windowError = '';
      void currentWindow.loadURL(loginStatusPage(kind, message, LOGIN)).catch(() => {});
    };
    const guard = (event, url) => { if (!officialUrl(url)) { event.preventDefault(); showStatus('error','登录跳转地址不受支持。请关闭窗口后重新登录。'); } };
    currentWindow.webContents.on('will-navigate', guard);
    currentWindow.webContents.on('will-redirect', guard);
    currentWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (officialUrl(url)) void currentWindow.loadURL(url.replace(/^http:/, 'https:')).catch(error => { if(active() && !aborted(error)) showStatus('error','官方页面加载失败，请关闭登录窗口后重试。'); });
      return { action: 'deny' };
    });
    currentWindow.webContents.on('did-fail-load', (_event, code, _description, url, mainFrame) => {
      if (!active() || !mainFrame || code===-3 || (url && currentWindow.webContents.getURL()!==url)) return;
      showStatus('error',`官方页面加载失败（${code}）。请检查网络后重新加载。`);
    });
    currentWindow.webContents.on('did-finish-load', () => {
      if (win !== currentWindow || currentWindow.isDestroyed()) return;
      const url = currentWindow.webContents.getURL();
      if (!officialUrl(url)) return;
      const epoch=authEpoch;
      if(verification?.url===url && verification.epoch===epoch) return verification.promise;
      const current=()=>active() && epoch===authEpoch && currentWindow.webContents.getURL()===url;
      clearTimeout(loginTimer);
      const run=async()=>{
      try {
        const landed = ['gwact.woniu.com','gwactv2.woniu.com','9yin.woniu.com'].includes(new URL(url).hostname);
        let blank=false;
        try { blank=await currentWindow.webContents.executeJavaScript("document.body ? document.body.innerText.trim().length < 8 && !document.querySelector('input,iframe,img,canvas') : true"); }
        catch { if(!landed) return; }
        if (!current()) return;
        if (new URL(url).hostname === 'sso.woniu.com' && !blank) {
          // An MFA step can remain on SSO. Only a return to the username form
          // invalidates the submitted identity; do not erase it on every step.
          const loginForm = await currentWindow.webContents.executeJavaScript("!!document.querySelector('input#username[name=username][type=text]')");
          if (win !== currentWindow || currentWindow.isDestroyed() || currentWindow.webContents.getURL() !== url) return;
          if (loginForm) submittedName = '';
        }
        if (blank || landed) {
          const verified = await state({fromLoginWindow:true});
          if (!current()) return;
          if (verified.loggedIn) {
            try { await onLoginVerified(verified,()=>epoch===authEpoch && !closing); }
            catch {
              if(current()) showStatus('success','官方已确认登录，账号列表同步尚未完成。请回到软件刷新状态。');
              return;
            }
            if(current()) currentWindow.destroy();
          }
          else if (blank) showStatus('error','官方登录返回了空白页面，尚未确认登录成功。请重新加载，或关闭窗口后重新登录。');
        }
      } catch (error) {
        const detail=/^(官方|无法连接官方|登录状态已变更)/.test(error.message || '') ? cleanMessage(error.message) : '请稍后再检查。';
        if(current()) showStatus('pending',`官方页面已返回，但状态暂未确认。${detail} 请关闭此窗口，在软件中刷新状态；无需反复输入密码。`);
      }
      };
      const promise=run().finally(()=>{if(verification?.promise===promise)verification=null;});
      verification={url,epoch,promise};
      return promise;
    });
    currentWindow.on('closed', () => { clearTimeout(loginTimer); if (win === currentWindow) win = null; void persistCookies(); });
    // Let the IPC return immediately while the user's official page loads.
    await currentWindow.loadURL(loginStatusPage('loading','正在连接蜗牛官方服务，请稍候。',LOGIN));
    loginTimer = setTimeout(() => showStatus('error','官方登录页面加载超时，请检查网络后重新加载。'),20000);
    void currentWindow.loadURL(LOGIN).catch(error => { if(active() && !aborted(error) && currentWindow.webContents.getURL()===LOGIN) showStatus('error','官方登录页面未能加载，请检查网络后重新加载。'); });
  }
  async function selectServer(value) {
    if (operation) throw new Error('签到处理中，请等待结果。');
    const options = await catalog();
    const matches = options.servers.filter(s => s.id === value?.serverId && s.groupId === value?.groupId && (!value?.optionKey || s.optionKey === value.optionKey));
    const selected = matches.length === 1 ? matches[0] : null;
    if (!selected) throw new Error('请从官方列表选择服务器。');
    const next = { serverId: selected.id, groupId: selected.groupId, optionKey: selected.optionKey };
    await fs.promises.mkdir(directory, { recursive: true });
    await fs.promises.writeFile(settingsFile + '.pending', JSON.stringify(next));
    await fs.promises.rename(settingsFile + '.pending', settingsFile);
    choice = next;
    return choice;
  }
  function sign(value) {
    if (operation) return operation;
    operation = (async () => {
      if (value?.confirm !== 'sign-selected-server' || !choice.serverId || value.serverId !== choice.serverId) throw new Error('请确认要签到的服务器。');
      if (win && !win.isDestroyed()) throw new Error('请先关闭官方登录窗口，再刷新状态并签到，避免操作中切换账号。');
      const before = await init();
      if (!loginResponse(before)) throw new Error('登录已失效，请重新完成官方验证。');
      const options = await catalog();
      if (!choice.optionKey || !options.servers.some(s => s.id === choice.serverId && s.groupId === choice.groupId && s.optionKey === choice.optionKey)) throw new Error('所选服务器已变化，请重新选择。');
      const response = await activityScheduler(()=>request(`https://gwactv2.woniu.com/9yin/H220519/sign?server_id=${encodeURIComponent(choice.serverId)}&jsoncallback=synapsexSignin`));
      initCache=null;
      lastResult = { success: String(response.msgcode) === '1', message: cleanMessage(response.msg) || (String(response.msgcode) === '1' ? '官方返回签到成功，请查看累计天数。' : '官方未接受签到请求。'), code: String(response.msgcode || ''), at: new Date().toISOString(), serverId: choice.serverId };
      await persistCookies();
      return lastResult;
    })().finally(() => { operation = null; });
    return operation;
  }
  async function forget(value) {
    if (value?.confirm !== 'forget-local-login') throw new Error('请确认清除本地登录状态。');
    if (operation) throw new Error('请等待签到请求结束。');
    invalidateAuth();
    await ready;
    suspended = true; clearTimeout(timer);
    if (win && !win.isDestroyed()) win.destroy();
    await queue;
    try {
      await ses.clearStorageData();
      await ses.cookies.flushStore();
      for (const file of [cookieFile, cookieFile + '.pending']) await fs.promises.rm(file, { force: true });
      lastResult = null; storageError = ''; windowError = '';
    } finally { suspended = false; }
  }
  async function shutdown() {
    closing = true; clearTimeout(timer); clearTimeout(loginTimer);
    ipcMain?.removeListener('community:login-name', receiveName);
    for (const request of requests) request.abort();
    if (win && !win.isDestroyed()) win.destroy();
    if (operation) await operation.catch(() => {});
    await ready;
    await persistCookies();
  }
  return { openLogin, state, catalog, selectServer, sign, forget, shutdown, loginIsOpen: () => !!win && !win.isDestroyed(), loginError: () => windowError };
}
module.exports = { createCommunitySignin, officialUrl, parseResponse, cookieDetails, realmOption, cleanAccountName, LOGIN };

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createCommunitySignin, cleanAccountName } = require('./community-signin.cjs');
const { alreadyToday } = require('./community-status.cjs');

// Dates follow the activity's China timezone, not the user's Windows timezone.
const chinaDay = (date = new Date()) => new Date(new Date(date).getTime() + 8 * 3600000).toISOString().slice(0, 10);
const validId = id => typeof id === 'string' && /^(legacy|[a-f0-9-]{36})$/.test(id);
const label = value => typeof value === 'string' ? value.trim().replace(/[\x00-\x1f<>]/g, '').slice(0, 40) : '';

function createCommunityAccounts(deps, factory = createCommunitySignin, now = () => new Date()) {
  const directory = path.join(deps.app.getPath('userData'), 'community-signin');
  const file = path.join(directory, 'accounts.json');
  let model = { version: 1, autoSign: false, accounts: [{ id: 'legacy', name: '', accountName: '', enabled: true }] };
  let diskError = '', busy = false, closing = false, batchPromise = null, activeOperation = null, started = false;
  let progress = null;
  const services = new Map();
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (saved.version !== 1 || !Array.isArray(saved.accounts) || saved.accounts.length > 30 || new Set(saved.accounts.map(a => a.id)).size !== saved.accounts.length || saved.accounts.some(a => !validId(a.id))) throw new Error('Invalid account index');
    model = { version: 1, autoSign: saved.autoSign === true, accounts: saved.accounts.map(a => ({ ...a, name: a.id === 'legacy' && a.name === '默认账号' ? '' : label(a.name), accountName: cleanAccountName(a.accountName || a.state?.accountName), enabled: a.enabled === true })) };
  } catch (e) { if (e.code !== 'ENOENT') diskError = '账号列表读取失败。已停止自动签到，请恢复 accounts.json 后重启，避免覆盖原记录。'; }
  const get = id => { const a = model.accounts.find(a => a.id === id); if (!a) throw new Error('账号不存在，请刷新列表。'); return a; };
  const accountLimit = () => deps.getAccountLimit ? deps.getAccountLimit() : 1;
  const allowed = a => model.accounts.indexOf(a) < accountLimit();
  const requireSlot = a => { if (!allowed(a)) throw new Error(`当前可使用 ${accountLimit()} 个签到账号；超额账号已保留，VIP 最多 3 个。可移除不需要的账号释放位置。`); };
  const service = id => { get(id); if (!services.has(id)) services.set(id, factory({ ...deps, profileId: id, getProfileName: () => get(id).name || get(id).accountName || '登录账号', onLoginVerified: async (next,isCurrent=()=>true) => {
    if(activeOperation) await activeOperation.catch(()=>{});
    if(closing || !isCurrent() || !model.accounts.some(a=>a.id===id)) return;
    await exclusive(async()=>{if(!isCurrent())return;const a=get(id); mergeState(a,next); await save();});
  } })); return services.get(id); };
  async function save() {
    if (diskError) throw new Error(diskError);
    await fs.promises.mkdir(directory, { recursive: true });
    await fs.promises.writeFile(file + '.pending', JSON.stringify(model, null, 2));
    await fs.promises.rename(file + '.pending', file);
  }
  function todayStatus(a) {
    // A session expiring does not undo today's confirmed sign-in.
    if (a.receipt?.date === chinaDay(now()) && a.receipt.serverId === a.state?.choice?.serverId) return 'signed';
    const result=a.state?.lastResult;
    if(result && result.serverId===a.state?.choice?.serverId && (result.success || alreadyToday(result.message)) && Number.isFinite(Date.parse(result.at)) && chinaDay(result.at)===chinaDay(now())) return 'signed';
    if (service(a.id).loginIsOpen()) return 'login';
    if (!a.state?.choice?.optionKey) return 'configure';
    if (a.state?.loggedIn === false) return 'login';
    if (a.error) return 'error';
    return 'pending';
  }
  function accounts() {
    return { autoSign: model.autoSign, busy, progress, storageError: diskError, date: chinaDay(now()), accounts: model.accounts.map(a => ({ id: a.id, name: a.name, accountName: a.accountName || '', enabled: a.enabled, status: todayStatus(a), state: a.state ? { ...a.state, windowError: service(a.id).loginError?.() ?? a.state.windowError, loginOpen: service(a.id).loginIsOpen() } : null, error: a.error || '', receipt: a.receipt || null })) };
  }
  function exclusive(action) {
    if (busy || closing) return Promise.reject(new Error('签到任务处理中，请稍后再操作。'));
    if (diskError) return Promise.reject(new Error(diskError));
    busy = true;
    activeOperation = Promise.resolve().then(action).finally(() => { busy = false; activeOperation = null; });
    return activeOperation;
  }
  function mergeState(a,next) {
      if (next.loggedIn && next.accountName) {
        if (a.accountName && a.accountName !== next.accountName) { a.receipt = null; a.lastAttempt = null; if(a.state)a.state.lastResult=null; }
        if(a.previousIdentity) {
          if(a.previousIdentity.accountName===next.accountName) a.receipt=a.previousIdentity.receipt;
          a.previousIdentity=null;
        }
        a.accountName = next.accountName;
      }
      a.state = { ...next, records: next.loggedIn ? next.records : a.state?.records || [], countsCheckedAt: next.loggedIn ? next.checkedAt : a.state?.countsCheckedAt || a.state?.checkedAt || '', lastResult: next.lastResult || a.state?.lastResult || null }; a.error = '';
      const result=a.state.lastResult;
      if(result && result.serverId===next.choice?.serverId && (result.success || alreadyToday(result.message)) && Number.isFinite(Date.parse(result.at)) && chinaDay(result.at)===chinaDay(now())) {
        a.receipt={date:chinaDay(result.at),serverId:result.serverId,at:result.at};
      }
  }
  async function refreshOne(a) {
    try {
      const next = await service(a.id).state();
      mergeState(a,next);
    }
    catch (e) { a.error = e.message || '状态查询失败。'; }
  }
  const refreshAccounts = value => exclusive(async () => {
    const list = value?.accountId ? [get(value.accountId)] : model.accounts;
    for (const a of list) { if (closing) break; await refreshOne(a); }
    await save(); return accounts();
  });
  const addAccount = value => exclusive(async () => {
    if (model.accounts.length >= accountLimit()) throw new Error(`当前最多保存 ${accountLimit()} 个签到账号。免费 1 个，VIP 3 个。`);
    const name = label(value?.name);
    const a = { id: randomUUID(), name, accountName: '', enabled: true };
    model.accounts.push(a);
    try { await save(); } catch (e) { model.accounts.pop(); throw e; }
    return { accountId: a.id, ...accounts() };
  });
  const updateAccount = value => exclusive(async () => {
    const a = get(value?.accountId), old = { ...a };
    if (value.name !== undefined) a.name = label(value.name);
    if (value.enabled !== undefined) { if (typeof value.enabled !== 'boolean') throw new Error('无效的账号选项。'); a.enabled = value.enabled; }
    try { await save(); } catch (e) { Object.assign(a, old); throw e; } return accounts();
  });
  const settings = value => exclusive(async () => {
    if (typeof value?.autoSign !== 'boolean' || (value.autoSign && value.confirm !== 'enable-startup-sign')) throw new Error('请确认开启启动签到。');
    const old = model.autoSign; model.autoSign = value.autoSign;
    try { await save(); } catch (e) { model.autoSign = old; throw e; } return accounts();
  });
  const openLogin = value => exclusive(async () => {
    const a = get(value?.accountId || 'legacy');
    requireSlot(a);
    // A new login can change the real account inside the official session. Never
    // carry the previous identity's receipt/count across that boundary.
    a.previousIdentity = a.accountName ? {accountName:a.accountName,receipt:a.receipt} : null;
    a.receipt = null;
    a.accountName = '';
    a.state = { loggedIn: false, message: '', checkedAt: '', choice: a.state?.choice || {serverId:'', groupId:''}, records: [], lastResult: null, storageError: '', windowError: '', loginOpen: true };
    a.error = ''; a.lastAttempt = null;
    await save(); await service(a.id).openLogin(); return accounts();
  });
  const selectServer = value => exclusive(async () => {
    const a = get(value?.accountId || 'legacy');
    await service(a.id).selectServer(value); await refreshOne(a); await save(); return accounts();
  });
  const forget = value => exclusive(async () => {
    const a = get(value?.accountId || 'legacy');
    await service(a.id).forget(value);
    a.receipt = null; a.lastAttempt = null; a.state = null; a.error = ''; a.enabled = false;
    await save(); return accounts();
  });
  const removeAccount = value => exclusive(async () => {
    if (value?.confirm !== 'remove-local-account') throw new Error('请确认移除本地账号。');
    const a = get(value.accountId);
    await service(a.id).forget({ confirm: 'forget-local-login' });
    await service(a.id).shutdown(); services.delete(a.id);
    // Credential removal is deliberately completed before removing the index.
    const old = model.accounts; model.accounts = old.filter(row => row.id !== a.id);
    try { await save(); } catch (e) { model.accounts = old; a.state = null; a.receipt = null; throw e; }
    return accounts();
  });
  async function signOne(a, automatic) {
    if (!allowed(a)) { a.error = `超出当前 ${accountLimit()} 个账号额度，数据已保留。`; return; }
    if (service(a.id).loginIsOpen()) { a.error = '请关闭该账号的官方登录窗口，再刷新登录状态。'; return; }
    await refreshOne(a);
    if (a.error) return;
    if (!a.state.loggedIn) { a.error = '登录已失效，请完成官方验证。'; return; }
    const choice = a.state.choice;
    if (!choice.optionKey) { a.error = '请先为该账号保存签到区服。'; return; }
    if (todayStatus(a) === 'signed') return;
    const date = chinaDay(now());
    if (automatic && a.lastAttempt?.date === date && a.lastAttempt.serverId === choice.serverId) { a.error = '今天已自动尝试过，未确认成功。请刷新核对后手动签到。'; return; }
    // Persist BEFORE issuing the request so a crash/restart cannot auto-retry an
    // uncertain submission. Accumulated days alone never prove signed today.
    a.lastAttempt = { date, serverId: choice.serverId };
    await save();
    try {
      const result = await service(a.id).sign({ confirm: 'sign-selected-server', serverId: choice.serverId });
      a.state.lastResult = result;
      const confirmed = result.success || alreadyToday(result.message);
      if (confirmed && chinaDay(now()) === date) a.receipt = { date, serverId: choice.serverId, at: result.at };
      a.error = confirmed ? '' : result.message;
      const resultError = a.error;
      await save();
      await refreshOne(a);
      if (resultError) a.error = resultError;
      // Keep the exact official total; a failed refresh leaves the old timestamp
      // visible instead of inventing +1 or a lifetime/continuous count.
    } catch (e) { a.error = e.message || '签到结果未确认，请刷新核对。'; }
  }
  function batch(value, automatic = false) {
    if (batchPromise) return batchPromise;
    if (!automatic && value?.confirm !== 'sign-selected-accounts') return Promise.reject(new Error('请确认所选账号签到。'));
    const ids = automatic ? model.accounts.filter(a => a.enabled).map(a => a.id) : value?.accountIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > 30 || ids.some(id => !model.accounts.some(a => a.id === id))) return Promise.reject(new Error('请选择有效账号。'));
    const selected = [...new Set(ids)];
    batchPromise = exclusive(async () => {
      progress = { total: selected.length, completed: 0, current: '', automatic };
      for (const id of selected) {
        if (closing) break;
        const a = get(id); progress.current = a.name || a.accountName || '登录账号';
        try { await signOne(a, automatic); } catch (e) { a.error = e.message; }
        progress.completed++; await save();
      }
      progress.current = ''; return accounts();
    }).finally(() => { batchPromise = null; });
    return batchPromise;
  }
  function startup() {
    if (started || closing || diskError) return Promise.resolve(); started = true;
    if (!model.autoSign || !model.accounts.some(a => a.enabled)) {
      // Import the old single-account session/selection without re-login and
      // without submitting anything. Subsequent boots use the saved snapshot.
      if (model.accounts.length === 1 && model.accounts[0].id === 'legacy' && !model.accounts[0].state) return refreshAccounts({accountId:'legacy'}).catch(e => { diskError = e.message; });
      return Promise.resolve();
    }
    return batch(null, true).catch(e => { diskError = `自动签到未完成：${e.message}`; });
  }
  async function shutdown() {
    closing = true;
    await Promise.allSettled([...services.values()].map(s => s.shutdown()));
    await activeOperation?.catch(() => {});
  }
  const catalog = () => {
    if (!model.accounts.length) return Promise.resolve({groups:[],servers:[]});
    return service(model.accounts[0].id).catalog();
  };
  return { accounts, refreshAccounts, addAccount, updateAccount, settings, openLogin, selectServer, forget, removeAccount, batch, startup, shutdown, catalog };
}
module.exports = { createCommunityAccounts, chinaDay, alreadyToday };

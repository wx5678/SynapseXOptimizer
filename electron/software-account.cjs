const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  validateConfig,
  verifyLicense,
  deviceIdentity,
} = require("./licensing.cjs");
const messages = {
  account_device_bound:'此账号已绑定另一台电脑，请联系管理员换绑设备。',
  invalid_credentials: "账号或密码不正确，或账号已停用。",
  invalid_account_input:
    "账号为 4–32 位字母、数字或 ._-，以字母开头；密码为 12–128 位。",
  username_unavailable: "该账号已被使用，请换一个账号。",
  registration_closed: "暂未开放注册，请联系管理员。",
  unauthorized: "登录已失效，请重新登录。",
  account_rate_limited: "尝试过于频繁，请 10 分钟后重试。",
  rate_limited: "请求过于频繁，请稍后重试。",
  license_unavailable: "授权码无效、已过期或已撤销。",
  code_already_claimed: "该授权码已归属其他账号。",
  existing_entitlement: "账号已有授权，请联系管理员延期。",
  legacy_code_in_use:
    "此旧授权码已有绑定设备，请联系管理员处理，不会覆盖原授权。",
};
const states = {
  unlicensed: "账号已登录，等待管理员开通授权。",
  active: "账号授权已同步。",
  expired: "账号授权已到期，请联系管理员延期。",
  revoked: "账号授权已撤销。",
  device_limit: "已达到授权设备上限，请联系管理员解绑旧设备。",
};
function createSoftwareAccount({
  app,
  safeStorage,
  config: supplied,
  deviceHash: suppliedHash,
  fetchImpl = globalThis.fetch,
  now = () => Math.floor(Date.now() / 1000),
}) {
  const directory = app.getPath("userData"),
    file = path.join(directory, "software-account.enc");
  fs.mkdirSync(directory, { recursive: true });
  let config = null,
    configError = "",
    deviceHash = "",
    queue = Promise.resolve(),
    timer = null;
  try {
    let input = supplied || require("./license-config.json");
    if (!supplied && !app.isPackaged && process.env.SYNAPSEX_LICENSE_DEV_CONFIG)
      input = JSON.parse(
        fs.readFileSync(process.env.SYNAPSEX_LICENSE_DEV_CONFIG, "utf8"),
      );
    config = validateConfig(input, app.isPackaged);
  } catch {
    configError = "账号服务配置无效。";
  }
  const identity = () =>
    (deviceHash ||= suppliedHash || deviceIdentity(directory));
  const ready = () =>
    safeStorage.isEncryptionAvailable() &&
    safeStorage.getSelectedStorageBackend?.() !== "basic_text";
  function read() {
    if (!fs.existsSync(file)) return {};
    if (!ready()) throw Error("本机安全存储不可用。");
    try {
      return JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));
    } catch {
      throw Error("本机账号凭据无法读取，请退出账号后重新登录。");
    }
  }
  function save(value) {
    if (!ready()) throw Error("本机安全存储不可用，未保存登录凭据。");
    const temp = file + "." + crypto.randomUUID() + ".tmp";
    try {
      fs.writeFileSync(temp, safeStorage.encryptString(JSON.stringify(value)), {
        flag: "wx",
        mode: 0o600,
      });
      fs.renameSync(temp, file);
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
  }
  function state() {
    const base = {
      configured: !!config,
      enforcement: true,
      status: "logged_out",
      message: configError || "登录软件账号，查看与同步授权。",
      features: [],
      administrator: false,
      user: null,
    };
    if (!config) return { ...base, status: "unconfigured" };
    try {
      const stored = read();
      if (!stored.token || stored.sessionExpires <= now())
        return {
          ...base,
          message:
            stored.message ||
            (stored.user ? "登录已过期，请重新登录。" : base.message),
        };
      const result = {
        ...base,
        user: stored.user,
        status: stored.status || "unlicensed",
        message: stored.message || states[stored.status] || states.unlicensed,
        lastChecked: stored.lastChecked || null,
        expiresAt: stored.expiresAt || null,
        vipStatus: stored.vipStatus || 'unknown',
      };
      if (stored.license) {
        const claims = verifyLicense(
          stored.license,
          config,
          identity(),
          now(),
          true,
        );
        if (claims.user_id !== stored.user?.id)
          throw Error("授权不属于当前账号，请重新登录。");
        const invalid =
          claims.exp <= now() || now() + 60 < (stored.lastObserved || 0);
        Object.assign(result, {
          status: invalid ? "expired" : result.status,
          features: invalid ? [] : claims.features,
          licenseId: claims.license_id,
          expiresAt: claims.license_expires_at,
          offlineUntil: claims.exp,
          administrator: !invalid && result.status === 'active' && claims.account_role === 'admin',
        });
        if (result.administrator) result.expiresAt = stored.expiresAt || null;
        if (invalid)
          result.message = "离线凭证已到期或系统时间异常，请联网同步授权。";
      }
      return result;
    } catch (e) {
      return { ...base, status: "invalid", message: e.message };
    }
  }
  async function request(route, data, token) {
    if (!config) throw Error("账号服务尚未配置。");
    let response;
    try {
      response = await fetchImpl(config.endpoint + "/v1/account/" + route, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: JSON.stringify({ ...data, device_hash: identity() }),
        redirect: "error",
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw Error("无法连接账号服务器，请检查网络后重试。");
    }
    const text = await response.text();
    if (text.length > 32768) throw Error("账号服务器响应异常。");
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      throw Error("账号服务器响应异常。");
    }
    if (!response.ok) {
      const error = Error(messages[result.error] || "操作失败，请稍后重试。");
      error.status = response.status;
      error.code = result.error;
      throw error;
    }
    return result;
  }
  function locked(fn) {
    const work = queue.then(fn);
    queue = work.catch(() => {});
    return work;
  }
  async function synchronize(route = "sync", extra = {}) {
    const stored = read();
    if (!stored.token) throw Error("请先登录软件账号。");
    try {
      const result = await request(route, extra, stored.token);
      if (
        result.user?.id !== stored.user?.id ||
        !Object.hasOwn(states, result.status)
      )
        throw Error("账号服务器响应异常。");
      if (result.license) {
        const claims = verifyLicense(result.license, config, identity(), now());
        if (claims.user_id !== stored.user.id)
          throw Error("授权不属于当前账号。");
      }
      save({
        ...stored,
        user: result.user,
        license: result.license || null,
        sessionExpires:Number.isSafeInteger(result.session_expires_at)?result.session_expires_at:stored.sessionExpires,
        expiresAt:result.license_expires_at ?? null,
        status: result.status,
        vipStatus: ['none','revoked','expired','active'].includes(result.vip_status) ? result.vip_status : 'unknown',
        lastChecked: now(),
        lastObserved: Math.max(stored.lastObserved || 0, now()),
        message: states[result.status],
      });
    } catch (e) {
      save(
        e.status === 401 || e.code === 'account_device_bound'
          ? { message: e.message }
          : { ...stored, lastChecked: now(), message: e.message },
      );
      throw e;
    }
    return state();
  }
  function authenticate(route, value) {
    return locked(async () => {
      if (!ready()) throw Error("本机安全存储不可用，未提交账号或密码。");
      const previous = read();
      if (previous.token && previous.sessionExpires > now())
        throw Error("请先退出当前账号。");
      if (
        !value ||
        typeof value.username !== "string" ||
        (!(route === "login" && value.username === "1") && !/^[A-Za-z][A-Za-z0-9_.-]{3,31}$/.test(value.username)) ||
        typeof value.password !== "string" ||
        value.password.length < (route === "login" && value.username === "1" ? 1 : 12) ||
        value.password.length > 128
      )
        throw Error(messages.invalid_account_input);
      const result = await request(route, {
        username: value.username,
        password: value.password,
      });
      if (
        typeof result.session_token !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(result.session_token) ||
        typeof result.user?.id !== "string" ||
        typeof result.user?.username !== "string" ||
        !Number.isSafeInteger(result.session_expires_at)
      )
        throw Error("账号服务器响应异常。");
      save({
        token: result.session_token,
        user: result.user,
        sessionExpires: result.session_expires_at,
        status: "unlicensed",
        lastObserved: now(),
      });
      // Login remains successful if the following entitlement request temporarily fails.
      try {
        await synchronize();
      } catch {}
      return state();
    });
  }
  function logout() {
    return locked(async () => {
      let stored;
      try {
        stored = read();
      } catch {
        stored = {};
      }
      let message = "已退出软件账号，本机登录与账号授权凭据已清除。";
      try {
        if (stored.token) await request("logout", {}, stored.token);
      } catch (e) {
        if (e.status !== 401)
          message = "已清除本机登录；网络异常，服务器会话注销未确认。";
      }
      save({ message });
      return state();
    });
  }
  function start() {
    if (!config || timer) return;
    const check = () => {
      try {
        const s = read();
        if (
          s.token &&
          s.sessionExpires > now() &&
          now() - (s.lastChecked || 0) >= 120
        )
          void locked(() => synchronize()).catch(() => {});
      } catch {}
    };
    timer = setInterval(check, 60000);
    timer.unref?.();
    check();
  }
  function stop() {
    clearInterval(timer);
    timer = null;
  }
  return {
    state,
    login: (value) => authenticate("login", value),
    register: (value) => authenticate("register", value),
    sync: () => locked(() => synchronize()),
    logout,
    redeem: (code) =>
      locked(() => {
        if (typeof code !== "string" || !/^SX-[A-F0-9]{40}$/.test(code))
          throw Error("请输入完整授权码。");
        return synchronize("redeem", { activation_code: code });
      }),
    start,
    stop,
  };
}
module.exports = { createSoftwareAccount };

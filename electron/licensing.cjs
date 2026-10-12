// Credentials stay in the main process, encrypted by Windows DPAPI via safeStorage.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");
const errorMessages = {
  license_unavailable: "授权已到期或被撤销。",
  device_limit_reached: "已达到设备数量上限，请先解绑其他设备。",
  unauthorized: "授权凭据已失效，请重新激活。",
  rate_limited: "请求过于频繁，请稍后再试。",
  invalid_request: "授权码格式不正确。",
};
function validateConfig(input, packaged) {
  if (!input?.endpoint || !input?.publicKey) return null;
  const url = new URL(input.endpoint);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["", "/"].includes(url.pathname)
  )
    throw Error("授权服务器配置无效。");
  if (
    url.protocol !== "https:" &&
    (packaged ||
      url.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
  )
    throw Error("授权连接必须使用 HTTPS。");
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.publicKey))
    throw Error("授权公钥配置无效。");
  const raw = Buffer.from(input.publicKey, "base64url");
  if (raw.length !== 32) throw Error("授权公钥配置无效。");
  return {
    endpoint: url.origin,
    publicKey: input.publicKey,
    kid: hash(raw).slice(0, 24),
    key: crypto.createPublicKey({
      key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), raw]),
      format: "der",
      type: "spki",
    }),
  };
}
function verifyLicense(
  token,
  config,
  deviceHash,
  now = Math.floor(Date.now() / 1000),
  allowExpired = false,
) {
  try {
    if (typeof token !== "string" || token.length > 16384) throw Error();
    const parts = token.split(".");
    if (
      parts.length !== 3 ||
      parts.some((p) => !p || !/^[A-Za-z0-9_-]+$/.test(p))
    )
      throw Error();
    const header = JSON.parse(Buffer.from(parts[0], "base64url"));
    if (
      header.alg !== "EdDSA" ||
      header.typ !== "JWT" ||
      header.kid !== config.kid
    )
      throw Error();
    if (
      !crypto.verify(
        null,
        Buffer.from(parts[0] + "." + parts[1]),
        config.key,
        Buffer.from(parts[2], "base64url"),
      )
    )
      throw Error();
    const value = JSON.parse(Buffer.from(parts[1], "base64url"));
    if (
      value.iss !== "synapsex-license" ||
      value.aud !== "synapsex-desktop" ||
      value.version !== 1 ||
      value.device_hash !== deviceHash
    )
      throw Error();
    for (const key of ["iat", "nbf", "exp", "license_expires_at"])
      if (!Number.isSafeInteger(value[key])) throw Error();
    if (
      value.nbf > now + 60 ||
      value.iat > now + 60 ||
      value.exp <= value.iat ||
      value.exp > value.license_expires_at ||
      value.exp - value.iat > 7 * 86400 ||
      value.nbf !== value.iat
    )
      throw Error();
    if (!allowExpired && value.exp <= now) throw Error();
    if (
      typeof value.license_id !== "string" ||
      typeof value.device_id !== "string" ||
      !Array.isArray(value.features) ||
      !value.features.length ||
      value.features.some(
        (f) => typeof f !== "string" || !/^[a-z][a-z0-9_.-]{0,63}$/.test(f),
      )
    )
      throw Error();
    return value;
  } catch {
    throw Error("授权签名或有效期校验失败，请刷新授权并检查系统时间。");
  }
}
function deviceIdentity(directory) {
  if (process.platform === "win32") {
    const exe = path.join(
      process.env.SystemRoot || "C:\\Windows",
      "System32",
      "reg.exe",
    );
    const output = execFileSync(
      exe,
      [
        "query",
        "HKLM\\SOFTWARE\\Microsoft\\Cryptography",
        "/v",
        "MachineGuid",
        "/reg:64",
      ],
      { encoding: "utf8", windowsHide: true, timeout: 5000 },
    );
    const guid = output.match(/MachineGuid\s+REG_SZ\s+([a-f0-9-]{36})/i)?.[1];
    if (!guid) throw Error("无法读取本机设备标识，未提交授权请求。");
    return hash("synapsex-device-v1:" + guid.toLowerCase());
  }
  // Non-Windows development only. This is an installation identifier, not a hardware attestation.
  const file = path.join(directory, "license-installation-id");
  if (!fs.existsSync(file))
    fs.writeFileSync(file, crypto.randomUUID(), { flag: "wx", mode: 0o600 });
  return hash("synapsex-development-v1:" + fs.readFileSync(file, "utf8"));
}
function createLicensing({
  app,
  safeStorage,
  fetchImpl = globalThis.fetch,
  config: provided,
  deviceHash: providedHash,
  now = () => Math.floor(Date.now() / 1000),
}) {
  const directory = app.getPath("userData");
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, "license-state.enc");
  let configError = "",
    config = null,
    deviceHash = "",
    queue = Promise.resolve(),
    timer = null;
  try {
    let input = provided || require("./license-config.json");
    if (!provided && !app.isPackaged && process.env.SYNAPSEX_LICENSE_DEV_CONFIG)
      input = JSON.parse(
        fs.readFileSync(process.env.SYNAPSEX_LICENSE_DEV_CONFIG, "utf8"),
      );
    config = validateConfig(input, app.isPackaged);
  } catch {
    configError = "授权服务配置无效，请联系软件提供方。";
  }
  function identity() {
    return (deviceHash ||= providedHash || deviceIdentity(directory));
  }
  function encryptionReady() {
    return (
      safeStorage.isEncryptionAvailable() &&
      safeStorage.getSelectedStorageBackend?.() !== "basic_text"
    );
  }
  function readStore() {
    if (!fs.existsSync(file)) return {};
    if (!encryptionReady()) throw Error("本机安全存储不可用，无法读取授权。");
    try {
      return JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));
    } catch {
      throw Error("本机授权文件无法解密，请重新激活。");
    }
  }
  function saveStore(value) {
    if (!encryptionReady()) throw Error("本机安全存储不可用，未保存授权凭据。");
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
      configured: Boolean(config),
      enforcement: true,
      endpoint: config?.endpoint || "",
      status: "unconfigured",
      message: configError || "授权服务尚未开放，现有功能可正常使用。",
      features: [],
    };
    if (!config) return base;
    try {
      const saved = readStore();
      if (!saved.license)
        return {
          ...base,
          status: "inactive",
          message: saved.lastError || "免费版可直接使用；VIP 功能需要有效授权。",
        };
      const claims = verifyLicense(
        saved.license,
        config,
        identity(),
        now(),
        true,
      );
      const rollback = now() + 60 < (saved.lastObserved || 0);
      const expired = claims.exp <= now();
      return {
        ...base,
        status: rollback ? "clock_error" : expired ? "expired" : "active",
        licenseId: claims.license_id,
        expiresAt: claims.license_expires_at,
        offlineUntil: claims.exp,
        lastChecked: saved.lastChecked || null,
        lastSuccess: saved.lastSuccess || null,
        features: rollback || expired ? [] : claims.features,
        message: rollback
          ? "系统时间早于上次验证，请校准时间后刷新。"
          : saved.lastError ||
            (expired
              ? "离线凭证已到期，请联网刷新授权。"
              : "授权已验证，功能权限以服务器签发的标识为准。"),
      };
    } catch (e) {
      return { ...base, status: "invalid", message: e.message };
    }
  }
  async function request(route, payload, token) {
    let response;
    try {
      response = await fetchImpl(config.endpoint + "/v1/licenses/" + route, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: JSON.stringify(payload),
        redirect: "error",
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw Error("无法连接授权服务器；已有凭证在有效期内仍可使用。");
    }
    const text = await response.text();
    if (text.length > 32768) throw Error("授权服务器响应异常。");
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      throw Error("授权服务器响应异常。");
    }
    if (!response.ok) {
      const error = Error(
        errorMessages[value.error] || "授权服务暂不可用，请稍后重试。",
      );
      error.status = response.status;
      throw error;
    }
    return value;
  }
  function locked(fn) {
    const work = queue.then(fn);
    queue = work.catch(() => {});
    return work;
  }
  async function activate(code) {
    return locked(async () => {
      if (!config) throw Error("授权服务尚未配置。");
      if (!encryptionReady())
        throw Error("本机安全存储不可用，未提交激活请求。");
      if (typeof code !== "string" || !/^SX-[A-F0-9]{40}$/.test(code.trim()))
        throw Error("请输入完整的 SX- 开头授权码。");
      // Prevent silently orphaning a slot from a different license. Explicitly deactivate first.
      const current = state();
      if (current.status === "active")
        throw Error("请先解除本机授权，再激活其他授权码。");
      const result = await request("activate", {
        activation_code: code.trim(),
        device_hash: identity(),
      });
      verifyLicense(result.license, config, identity(), now());
      if (
        typeof result.refresh_token !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(result.refresh_token)
      )
        throw Error("授权服务器响应异常。");
      saveStore({
        license: result.license,
        refreshToken: result.refresh_token,
        lastChecked: now(),
        lastSuccess: now(),
        lastObserved: now(),
      });
      return state();
    });
  }
  async function refresh() {
    return locked(async () => {
      if (!config) throw Error("授权服务尚未配置。");
      const saved = readStore();
      if (!saved.refreshToken) throw Error("请先输入授权码激活。");
      try {
        const result = await request(
          "refresh",
          { device_hash: identity() },
          saved.refreshToken,
        );
        verifyLicense(result.license, config, identity(), now());
        saveStore({
          ...saved,
          license: result.license,
          lastChecked: now(),
          lastSuccess: now(),
          lastObserved: Math.max(saved.lastObserved || 0, now()),
          lastError: "",
        });
      } catch (e) {
        saveStore({
          ...(e.status === 401 || e.status === 403 ? {} : saved),
          lastChecked: now(),
          lastObserved: Math.max(saved.lastObserved || 0, now()),
          lastError: e.message,
        });
        throw e;
      }
      return state();
    });
  }
  async function deactivate() {
    return locked(async () => {
      if (!config) throw Error("授权服务尚未配置。");
      const saved = readStore();
      if (saved.refreshToken)
        await request(
          "deactivate",
          { device_hash: identity() },
          saved.refreshToken,
        );
      saveStore({ lastObserved: now() });
      return state();
    });
  }
  function start() {
    if (!config || timer) return;
    const check = () => {
      try {
        const saved = readStore();
        if (saved.refreshToken && now() - (saved.lastChecked || 0) >= 86400)
          void refresh().catch(() => {});
      } catch {
        /* Surface unreadable credentials in settings, never block app startup. */
      }
    };
    timer = setInterval(check, 15 * 60 * 1000);
    timer.unref?.();
    check();
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }
  return { state, activate, refresh, deactivate, start, stop };
}
module.exports = {
  createLicensing,
  validateConfig,
  verifyLicense,
  deviceIdentity,
};

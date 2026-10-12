// Signed public settings. The renderer never chooses a URL, file path or checksum.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { validateConfig } = require("./licensing.cjs");
const versionParts = (value) => {
  if (typeof value !== "string" || !/^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(value))
    throw Error("版本号无效");
  return value.split(".").map(Number);
};
function newer(a, b) {
  const x = versionParts(a),
    y = versionParts(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}
function downloadUrl(value) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    u.hash ||
    !(u.hostname === "gitee.com" || u.hostname.endsWith(".gitee.com"))
  )
    throw Error("安装包必须使用码云 HTTPS 下载地址");
  return u.href;
}
function verifyManifest(token, config, now, allowExpired = false) {
  if (typeof token !== "string" || token.length > 512 * 1024)
    throw Error("更新配置无效");
  const p = token.split(".");
  if (p.length !== 3 || p.some((v) => !v || !/^[\w-]+$/.test(v)))
    throw Error("更新配置无效");
  const h = JSON.parse(Buffer.from(p[0], "base64url"));
  if (
    h.alg !== "EdDSA" ||
    h.typ !== "JWT" ||
    h.kid !== config.kid ||
    !crypto.verify(
      null,
      Buffer.from(p[0] + "." + p[1]),
      config.key,
      Buffer.from(p[2], "base64url"),
    )
  )
    throw Error("更新配置签名校验失败");
  const v = JSON.parse(Buffer.from(p[1], "base64url"));
  if (
    v.iss !== "synapsex-product" ||
    v.aud !== "synapsex-desktop" ||
    !Number.isSafeInteger(v.iat) ||
    !Number.isSafeInteger(v.exp) ||
    v.iat > now + 60 ||
    v.exp <= v.iat ||
    v.exp - v.iat > 7 * 86400 ||
    (!allowExpired && v.exp <= now) ||
    !Number.isSafeInteger(v.revision) ||
    v.revision < 0
  )
    throw Error("更新配置已失效或系统时间不正确");
  const c = v.config,
    u = c?.update;
  if (
    !c ||
    !["month_fen", "year_fen"].every(
      (k) => Number.isSafeInteger(c[k]) && c[k] > 0 && c[k] <= 10000000,
    ) ||
    typeof c.wechat !== "string" ||
    c.wechat.length > 80 ||
    (c.service_text !== undefined && (typeof c.service_text !== "string" || c.service_text.length > 240)) ||
    typeof c.qr_data !== "string" ||
    c.qr_data.length > 280000 ||
    (c.qr_data && !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(c.qr_data))
  )
    throw Error("会员配置无效");
  if (
    !u ||
    typeof u.enabled !== "boolean" ||
    !["optional", "mandatory"].includes(u.mode) ||
    typeof u.notes !== "string" ||
    u.notes.length > 4000
  )
    throw Error("版本配置无效");
  versionParts(u.version);
  if (u.enabled) {
    downloadUrl(u.url);
    if (
      !/^[a-f\d]{64}$/i.test(u.sha256) ||
      !Number.isSafeInteger(u.size) ||
      u.size < 1 ||
      u.size > 2 * 1024 ** 3
    )
      throw Error("安装包校验信息缺失");
  }
  return v;
}
function createProductClient({
  app,
  shell,
  config: supplied,
  fetchImpl = globalThis.fetch,
  now = () => Math.floor(Date.now() / 1000),
}) {
  const config = validateConfig(
    supplied || require("./license-config.json"),
    app.isPackaged,
  );
  const directory = path.join(app.getPath("userData"), "updates"),
    cache = path.join(directory, "product-manifest.json");
  fs.mkdirSync(directory, { recursive: true });
  let manifest = null,
    token = "",
    checked = false,
    error = "",
    refreshing = null,
    downloading = null,
    timer = null;
  let downloadController = null, refreshController = null;
  let progress = { phase: "idle", received: 0, total: 0, message: "" },
    verifiedFile = null;
  try {
    const saved = JSON.parse(fs.readFileSync(cache, "utf8"));
    manifest = verifyManifest(saved.token, config, now(), true);
    token = saved.token;
  } catch {
    /* No unsigned fallback. */
  }
  function state() {
    const update = manifest?.config.update;
    const available =
      !!update?.enabled && newer(update.version, app.getVersion());
    return {
      configured: !!config,
      checked,
      checking: !!refreshing,
      error,
      config: manifest?.config || null,
      version: app.getVersion(),
      available,
      required: available && update.mode === "mandatory",
      progress: { ...progress },
    };
  }
  async function refresh() {
    if (refreshing) return refreshing;
    refreshController = new AbortController();
    refreshing = (async () => {
      try {
        if (!config) throw Error("尚未配置更新服务");
        const response = await fetchImpl(config.endpoint + "/v1/product", {
          redirect: "error",
          signal: AbortSignal.any([refreshController.signal,AbortSignal.timeout(20000)]),
        });
        if (response.status === 404) throw Error("服务器尚未提供会员与更新配置，请联系管理员升级服务");
        if (!response.ok) throw Error(`会员配置服务暂不可用（HTTP ${response.status}），请稍后刷新`);
        let size = 0;
        const chunks = [];
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > 600 * 1024) throw Error("更新配置过大");
          chunks.push(Buffer.from(chunk));
        }
        const nextToken = JSON.parse(Buffer.concat(chunks)).manifest,
          next = verifyManifest(nextToken, config, now());
        if (
          manifest &&
          (next.revision < manifest.revision || next.iat < manifest.iat)
        )
          throw Error("服务器返回了旧版配置，请稍后重试");
        const temp = cache + ".tmp";
        fs.writeFileSync(temp, JSON.stringify({ token: nextToken }), {
          mode: 0o600,
        });
        fs.renameSync(temp, cache);
        if (manifest?.config.update.sha256 !== next.config.update.sha256) {
          verifiedFile = null;
          if (!downloading)
            progress = { phase: "idle", received: 0, total: 0, message: "" };
        }
        manifest = next;
        token = nextToken;
        error = "";
      } catch (e) {
        error = e.message;
      } finally {
        checked = true;
        refreshing = null;
      }
      return state();
    })();
    return refreshing;
  }
  function requireAccess() {
    const s = state();
    if (!s.checked && !manifest) throw Error("正在检查版本，请稍后重试");
    if (s.required)
      throw Error("请先更新到 " + s.config.update.version + " 后继续使用");
  }
  async function download() {
    if (downloading) return downloading;
    downloadController = new AbortController();
    downloading = (async () => {
      let partial = "";
      try {
        await refresh();
        const s = state();
        if (!s.available) throw Error("暂无可下载的新版本");
        if (manifest.exp <= now())
          throw Error("更新配置已过期，请联网刷新后下载");
        const u = { ...manifest.config.update };
        let url = downloadUrl(u.url),
          response;
        progress = {
          phase: "downloading",
          received: 0,
          total: u.size,
          message: "连接码云…",
        };
        const signal = AbortSignal.any([downloadController.signal,AbortSignal.timeout(30 * 60 * 1000)]);
        for (let i = 0; i < 6; i++) {
          response = await fetchImpl(url, { redirect: "manual", signal });
          if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get("location");
            await response.body?.cancel();
            if (!location) throw Error("下载跳转地址缺失");
            url = downloadUrl(new URL(location, url).href);
            continue;
          }
          break;
        }
        if (!response?.ok) throw Error("安装包下载失败，请检查后台下载地址");
        const length = response.headers.get("content-length");
        if (length && Number(length) !== u.size)
          throw Error("安装包大小与后台配置不一致");
        const file = path.join(
          directory,
          "SynapseX-" + u.version + "-" + u.sha256.slice(0, 12) + ".exe",
        );
        partial = file + "." + crypto.randomUUID() + ".part";
        const handle = await fs.promises.open(partial, "wx", 0o600),
          hash = crypto.createHash("sha256");
        let magic = Buffer.alloc(0);
        try {
          for await (const raw of response.body) {
            const chunk = Buffer.from(raw);
            if (progress.received + chunk.length > u.size)
              throw Error("下载大小超出配置");
            if (magic.length < 2)
              magic = Buffer.concat([magic, chunk]).subarray(0, 2);
            hash.update(chunk);
            let offset = 0;
            while (offset < chunk.length) {
              const result = await handle.write(
                chunk,
                offset,
                chunk.length - offset,
              );
              offset += result.bytesWritten;
            }
            progress = {
              phase: "downloading",
              received: progress.received + chunk.length,
              total: u.size,
              message: "正在下载安装包",
            };
          }
          await handle.sync();
        } finally {
          await handle.close();
        }
        progress.phase = "verifying";
        progress.message = "校验安装包…";
        if (
          progress.received !== u.size ||
          hash.digest("hex") !== u.sha256.toLowerCase() ||
          magic.toString() !== "MZ"
        )
          throw Error("安装包校验失败，未提供运行入口");
        if (manifest.config.update.sha256 !== u.sha256)
          throw Error("版本配置已变化，请重新下载");
        await fs.promises.rename(partial, file);
        partial = "";
        verifiedFile = file;
        progress = {
          phase: "ready",
          received: u.size,
          total: u.size,
          message: "下载并校验完成。打开文件夹后退出旧版，运行新版。",
        };
      } catch (e) {
        progress = { ...progress, phase: "error", message: e.message };
      } finally {
        if (partial) await fs.promises.unlink(partial).catch(() => {});
        downloading = null;
      }
      return state();
    })();
    return downloading;
  }
  function showDownload() {
    if (!verifiedFile || progress.phase !== "ready")
      throw Error("请先下载并校验安装包");
    shell.showItemInFolder(verifiedFile);
    return true;
  }
  return {
    state,
    refresh,
    download,
    showDownload,
    requireAccess,
    start() {
      void refresh();
      timer = setInterval(() => void refresh(), 15 * 60 * 1000);
      timer.unref?.();
    },
    stop() {
      clearInterval(timer);
      refreshController?.abort();
      downloadController?.abort();
      return downloading;
    },
  };
}
module.exports = { createProductClient, verifyManifest, newer, downloadUrl };

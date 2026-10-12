const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {Readable, Transform} = require('node:stream');
const {pipeline} = require('node:stream/promises');
const run = promisify(execFile);
const RELEASE = Object.freeze({
  version: '2.2.0', size: 3410960,
  url: 'https://github.com/namazso/PawnIO.Setup/releases/download/2.2.0/PawnIO_setup.exe',
  sha256: '1f519a22e47187f70a1379a48ca604981c4fcf694f4e65b734aaa74a9fba3032',
});
function checkedUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(url.hostname))
    throw Error('驱动下载地址不在官方来源范围内，已停止。');
  return url.href;
}
async function downloadInstaller(file, fetchImpl = fetch) {
  let url = RELEASE.url, response;
  const signal = AbortSignal.timeout(90000);
  for (let redirects = 0; redirects <= 5; redirects++) {
    response = await fetchImpl(checkedUrl(url), {redirect:'manual', signal});
    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw Error('官方驱动下载跳转无效。');
      url = checkedUrl(new URL(location, url).href); continue;
    }
    break;
  }
  if (!response?.ok || !response.body) throw Error('无法下载官方驱动，请检查网络后重试。');
  // Chromium net.fetch follows redirects internally; still reject an unexpected
  // final host before consuming bytes. The executable is additionally pinned.
  if (response.url) checkedUrl(response.url);
  let size = 0; const hash = createHash('sha256');
  const verify = new Transform({transform(chunk, encoding, callback) {
    size += chunk.length;
    if (size > RELEASE.size) return callback(Error('驱动安装包大小异常，已停止。'));
    hash.update(chunk); callback(null,chunk);
  }});
  await pipeline(Readable.fromWeb(response.body),verify,fs.createWriteStream(file,{flags:'wx',mode:0o600}));
  if (size !== RELEASE.size || hash.digest('hex') !== RELEASE.sha256) throw Error('驱动安装包校验失败，未启动安装。');
}
function createSensorInstaller({directory, scriptPath, confirm, download = downloadInstaller, execute = run}) {
  let pending = null;
  async function install() {
    if (!await confirm()) return {status:'cancelled',message:'已取消，未下载或安装驱动。'};
    const root = path.resolve(directory);
    await fs.promises.mkdir(root,{recursive:true});
    const folder = await fs.promises.mkdtemp(path.join(root,'SynapseX-PawnIO-'));
    try {
      const file = path.join(folder,'PawnIO_setup.exe');
      try { await download(file); }
      catch (error) { throw new Error('无法下载或校验官方 CPU 温度驱动，请检查网络后重试，或打开官方说明。', {cause:error}); }
      // The fixed packaged script rechecks SHA-256 and Authenticode immediately
      // before launching the official interactive installer. No silent/EULA flags.
      let stdout;
      try { ({stdout} = await execute('powershell.exe',['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',scriptPath,'-InstallerPath',file],{windowsHide:true,maxBuffer:512*1024})); }
      catch (error) { throw new Error('官方驱动校验或安装未完成。请查看系统授权/安装窗口；若签名校验失败，请勿绕过保护，可打开官方说明核查。', {cause:error}); }
      const result = JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
      if (!['installed','reboot-required','cancelled','not-installed'].includes(result.status) || typeof result.message !== 'string') throw Error('无法确认驱动安装结果，请检查安装窗口。');
      return result;
    } finally {
      if (path.dirname(folder) === root && path.basename(folder).startsWith('SynapseX-PawnIO-')) await fs.promises.rm(folder,{recursive:true,force:true}).catch(()=>{});
    }
  }
  return {install:()=>pending ??= install().finally(()=>{pending=null;})};
}
module.exports = {RELEASE, checkedUrl, downloadInstaller, createSensorInstaller};

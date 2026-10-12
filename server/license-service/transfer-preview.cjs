// Temporary loopback-only clipboard bridge when Workbench's OSS uploader is unavailable.
// Serves only the reviewed release archive, never arbitrary paths or credentials.
const http = require('node:http');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const release = '0.4.1-20260915';
const file = path.resolve(__dirname, `../../artifacts/license-service-${release}.zip`);
const zip = fs.readFileSync(file);
const sha = crypto.createHash('sha256').update(zip).digest('hex');
const code = `import base64,hashlib,io,zipfile,sys; from pathlib import Path; b=base64.b64decode(sys.stdin.read()); assert hashlib.sha256(b).hexdigest()=='${sha}'; z=zipfile.ZipFile(io.BytesIO(b)); d=Path('/opt/synapsex-license/releases/${release}'); assert all(not Path(n).is_absolute() and '..' not in Path(n).parts and '\\\\' not in n for n in z.namelist()); d.mkdir(parents=True,exist_ok=False); z.extractall(d); print('RELEASE_TRANSFER_OK ${sha}')`;
// Stream the larger QR-bearing release via stdin instead of exceeding Linux's per-argument limit.
const command = 'python3 -c ' + "'" + code.replaceAll("'", "'\\''") + "' <<'SYNAPSEX_RELEASE_DATA'\n" + zip.toString('base64').match(/.{1,1024}/g).join('\n') + '\nSYNAPSEX_RELEASE_DATA';
const escape = text => text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const server=http.createServer((request,response)=>{if(request.url!=='/transfer'){response.writeHead(404);response.end();return;}response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"});response.end('<!doctype html><html lang="zh-CN"><title>发布包传输</title><h1>SynapseX 授权后台 0.2.1 发布包</h1><p>仅用于传输已审查的程序文件，不含数据库或私钥。SHA-256: '+sha+'</p><label>已校验的传输命令<textarea rows="16" cols="100" readonly>'+escape(command)+'</textarea></label></html>');});
server.listen(0,'127.0.0.1',()=>console.log('http://127.0.0.1:'+server.address().port+'/transfer'));

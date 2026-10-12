// Source-only patch transport, pinned to the previously deployed and reviewed source.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const prior = fs.readFileSync(path.join(root, 'state/admin-role-transfer-0.39.5.txt'), 'utf8');
const priorFiles = JSON.parse(zlib.gunzipSync(Buffer.from(prior.match(/b=base64.b64decode\('([^']+)'\)/)[1], 'base64')));
const names = ['accounts.py', 'manage.py', 'software_admin.py', 'test_accounts.py', 'app.py'];
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const files = Object.fromEntries(names.map(n => [n, Buffer.from(fs.readFileSync(path.join(root, 'server/license-service', n), 'utf8').replaceAll('\r\n','\n')).toString('base64')]));
const expected = Object.fromEntries(names.filter(n => priorFiles[n]).map(n => [n, sha(Buffer.from(priorFiles[n],'base64'))]));
const payload = zlib.gzipSync(Buffer.from(JSON.stringify({files, expected})), {level:9});
const release = '/opt/synapsex-license/releases/0.4.3-owner-' + sha(payload).slice(0,12);
const code = `import base64,gzip,json,pathlib,hashlib,shutil,subprocess
b=base64.b64decode('${payload.toString('base64')}')
assert hashlib.sha256(b).hexdigest()=='${sha(payload)}'
payload=json.loads(gzip.decompress(b))
previous=pathlib.Path('/opt/synapsex-license/current').resolve(strict=True)
assert previous.parent==pathlib.Path('/opt/synapsex-license/releases')
for name,expected in payload['expected'].items():
 assert hashlib.sha256((previous/name).read_bytes()).hexdigest()==expected, 'DEPLOYED_SOURCE_CHANGED: '+name
destination=pathlib.Path('${release}')
assert not destination.exists()
shutil.copytree(previous,destination,ignore=shutil.ignore_patterns('__pycache__','*.previous','previous-release.txt'))
for name,data in payload['files'].items():
 assert pathlib.PurePosixPath(name).name==name
 (destination/name).write_bytes(base64.b64decode(data))
print('PATCH_STAGED ${release}',flush=True)
subprocess.run(['sh',str(destination/'install.sh')],check=True)
print('OWNER_LOGIN_DEPLOYED',flush=True)
`;
const command = "python3 - <<'SYNAPSEX_OWNER_RELEASE'\n" + code + 'SYNAPSEX_OWNER_RELEASE';
const http = require('node:http');
const escape = s => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const server = http.createServer((req,res) => {
 if(req.url!=='/transfer'){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"});
 res.end('<!doctype html><title>Owner login source patch</title><label>Reviewed deployment command<textarea readonly rows="20" cols="110">'+escape(command)+'</textarea></label>');
});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({url:'http://127.0.0.1:'+server.address().port+'/transfer',release,expected,bytes:command.length})));

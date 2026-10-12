// Reviewed source-only release transport. No production data, credentials or game files.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../server/license-service');
const names=['app.py','accounts.py','admin.py','product.py','manage.py','verify_health.py','install.sh',
  'test_service.py','test_admin.py','test_accounts.py','test_product.py','test_proxy.py',
  'synapsex-license.service','synapsex-license-backup.service','synapsex-license-backup.timer',
  'admin-web/app.js','admin-web/index.html','admin-web/style.css','admin-web/product.js','public-assets/wechat.png'];
const files=Object.fromEntries(names.map(n=>[n,(n.endsWith('.png') ? fs.readFileSync(path.join(root,n)) : Buffer.from(fs.readFileSync(path.join(root,n),'utf8').replaceAll('\r\n','\n'))).toString('base64')]));
const zipped=zlib.gzipSync(Buffer.from(JSON.stringify(files)),{level:9}),sha=crypto.createHash('sha256').update(zipped).digest('hex');
const release='/opt/synapsex-license/releases/0.4.2-admin-'+sha.slice(0,12);
const code=`import base64,gzip,json,pathlib,hashlib\nb=base64.b64decode('${zipped.toString('base64')}')\nassert hashlib.sha256(b).hexdigest()=='${sha}'\nd=pathlib.Path('${release}')\nd.mkdir(parents=True,exist_ok=False)\nf=json.loads(gzip.decompress(b))\nfor name,data in f.items():\n p=d/name\n assert p.resolve().is_relative_to(d.resolve())\n p.parent.mkdir(parents=True,exist_ok=True)\n p.write_bytes(base64.b64decode(data))\nprint('UPLOAD_OK ${sha}')\n`;
const output=path.resolve(__dirname,'../state/admin-role-transfer-0.39.5.txt');
fs.writeFileSync(output,"python3 - <<'SYNAPSEX_RELEASE'\n"+code+"SYNAPSEX_RELEASE\n",{flag:'w'});
console.log(JSON.stringify({output,release,sha,commandBytes:fs.statSync(output).size}));

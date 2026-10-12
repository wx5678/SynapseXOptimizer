// Generate a transport command from the reviewed source files, not from local secrets.
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const names = ['app.py', 'manage.py', 'test_service.py', 'verify_health.py', 'install.sh',
  'synapsex-license.service', 'synapsex-license-backup.service', 'synapsex-license-backup.timer'];
const files = Object.fromEntries(names.map(name => [name, fs.readFileSync(path.join(root, name), 'utf8').replaceAll('\r\n', '\n')]));
const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(files)), {level:9});
const hash = crypto.createHash('sha256').update(compressed).digest('hex');
const remote = '/opt/synapsex-license/releases/0.1.0-' + hash.slice(0, 12);
const code = `import base64,gzip,json,pathlib,hashlib; b=base64.b64decode('${compressed.toString('base64')}'); assert hashlib.sha256(b).hexdigest()=='${hash}'; d=pathlib.Path('${remote}'); d.mkdir(parents=True,exist_ok=False); f=json.loads(gzip.decompress(b)); assert all(pathlib.PurePosixPath(n).name==n for n in f); [(d/n).write_text(v,encoding='utf-8') for n,v in f.items()]; print('UPLOAD_OK ${hash}')`;
const command = `python3 -c "${code}" && sh '${remote}/install.sh'`;
console.log(command);

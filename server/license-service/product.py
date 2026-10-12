"""Public signed merchandising/update manifest; mutations require administrator session and CSRF."""
import base64
import json
import re
import time
from pathlib import Path
from urllib.parse import urlsplit
from flask import jsonify, request, g
from app import connect, audit, b64

def defaults():
    qr=Path(__file__).with_name('public-assets')/'wechat.png'
    return dict(month_fen=990, year_fen=9900, wechat='Tens__', service_text='一对一系统优化 · 硬件超频调校，联系微信咨询。', qr_data='data:image/png;base64,'+base64.b64encode(qr.read_bytes()).decode() if qr.exists() else '', update=dict(enabled=False,version='0.0.0',mode='optional',url='',sha256='',size=0,notes=''))

def validate(value):
    if isinstance(value,dict) and 'service_text' not in value:
        value={**value,'service_text':defaults()['service_text']}
    if not isinstance(value,dict) or set(value)!=set(defaults()): raise ValueError('fields')
    if not isinstance(value['service_text'],str) or len(value['service_text'])>240 or any(ord(c)<32 for c in value['service_text']): raise ValueError('service text')
    for key in ('month_fen','year_fen'):
        if type(value[key]) is not int or not 1<=value[key]<=10000000: raise ValueError('price')
    if not isinstance(value['wechat'],str) or not 1<=len(value['wechat'])<=80 or any(ord(c)<32 for c in value['wechat']): raise ValueError('wechat')
    qr=value['qr_data']
    if not isinstance(qr,str) or len(qr)>280000: raise ValueError('QR too large')
    if qr:
        if not qr.startswith('data:image/png;base64,'): raise ValueError('PNG required')
        raw=base64.b64decode(qr.split(',',1)[1],validate=True)
        if not raw.startswith(b'\x89PNG\r\n\x1a\n') or len(raw)<24: raise ValueError('Invalid PNG')
        if not all(1<=int.from_bytes(raw[offset:offset+4],'big')<=8192 for offset in (16,20)): raise ValueError('PNG dimensions')
    update=value['update']
    if not isinstance(update,dict) or set(update)!=set(defaults()['update']): raise ValueError('update fields')
    if type(update['enabled']) is not bool or update['mode'] not in ('optional','mandatory') or not re.fullmatch(r'\d{1,5}\.\d{1,5}\.\d{1,5}',str(update['version'])): raise ValueError('version')
    if not isinstance(update['notes'],str) or len(update['notes'])>4000: raise ValueError('notes')
    if not isinstance(update['url'],str) or len(update['url'])>2048 or not isinstance(update['sha256'],str) or len(update['sha256'])>64: raise ValueError('download fields')
    if update['enabled']:
        url=urlsplit(update['url'])
        if url.scheme!='https' or url.username or url.password or url.port not in (None,443) or not (url.hostname=='gitee.com' or (url.hostname or '').endswith('.gitee.com')): raise ValueError('Gitee HTTPS download URL required')
        if not re.fullmatch('[a-fA-F0-9]{64}',str(update['sha256'])) or type(update['size']) is not int or not 1<=update['size']<=2*1024**3: raise ValueError('hash/size')
    elif not isinstance(update['url'],str) or not isinstance(update['sha256'],str) or type(update['size']) is not int: raise ValueError('update')
    return value

def read(data_dir):
    db=connect(data_dir)
    try: row=db.execute('SELECT * FROM product_settings WHERE id=1').fetchone()
    finally: db.close()
    return ({**defaults(),**json.loads(row['value'])},row['revision']) if row else (defaults(),0)

def register_product(app,data_dir,key,kid):
    @app.before_request
    def product_body_limit():
        if request.path=='/admin/api/product': request.max_content_length=384*1024

    @app.get('/v1/product')
    def product_manifest():
        config,revision=read(data_dir);now=int(time.time())
        payload=b64(json.dumps(dict(iss='synapsex-product',aud='synapsex-desktop',iat=now,exp=now+7*86400,revision=revision,config=config),separators=(',',':')).encode())
        header=b64(json.dumps(dict(alg='EdDSA',typ='JWT',kid=kid),separators=(',',':')).encode())
        signed=header+'.'+payload
        return jsonify(manifest=signed+'.'+b64(key.sign(signed.encode())))

def register_product_admin(app,data_dir,authenticated):
    @app.route('/admin/api/product',methods=['GET','POST'])
    @authenticated
    def product_admin():
        if request.method=='GET':
            config,revision=read(data_dir);return jsonify(config=config,revision=revision)
        body=request.get_json(silent=True) or {}
        try:
            config=validate(body['config']); revision=body['revision']
            if type(revision) is not int: raise ValueError()
        except (ValueError,KeyError,TypeError):return jsonify(error='invalid_product_config'),400
        db=connect(data_dir)
        try:
            with db:
                db.execute('BEGIN IMMEDIATE')
                row=db.execute('SELECT revision FROM product_settings WHERE id=1').fetchone()
                if (row['revision'] if row else 0)!=revision:return jsonify(error='config_conflict'),409
                db.execute('INSERT INTO product_settings VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,revision=excluded.revision',(json.dumps(config),revision+1))
                audit(db,'admin.product_update',str(revision+1),json.dumps({'actor':g.admin['username'],'update_enabled':config['update']['enabled'],'mode':config['update']['mode']}))
            return jsonify(ok=True,revision=revision+1)
        finally:db.close()

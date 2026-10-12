import base64,json,unittest
from cryptography.hazmat.primitives.serialization import load_pem_private_key
import test_accounts as fixtures
ORIGIN=fixtures.ORIGIN
from product import defaults

class ProductTests(unittest.TestCase):
    setUp=fixtures.AccountTests.setUp
    tearDown=fixtures.AccountTests.tearDown
    admin=fixtures.AccountTests.admin
    def test_signed_defaults_and_qr_match_original(self):
        response=self.client.get('/v1/product');self.assertEqual(response.status_code,200)
        parts=response.json['manifest'].split('.')
        key=load_pem_private_key(self.key.read_bytes(),None)
        key.public_key().verify(base64.urlsafe_b64decode(parts[2]+'=='),(parts[0]+'.'+parts[1]).encode())
        payload=json.loads(base64.urlsafe_b64decode(parts[1]+'=='))
        self.assertEqual(payload['iss'],'synapsex-product');self.assertEqual(payload['config'],defaults())
        self.assertEqual(payload['config']['month_fen'],990);self.assertEqual(payload['config']['year_fen'],9900)
        self.assertFalse(payload['config']['update']['enabled'])
    def test_config_is_admin_only_revision_checked_and_accepts_qr_body(self):
        self.assertEqual(self.app.test_client().get('/admin/api/product',base_url=ORIGIN).status_code,401)
        data=self.admin('product').json;data['config']['month_fen']=1990
        saved=self.admin('product',data);self.assertEqual(saved.status_code,200,saved.json)
        self.assertEqual(self.admin('product').json['config']['month_fen'],1990)
        self.assertEqual(self.admin('product',data).status_code,409)
        self.assertEqual(self.client.post('/admin/api/product',base_url=ORIGIN,headers={'Origin':ORIGIN},json={}).status_code,403)
    def test_rejects_bad_update_without_changing_configuration(self):
        for url in ['http://gitee.com/test.exe','https://gitee.com.evil.test/a','https://localhost/a','https://user@gitee.com/a']:
            c=defaults();c['update'].update(enabled=True,version='0.39.0',url=url,sha256='a'*64,size=50)
            self.assertEqual(self.admin('product',{'config':c,'revision':0}).status_code,400)
        c=defaults();c['update'].update(enabled=True,version='0.39.0',url='https://gitee.com/example/release/raw/v1/app.exe',sha256='a'*64,size=50)
        self.assertEqual(self.admin('product',{'config':c,'revision':0}).status_code,200)
        c['qr_data']='data:image/svg+xml;base64,AAAA'
        self.assertEqual(self.admin('product',{'config':c,'revision':1}).status_code,400)
        self.assertEqual(self.admin('product').json['revision'],1)
    def test_member_form_asset_is_available(self):
        with self.client.get('/admin/assets/product.js',base_url=ORIGIN) as response:self.assertEqual(response.status_code,200)

    def test_service_description_is_editable_and_legacy_payload_remains_compatible(self):
        data=self.admin('product').json
        self.assertIn('一对一',data['config']['service_text'])
        data['config']['service_text']='系统调校咨询，请联系微信。'
        self.assertEqual(self.admin('product',data).status_code,200)
        self.assertEqual(self.admin('product').json['config']['service_text'],data['config']['service_text'])
        data['revision']=1
        data['config']['service_text']='x'*241
        self.assertEqual(self.admin('product',data).status_code,400)
        del data['config']['service_text']
        self.assertEqual(self.admin('product',data).status_code,200)
        self.assertEqual(self.admin('product').json['config']['service_text'],defaults()['service_text'])

if __name__=='__main__':unittest.main()

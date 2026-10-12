import json
import os
from pathlib import Path
import tempfile
import unittest
import uuid
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor

from app import connect, create_app, digest, initialize, issue
from admin import set_admin

ORIGIN='http://127.0.0.1:8787'
PASSWORD='synthetic-user-password-2026'


class AccountTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.data=Path(self.temp.name)/'data';self.key=Path(self.temp.name)/'key'
        initialize(self.data,self.key)
        self.env=patch.dict(os.environ,{'SYNAPSEX_REGISTRATION_ENABLED':'1','SYNAPSEX_ADMIN_ORIGIN':ORIGIN})
        self.env.start()
        self.app=create_app(self.data,self.key);self.client=self.app.test_client()
        set_admin(self.data,'operator','synthetic-admin-password')
        response=self.client.post('/admin/api/login',base_url=ORIGIN,headers={'Origin':ORIGIN},json={'username':'operator','password':'synthetic-admin-password'})
        self.csrf=response.json['csrf']
        self.fingerprint=digest('account-test-device')

    def tearDown(self):
        self.env.stop();self.temp.cleanup()

    def register(self,name='sampleuser',fingerprint=None):
        return self.client.post('/v1/account/register',json={'username':name,'password':PASSWORD,'device_hash':fingerprint or self.fingerprint})

    def account(self,route,session,payload=None,fingerprint=None,client=None):
        return (client or self.client).post('/v1/account/'+route,json={'device_hash':fingerprint or self.fingerprint,**(payload or {})},headers={'Authorization':'Bearer '+session['session_token']})

    def admin(self,route,data=None):
        return self.client.open('/admin/api/'+route,base_url=ORIGIN,method='POST' if data is not None else 'GET',headers={'Origin':ORIGIN,'X-CSRF-Token':self.csrf},json=data)

    def action(self,user,action='grant',**values):
        return self.admin('users/'+user['user']['id']+'/'+action,{'request_id':str(uuid.uuid4()),'reason':'automated test','days':30,'device_limit':1,'features':['test.pilot'],**values})

    def test_registration_does_not_grant_entitlement_or_admin(self):
        response=self.register();self.assertEqual(response.status_code,201);user=response.json
        self.assertEqual(self.account('sync',user).json['status'],'unlicensed')
        listing=self.admin('users').json
        self.assertEqual(listing['items'][0]['username'],'sampleuser')
        self.assertIsNone(listing['items'][0]['entitlement'])
        self.assertNotIn('password',json.dumps(listing))
        stranger=self.app.test_client()
        self.assertEqual(stranger.get('/admin/api/users',base_url=ORIGIN).status_code,401)
        self.assertEqual(stranger.post('/admin/api/users/'+user['user']['id']+'/grant',base_url=ORIGIN,headers={'Origin':ORIGIN,'Authorization':'Bearer '+user['session_token']},json={}).status_code,401)

    def test_local_owner_account_exception_is_not_public_registration_or_backend_access(self):
        from software_admin import create_software_admin
        from werkzeug.security import check_password_hash
        payload = {'username':'1','password':'shortx','device_hash':self.fingerprint}
        self.assertEqual(self.client.post('/v1/account/register',json=payload).status_code,400)
        self.assertEqual(self.client.post('/v1/account/login',json=payload).status_code,401)
        with self.assertRaises(ValueError):
            create_software_admin(self.data,'1','shortx')
        with self.assertRaises(ValueError):
            create_software_admin(self.data,'2','shortx',allow_owner_short_credentials=True)
        user_id=create_software_admin(self.data,'1','shortx',allow_owner_short_credentials=True)
        with self.assertRaises(ValueError):
            create_software_admin(self.data,'1','replacement',allow_owner_short_credentials=True)
        db=connect(self.data)
        row=db.execute('SELECT * FROM users WHERE id=?',(user_id,)).fetchone()
        self.assertTrue(check_password_hash(row['password_hash'],'shortx'))
        self.assertNotEqual(row['password_hash'],'shortx')
        db.close()
        self.assertEqual(self.client.post('/v1/account/login',json={**payload,'password':'wrongx'}).status_code,401)
        for i in range(2):
            fp=digest('owner-device-'+str(i))
            login=self.client.post('/v1/account/login',json={**payload,'device_hash':fp})
            self.assertEqual(login.status_code,200)
            self.assertEqual(login.json['user']['role'],'admin')
            self.assertIsNone(self.account('sync',login.json,fingerprint=fp).json['device_limit'])
        stranger=self.app.test_client()
        self.assertEqual(stranger.get('/admin/api/users',base_url=ORIGIN,headers={'Authorization':'Bearer '+login.json['session_token']}).status_code,401)
        self.assertEqual(self.client.post('/v1/account/register',json={**payload,'username':'normaluser'}).status_code,400)
        self.assertEqual(self.action(login.json,'disable').status_code,200)
        self.assertEqual(self.client.post('/v1/account/login',json=payload).status_code,401)
        self.assertEqual(self.action(login.json,'enable').status_code,200)
        self.assertEqual(self.action(login.json,'demote').status_code,200)
        self.assertEqual(self.client.post('/v1/account/login',json=payload).status_code,401)
        self.assertEqual(self.account('sync',login.json,fingerprint=fp).status_code,401)

    def test_admin_role_unlimited_devices_signed_claim_demotion_and_no_backend_access(self):
        import base64
        user=self.register().json
        self.assertEqual(user['user']['role'],'user')
        self.assertEqual(self.action(user,'promote').status_code,200)
        sessions=[]
        # More than the previous ten-session ceiling; no device eviction.
        for i in range(12):
            fp=digest('admin-device-'+str(i))
            response=self.client.post('/v1/account/login',json={'username':'sampleuser','password':PASSWORD,'device_hash':fp})
            self.assertEqual(response.status_code,200,response.json)
            sessions.append((response.json,fp))
        for session,fp in sessions:
            response=self.account('sync',session,fingerprint=fp)
            self.assertEqual(response.status_code,200,response.json)
            claims=json.loads(base64.urlsafe_b64decode(response.json['license'].split('.')[1]+'=='))
            self.assertEqual(claims['account_role'],'admin')
            self.assertEqual(claims['device_hash'],fp)
            self.assertLessEqual(claims['exp']-claims['iat'],300)
            self.assertIsNone(response.json['device_limit'])
        stranger=self.app.test_client()
        self.assertEqual(stranger.get('/admin/api/users',base_url=ORIGIN,headers={'Authorization':'Bearer '+sessions[0][0]['session_token']}).status_code,401)
        initialize(self.data,self.key)
        self.assertEqual(self.account('sync',sessions[0][0],fingerprint=sessions[0][1]).status_code,200)
        self.assertEqual(self.action(user,'demote').status_code,200)
        for session,fp in sessions:
            self.assertEqual(self.account('sync',session,fingerprint=fp).status_code,401)
        # Reset throttle only within this isolated fixture to verify re-login after twelve logins.
        db=connect(self.data)
        with db: db.execute("DELETE FROM audit WHERE event='user.auth_attempt'")
        db.close()
        login=self.client.post('/v1/account/login',json={'username':'sampleuser','password':PASSWORD,'device_hash':self.fingerprint})
        self.assertEqual(login.status_code,200)
        self.assertEqual(self.account('sync',login.json).json['status'],'unlicensed')
        other=self.client.post('/v1/account/login',json={'username':'sampleuser','password':PASSWORD,'device_hash':digest('other')})
        self.assertEqual(other.json['error'],'account_device_bound')

    def test_role_cannot_be_self_assigned_or_granted_as_license_feature(self):
        user=self.client.post('/v1/account/register',json={'username':'selfadmin','password':PASSWORD,'device_hash':self.fingerprint,'role':'admin','administrator':True}).json
        self.assertEqual(user['user']['role'],'user')
        self.action(user,features=['vip','account.admin','jiuyin.fps'])
        import base64
        result=self.account('sync',user,{'role':'admin'}).json
        claims=json.loads(base64.urlsafe_b64decode(result['license'].split('.')[1]+'=='))
        self.assertNotIn('account_role',claims)
        self.assertEqual(result['user']['role'],'user')
        self.assertEqual(self.action(user,'promote').status_code,200)
        self.assertEqual(self.action(user,'disable').status_code,200)
        self.assertEqual(self.account('sync',user).status_code,401)

    def test_password_hash_and_case_insensitive_identity(self):
        user=self.register('SampleUser').json
        self.assertEqual(user['user']['username'],'sampleuser')
        self.assertEqual(self.register('SAMPLEUSER').status_code,409)
        login=self.client.post('/v1/account/login',json={'username':'SAMPLEUSER','password':PASSWORD,'device_hash':self.fingerprint})
        self.assertEqual(login.status_code,200)
        self.assertEqual(self.account('sync',user).status_code,401)
        db=connect(self.data)
        dump='\n'.join(db.iterdump());db.close()
        self.assertNotIn(PASSWORD,dump);self.assertNotIn(login.json['session_token'],dump)

    def test_input_and_registration_switch(self):
        with patch.dict(os.environ,{'SYNAPSEX_REGISTRATION_ENABLED':'0'}):
            self.assertEqual(self.register().json['error'],'registration_closed')
        for value in [[],{'username':'a'}, {'username':'usergood','password':'short','device_hash':self.fingerprint}]:
            self.assertEqual(self.client.post('/v1/account/register',json=value).status_code,400)

    def test_account_grant_sync_extend_and_revoke(self):
        user=self.register().json
        self.assertEqual(self.action(user).status_code,200)
        response=self.account('sync',user).json
        self.assertEqual(response['status'],'active')
        import base64
        claims=json.loads(base64.urlsafe_b64decode(response['license'].split('.')[1]+'=='))
        self.assertEqual(claims['user_id'],user['user']['id'])
        self.assertEqual(claims['device_hash'],self.fingerprint)
        path='licenses/'+claims['license_id']
        extended=self.admin(path+'/extend',{'request_id':str(uuid.uuid4()),'reason':'test','days':2})
        self.assertEqual(extended.status_code,200)
        self.assertEqual(self.account('sync',user).json['license_expires_at'],response['license_expires_at']+2*86400)
        self.assertEqual(self.admin(path+'/revoke',{'request_id':str(uuid.uuid4()),'reason':'test'}).status_code,200)
        self.assertEqual(self.account('sync',user).json['status'],'revoked')
        self.assertEqual(self.action(user).status_code,200)

    def test_user_cannot_claim_another_users_license_or_change_user_id(self):
        first=self.register('firstuser').json;second=self.register('seconduser').json
        self.action(first)
        self.assertEqual(self.account('sync',second,{'user_id':first['user']['id']}).json['status'],'unlicensed')
        code=issue(self.data,30,1,['test.pilot'],'unused test code')['activation_code']
        self.assertEqual(self.account('redeem',second,{'activation_code':code}).json['status'],'active')
        self.assertEqual(self.account('redeem',first,{'activation_code':code}).json['error'],'code_already_claimed')
        self.assertEqual(self.client.post('/v1/licenses/activate',json={'activation_code':code,'device_hash':self.fingerprint}).json['error'],'account_login_required')

    def test_claim_is_atomic_and_legacy_activated_codes_preserved(self):
        first=self.register('firstuser').json;second=self.register('seconduser').json
        code=issue(self.data,30,1,['test.pilot'],'race test')['activation_code']
        def claim(user):
            return self.account('redeem',user,{'activation_code':code},client=self.app.test_client()).status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(claim,[first,second]))
        self.assertEqual(sorted(results),[200,409])
        legacy=issue(self.data,30,1,['test.pilot'],'legacy test')['activation_code']
        activated=self.client.post('/v1/licenses/activate',json={'activation_code':legacy,'device_hash':self.fingerprint}).json
        third=self.register('thirduser').json
        self.assertEqual(self.account('redeem',third,{'activation_code':legacy}).json['error'],'legacy_code_in_use')
        self.assertEqual(self.client.post('/v1/licenses/refresh',json={'device_hash':self.fingerprint},headers={'Authorization':'Bearer '+activated['refresh_token']}).status_code,200)

    def test_disable_revokes_sessions_and_other_account_is_untouched(self):
        first=self.register('firstuser').json;second=self.register('seconduser').json
        self.action(first)
        self.assertEqual(self.action(first,'disable').status_code,200)
        self.assertEqual(self.account('sync',first).status_code,401)
        self.assertEqual(self.account('sync',second).status_code,200)
        self.assertEqual(self.action(first,'enable').status_code,200)
        self.assertEqual(self.account('sync',first).status_code,401)

    def test_device_capacity_and_unbind_invalidates_that_device_login(self):
        user=self.register().json;self.action(user)
        current=self.account('sync',user).json
        other=digest('second-device')
        login=self.client.post('/v1/account/login',json={'username':'sampleuser','password':PASSWORD,'device_hash':other})
        self.assertEqual(login.status_code,409)
        self.assertEqual(login.json['error'],'account_device_bound')
        self.assertEqual(self.account('sync',user,fingerprint=other).status_code,401)
        self.assertEqual(self.action(user,'unbind').status_code,200)
        self.assertEqual(self.account('sync',user).status_code,401)
        login=self.client.post('/v1/account/login',json={'username':'sampleuser','password':PASSWORD,'device_hash':other}).json
        self.assertEqual(self.account('sync',login,fingerprint=other).json['status'],'active')

    def test_free_account_binding_persists_after_logout_and_login_rolls_180_days(self):
        user=self.register().json
        now=int(__import__('time').time())
        self.assertGreater(user['session_expires_at'],now+179*86400)
        synced=self.account('sync',user).json
        self.assertGreaterEqual(synced['session_expires_at'],user['session_expires_at'])
        self.account('logout',user)
        other=digest('second device')
        self.assertEqual(self.client.post('/v1/account/login',json={'username':'sampleuser','password':PASSWORD,'device_hash':other}).status_code,409)
        self.assertEqual(self.action(user,device_limit=2).json['error'],'single_device_required')

    def test_migration_preserves_existing_licensed_device(self):
        user=self.register().json;self.action(user);self.account('sync',user)
        db=connect(self.data)
        with db:db.execute('DELETE FROM user_bindings')
        db.close();initialize(self.data,self.key)
        db=connect(self.data)
        self.assertEqual(db.execute('SELECT fingerprint FROM user_bindings WHERE user_id=?',(user['user']['id'],)).fetchone()['fingerprint'],self.fingerprint)
        db.close()

    def test_repeat_grant_idempotent_and_duplicate_grant_rejected(self):
        user=self.register().json;rid=str(uuid.uuid4())
        self.assertEqual(self.action(user,request_id=rid).status_code,200)
        self.assertTrue(self.action(user,request_id=rid).json['already_completed'])
        self.assertEqual(self.action(user).json['error'],'existing_entitlement')
        self.assertEqual(self.action(user,request_id=rid,days=31).status_code,409)
        self.assertEqual(self.admin('licenses').json['total'],1)

    def test_remarks_search_logout_expiry_and_migration_preservation(self):
        user=self.register().json
        self.assertEqual(self.action(user,'remark',remark='测试客户').status_code,200)
        self.assertEqual(self.admin('users?q=测试').json['total'],1)
        initialize(self.data,self.key)
        self.assertEqual(self.admin('users').json['total'],1)
        self.assertEqual(self.account('logout',user).status_code,200)
        self.assertEqual(self.account('sync',user).status_code,401)

    def test_auth_throttle_is_shared_and_does_not_lock_correct_user_forever(self):
        for _ in range(12):
            self.assertEqual(self.client.post('/v1/account/login',json={'username':'unknown','password':PASSWORD,'device_hash':self.fingerprint}).status_code,401)
        self.assertEqual(self.client.post('/v1/account/login',json={}).status_code,429)


if __name__=='__main__':unittest.main()

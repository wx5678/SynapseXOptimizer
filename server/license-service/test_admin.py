import json
from pathlib import Path
import tempfile
import time
import unittest
import uuid
from app import connect, create_app, digest, initialize, issue
from admin import set_admin

ORIGIN = "http://127.0.0.1:8787"


class AdminTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data = Path(self.temp.name) / "data"
        self.key = Path(self.temp.name) / "key.pem"
        initialize(self.data, self.key)
        set_admin(self.data, "operator", "test-password-not-production")
        self.app = create_app(self.data, self.key)
        self.client = self.app.test_client()
        self.csrf = ""

    def tearDown(self):
        self.temp.cleanup()

    def call(self, route, value=None, client=None, csrf=None, origin=ORIGIN):
        if value is not None and route.startswith("licenses"):
            value = {"request_id": str(uuid.uuid4()), **value}
        headers = {"Origin": origin, "X-CSRF-Token": self.csrf if csrf is None else csrf}
        return (client or self.client).open("/admin/api/" + route, base_url=ORIGIN,
                                           method="GET" if value is None else "POST", json=value, headers=headers)

    def login(self):
        result = self.call("login", {"username": "operator", "password": "test-password-not-production"})
        self.assertEqual(result.status_code, 200)
        self.csrf = result.json["csrf"]
        return result

    def test_assets_and_headers(self):
        for route in ["/admin/", "/admin/assets/app.js", "/admin/assets/style.css"]:
            result = self.client.get(route, base_url=ORIGIN)
            self.assertEqual(result.status_code, 200)
            self.assertIn("frame-ancestors 'none'", result.headers["Content-Security-Policy"])
            result.close()
        self.assertEqual(self.client.get("/admin/assets/other", base_url=ORIGIN).status_code, 404)

    def test_deployment_readiness_tracks_application_version(self):
        import contextlib
        import io
        import runpy
        from unittest.mock import patch
        from app import VERSION
        response = io.BytesIO(json.dumps({"status": "ok", "version": VERSION}).encode())
        with patch("urllib.request.urlopen", return_value=response), contextlib.redirect_stdout(io.StringIO()) as output:
            runpy.run_path(str(Path(__file__).with_name("verify_health.py")))
        self.assertIn(VERSION, output.getvalue())

    def test_no_auth_no_data_or_writes(self):
        self.assertEqual(self.call("licenses").status_code, 401)
        self.assertEqual(self.call("licenses", {}).status_code, 401)
        self.assertEqual(self.call("audit").status_code, 401)
        self.assertEqual(self.call("session").status_code, 401)

    def test_origin_host_and_csrf(self):
        self.assertEqual(self.client.get("/admin/", base_url="http://attacker.test").status_code, 403)
        self.assertEqual(self.call("login", {}, origin="http://attacker.test").status_code, 403)
        result = self.login()
        self.assertIn("HttpOnly", result.headers["Set-Cookie"])
        self.assertIn("SameSite=Strict", result.headers["Set-Cookie"])
        self.assertEqual(self.call("licenses", {}, csrf="wrong").status_code, 403)
        self.assertEqual(self.call("logout", {}, origin="http://attacker.test").status_code, 403)

    def test_login_throttle(self):
        for _ in range(8):
            self.assertEqual(self.call("login", {"username": "operator", "password": "wrong"}).status_code, 401)
        self.assertEqual(self.call("login", {"username": "operator", "password": "wrong"}).status_code, 429)

    def test_logout_password_change_and_expiry(self):
        self.login()
        self.assertEqual(self.call("session").status_code, 200)
        self.assertEqual(self.call("logout", {}).status_code, 200)
        self.assertEqual(self.call("session").status_code, 401)
        self.login()
        self.assertEqual(self.call("password", {"old_password": "test-password-not-production", "new_password": "another-test-password-2026"}).status_code, 200)
        self.assertEqual(self.call("session").status_code, 401)
        set_admin(self.data, "operator", "test-password-not-production")
        self.login()
        db = connect(self.data)
        with db:
            db.execute("UPDATE admin_sessions SET expires_at=1")
        db.close()
        self.assertEqual(self.call("session").status_code, 401)

    def test_license_workflow_no_secret_listing(self):
        self.login()
        result = self.call("licenses", {"days": 30, "device_limit": 1, "features": ["test.pilot"], "reference": "测试客户"})
        self.assertEqual(result.status_code, 201)
        issued = result.json
        listing = self.call("licenses").json
        self.assertEqual(listing["stats"]["total"], 1)
        self.assertNotIn(issued["activation_code"], json.dumps(listing))
        license_id = issued["license_id"]
        activated = self.client.post("/v1/licenses/activate", json={"activation_code": issued["activation_code"], "device_hash": digest("test")}).json
        device = self.call("licenses/" + license_id + "/devices").json["items"][0]
        self.assertNotIn("token_hash", device)
        self.assertEqual(len(device["fingerprint_hint"]), 12)
        self.assertEqual(self.call("licenses/" + license_id + "/extend", {"days": 10, "reason": "测试延期"}).status_code, 200)
        self.assertEqual(self.call("licenses").json["items"][0]["expires_at"], issued["expires_at"] + 10 * 86400)
        self.assertEqual(self.call("licenses/" + license_id + "/unbind", {"device_id": device["id"], "reason": "换机"}).status_code, 200)
        self.assertEqual(self.call("licenses/" + license_id + "/devices").json["items"], [])
        self.assertEqual(self.call("licenses/" + license_id + "/revoke", {"reason": "测试结束"}).status_code, 200)
        self.assertEqual(self.call("licenses/" + license_id + "/extend", {"days": 10, "reason": "不能恢复撤销"}).status_code, 409)
        audits = self.call("audit").json
        self.assertNotIn(issued["activation_code"], json.dumps(audits))
        self.assertNotIn(activated["refresh_token"], json.dumps(audits))

    def test_invalid_values_and_required_reason(self):
        self.login()
        base = {"days": 30, "device_limit": 1, "features": ["test.pilot"], "reference": "test"}
        for patch in [{"days": True}, {"features": [1]}, {"features": "all"}, {"reference": []}, {"device_limit": 0}, {"days": 999999}]:
            self.assertEqual(self.call("licenses", {**base, **patch}).status_code, 400)
        self.assertEqual(self.call("licenses/none/revoke", {}).status_code, 400)
        self.assertEqual(self.call("licenses/none/revoke", {"reason": "test"}).status_code, 404)
        self.assertEqual(self.call("licenses?page=-1").status_code, 400)
        self.assertEqual(self.call("audit?before=999999999999999999999").status_code, 400)

    def test_search_paging_and_escaped_wildcards(self):
        self.login()
        for i in range(27):
            issue(self.data, 1, 1, ["test.pilot"], "ref" + str(i))
        issue(self.data, 1, 1, ["test.pilot"], "100% literal")
        self.assertEqual(len(self.call("licenses").json["items"]), 25)
        self.assertEqual(len(self.call("licenses?page=2").json["items"]), 3)
        self.assertEqual(self.call("licenses?q=%25").json["total"], 1)

    def test_self_deactivation_releases_slot(self):
        issued = issue(self.data, 1, 1, ["test.pilot"], "deactivate")
        payload = {"activation_code": issued["activation_code"], "device_hash": digest("device")}
        activated = self.client.post("/v1/licenses/activate", json=payload).json
        headers = {"Authorization": "Bearer " + activated["refresh_token"]}
        self.assertEqual(self.client.post("/v1/licenses/deactivate", headers=headers, json={"device_hash": digest("wrong")}).status_code, 200)
        db = connect(self.data)
        self.assertEqual(db.execute("SELECT count(*) FROM devices").fetchone()[0], 1)
        db.close()
        self.assertEqual(self.client.post("/v1/licenses/deactivate", headers=headers, json={"device_hash": digest("device")}).status_code, 200)
        self.assertEqual(self.client.post("/v1/licenses/refresh", headers=headers, json={"device_hash": digest("device")}).status_code, 401)
        self.assertEqual(self.client.post("/v1/licenses/activate", json={**payload, "device_hash": digest("another")}).status_code, 200)

    def test_repeated_mutations_do_not_issue_or_extend_twice(self):
        self.login()
        payload = {"request_id": str(uuid.uuid4()), "days": 30, "device_limit": 1, "features": ["test.pilot"], "reference": "idempotency"}
        first = self.call("licenses", payload).json
        second = self.call("licenses", payload).json
        self.assertEqual(first["license_id"], second["license_id"])
        self.assertTrue(second["already_completed"])
        self.assertNotIn("activation_code", second)
        self.assertEqual(self.call("licenses", {**payload, "days": 20}).status_code, 400)
        extension = {"request_id": str(uuid.uuid4()), "days": 5, "reason": "test"}
        route = "licenses/" + first["license_id"] + "/extend"
        self.assertEqual(self.call(route, extension).status_code, 200)
        self.assertTrue(self.call(route, extension).json["already_completed"])
        self.assertEqual(self.call("licenses").json["items"][0]["expires_at"], first["expires_at"] + 5 * 86400)


if __name__ == "__main__":
    unittest.main()

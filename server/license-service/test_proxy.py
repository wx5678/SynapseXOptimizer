import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from app import connect, create_app, digest, initialize
from admin import set_admin


class ProxyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data = Path(self.temp.name) / "data"
        self.key = Path(self.temp.name) / "key.pem"
        initialize(self.data, self.key)

    def tearDown(self):
        self.temp.cleanup()

    def client(self, enabled):
        with patch.dict(os.environ, {"SYNAPSEX_TRUST_LOOPBACK_PROXY": enabled,
                                     "SYNAPSEX_ADMIN_ORIGIN": "https://39.96.195.192"}):
            return create_app(self.data, self.key).test_client()

    def buckets(self):
        db = connect(self.data)
        try:
            return {row["bucket"]: row["count"] for row in db.execute("SELECT * FROM rate_limits")}
        finally:
            db.close()

    def test_disabled_ignores_spoofed_forwarding(self):
        self.client("0").post("/v1/licenses/activate", json={}, headers={"X-Forwarded-For": "203.0.113.9"})
        self.assertEqual(self.buckets(), {digest("127.0.0.1"): 1})

    def test_external_peer_cannot_choose_bucket(self):
        self.client("1").post("/v1/licenses/activate", json={}, headers={"X-Forwarded-For": "203.0.113.9"},
                              environ_overrides={"REMOTE_ADDR": "198.51.100.8"})
        self.assertEqual(self.buckets(), {digest("198.51.100.8"): 1})

    def test_proxy_preserves_individual_client_limits(self):
        client = self.client("1")
        for address in ["203.0.113.8", "203.0.113.9"]:
            client.post("/v1/licenses/activate", json={}, headers={"X-Forwarded-For": address})
        self.assertEqual(self.buckets(), {digest("203.0.113.8"): 1, digest("203.0.113.9"): 1})

    def test_host_cannot_be_overridden_by_forwarded_host(self):
        result = self.client("1").get("/admin/", base_url="http://attacker.test",
                                      headers={"X-Forwarded-Host": "39.96.195.192"})
        self.assertEqual(result.status_code, 403)

    def test_cloud_login_cookie_is_secure(self):
        set_admin(self.data, "operator", "test-password-not-production")
        result = self.client("1").post("/admin/api/login", base_url="http://39.96.195.192",
            headers={"Origin": "https://39.96.195.192", "X-Forwarded-Proto": "https",
                     "X-Forwarded-For": "203.0.113.8"},
            json={"username": "operator", "password": "test-password-not-production"})
        self.assertEqual(result.status_code, 200)
        self.assertIn("Secure", result.headers["Set-Cookie"])
        self.assertIn("HttpOnly", result.headers["Set-Cookie"])
        result.close()


if __name__ == "__main__":
    unittest.main()

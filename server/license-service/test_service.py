import base64
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from app import AUDIENCE, GRACE_SECONDS, ISSUER, connect, create_app, digest, initialize, issue


def decode(part):
    return base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))


class LicensingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data = Path(self.temp.name) / "data"
        self.key = Path(self.temp.name) / "key.pem"
        initialize(self.data, self.key)
        self.app = create_app(str(self.data), str(self.key))
        self.client = self.app.test_client()
        self.issued = issue(self.data, 30, 2, ["test.pilot"], "automated-test-only")
        self.device = digest("test-device-one")

    def tearDown(self):
        self.temp.cleanup()

    def activate(self, device=None, client=None):
        return (client or self.client).post("/v1/licenses/activate", json={
            "activation_code": self.issued["activation_code"], "device_hash": device or self.device})

    def refresh(self, result, fingerprint=None):
        return self.client.post("/v1/licenses/refresh", json={"device_hash": fingerprint or self.device},
                                headers={"Authorization": "Bearer " + result["refresh_token"]})

    def test_health_and_no_public_admin(self):
        self.assertEqual(self.client.get("/healthz").json["status"], "ok")
        self.assertEqual(self.client.post("/admin/issue").status_code, 403)

    def test_signing_and_tamper_rejection(self):
        response = self.activate()
        self.assertEqual(response.status_code, 200)
        header, payload, signature = response.json["license"].split(".")
        key = serialization.load_pem_private_key(self.key.read_bytes(), None).public_key()
        key.verify(decode(signature), (header + "." + payload).encode())
        with self.assertRaises(InvalidSignature):
            key.verify(decode(signature), (header + "." + payload + "a").encode())
        claims = json.loads(decode(payload))
        self.assertEqual(claims["iss"], ISSUER)
        self.assertEqual(claims["aud"], AUDIENCE)
        self.assertEqual(claims["device_hash"], self.device)
        self.assertEqual(claims["exp"] - claims["iat"], GRACE_SECONDS)
        self.assertEqual(claims["features"], ["test.pilot"])

    def test_device_limit(self):
        self.assertEqual(self.activate().status_code, 200)
        self.assertEqual(self.activate(digest("two")).status_code, 200)
        self.assertEqual(self.activate(digest("three")).status_code, 409)

    def test_capacity_is_atomic(self):
        def run(n):
            with self.app.test_client() as client:
                return self.activate(digest(str(n)), client).status_code
        with ThreadPoolExecutor(max_workers=8) as pool:
            statuses = list(pool.map(run, range(8)))
        self.assertEqual(statuses.count(200), 2)
        self.assertEqual(statuses.count(409), 6)

    def test_repeat_activation_replaces_device_token(self):
        first = self.activate().json
        second = self.activate().json
        self.assertEqual(first["device_id"], second["device_id"])
        self.assertEqual(self.refresh(first).status_code, 401)
        self.assertEqual(self.refresh(second).status_code, 200)

    def test_refresh_requires_token_and_same_device(self):
        result = self.activate().json
        self.assertEqual(self.refresh(result).status_code, 200)
        self.assertEqual(self.refresh(result, digest("different")).status_code, 401)
        self.assertEqual(self.client.post("/v1/licenses/refresh", json={}).status_code, 401)

    def test_revoked_license_cannot_refresh_or_activate(self):
        result = self.activate().json
        db = connect(self.data)
        with db:
            db.execute("UPDATE licenses SET revoked=1")
        db.close()
        self.assertEqual(self.refresh(result).status_code, 403)
        self.assertEqual(self.activate().status_code, 403)

    def test_license_expiry_caps_offline_window(self):
        expiry = int(time.time()) + 60
        db = connect(self.data)
        with db:
            db.execute("UPDATE licenses SET expires_at=?", (expiry,))
        db.close()
        self.assertEqual(self.activate().json["expires_at"], expiry)

    def test_expired_license_is_rejected(self):
        db = connect(self.data)
        with db:
            db.execute("UPDATE licenses SET expires_at=1")
        db.close()
        self.assertEqual(self.activate().status_code, 403)

    def test_malformed_input_and_payload_limits(self):
        for value in [[], "hello", None, {"activation_code": 99}, {"device_hash": []}]:
            self.assertEqual(self.client.post("/v1/licenses/activate", json=value).status_code, 400)
        self.assertEqual(self.client.post("/v1/licenses/activate", data="x" * 5000,
                                         content_type="application/json").status_code, 413)

    def test_plain_credentials_not_stored(self):
        result = self.activate().json
        db = connect(self.data)
        stored = "\n".join(db.iterdump())
        db.close()
        self.assertNotIn(self.issued["activation_code"], stored)
        self.assertNotIn(result["refresh_token"], stored)

    def test_rate_limit(self):
        for _ in range(60):
            self.assertEqual(self.client.post("/v1/licenses/activate", json={}).status_code, 400)
        self.assertEqual(self.client.post("/v1/licenses/activate", json={}).status_code, 429)

    def test_initialize_never_rotates_existing_key(self):
        before = self.key.read_bytes()
        initialize(self.data, self.key)
        self.assertEqual(before, self.key.read_bytes())
        with self.assertRaises(RuntimeError):
            initialize(self.data, Path(self.temp.name) / "missing-key.pem")

    def test_cli_backup_and_unbind(self):
        device = self.activate().json
        command = [sys.executable, str(Path(__file__).with_name("manage.py")),
                   "--data-dir", str(self.data), "--key-path", str(self.key)]
        subprocess.run(command + ["unbind", device["device_id"]], check=True, capture_output=True)
        self.assertEqual(self.refresh(device).status_code, 401)
        target = Path(self.temp.name) / "backup"
        subprocess.run(command + ["backup", str(target)], check=True, capture_output=True)
        self.assertEqual(len(list(target.glob("*.sqlite3"))), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)

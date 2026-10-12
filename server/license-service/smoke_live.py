"""Loopback HTTP smoke test. Issues only test.pilot and revokes it even on failure."""
import base64
import json
from pathlib import Path
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from cryptography.hazmat.primitives import serialization
from app import connect, digest, issue, audit


def call(route, data=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    request = Request("http://127.0.0.1:8787" + route,
                      data=None if data is None else json.dumps(data).encode(), headers=headers)
    with urlopen(request, timeout=5) as response:
        return json.load(response)


assert call("/healthz")["status"] == "ok"
data_dir = "/var/lib/synapsex-license"
record = issue(data_dir, 1, 1, ["test.pilot"], "deployment-smoke-" + str(int(time.time())))
fingerprint = digest("synapsex-deployment-test-only")
try:
    activated = call("/v1/licenses/activate", {"activation_code": record["activation_code"], "device_hash": fingerprint})
    header, payload, signature = activated["license"].split(".")
    key = serialization.load_pem_private_key(Path("/etc/synapsex-license/signing.pem").read_bytes(), None)
    signature = base64.urlsafe_b64decode(signature + "=" * (-len(signature) % 4))
    key.public_key().verify(signature, (header + "." + payload).encode())
    refreshed = call("/v1/licenses/refresh", {"device_hash": fingerprint}, activated["refresh_token"])
    assert refreshed["key_id"] == activated["key_id"]
    try:
        call("/v1/licenses/activate", {"activation_code": record["activation_code"], "device_hash": digest("second-test-device")})
        raise AssertionError("Device limit not enforced")
    except HTTPError as error:
        assert error.code == 409
finally:
    db = connect(data_dir)
    with db:
        db.execute("UPDATE licenses SET revoked=1 WHERE id=?", (record["license_id"],))
        audit(db, "deployment-test.revoked", record["license_id"])
    db.close()
try:
    call("/v1/licenses/refresh", {"device_hash": fingerprint}, activated["refresh_token"])
    raise AssertionError("Revocation not enforced")
except HTTPError as error:
    assert error.code == 403
print("LIVE_HTTP_PASS: activation, Ed25519 verification, refresh, device limit, revocation")
print("Test-only license revoked. No activation codes or tokens logged.")

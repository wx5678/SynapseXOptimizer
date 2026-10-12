"""Licensing and software accounts. Public registration is explicitly opt-in; no payment integration."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import time
import uuid

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from flask import Flask, jsonify, request
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

VERSION = "0.4.3"
ISSUER = "synapsex-license"
AUDIENCE = "synapsex-desktop"
GRACE_SECONDS = 7 * 86400
SCHEMA = """
CREATE TABLE IF NOT EXISTS licenses (
 id TEXT PRIMARY KEY, code_hash TEXT UNIQUE NOT NULL,
 reference TEXT NOT NULL, features TEXT NOT NULL,
 expires_at INTEGER NOT NULL, device_limit INTEGER NOT NULL,
 revoked INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS devices (
 id TEXT PRIMARY KEY, license_id TEXT NOT NULL REFERENCES licenses(id),
 fingerprint TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL,
 created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL,
 UNIQUE(license_id, fingerprint)
);
CREATE TABLE IF NOT EXISTS audit (
 id INTEGER PRIMARY KEY, event TEXT NOT NULL, subject TEXT NOT NULL,
 detail TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_limits (
 bucket TEXT PRIMARY KEY, window INTEGER NOT NULL, count INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_window ON rate_limits(window);
CREATE TABLE IF NOT EXISTS admins (
 username TEXT PRIMARY KEY, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_sessions (
 token_hash TEXT PRIMARY KEY, username TEXT NOT NULL REFERENCES admins(username),
 csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_mutations (
 request_id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, subject TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL, remark TEXT NOT NULL DEFAULT '',
 disabled INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, last_login INTEGER
);
CREATE TABLE IF NOT EXISTS user_sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
 fingerprint TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
 UNIQUE(user_id, fingerprint)
);
CREATE TABLE IF NOT EXISTS user_licenses (
 license_id TEXT PRIMARY KEY REFERENCES licenses(id), user_id TEXT NOT NULL REFERENCES users(id),
 assigned_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS user_license_owner ON user_licenses(user_id);
CREATE TABLE IF NOT EXISTS user_bindings(user_id TEXT PRIMARY KEY REFERENCES users(id), fingerprint TEXT NOT NULL, bound_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS product_settings(id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL, revision INTEGER NOT NULL);
"""


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def connect(data_dir):
    db = sqlite3.connect(str(Path(data_dir) / "licenses.sqlite3"), timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("PRAGMA busy_timeout = 10000")
    return db


def initialize(data_dir, key_path):
    data_dir, key_path = Path(data_dir), Path(key_path)
    data_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    key_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    db_path = data_dir / "licenses.sqlite3"
    if not key_path.exists():
        if db_path.exists():
            raise RuntimeError("Signing key missing for existing database; restore the key, do not regenerate")
        key = Ed25519PrivateKey.generate()
        pem = key.private_bytes(serialization.Encoding.PEM,
                                serialization.PrivateFormat.PKCS8,
                                serialization.NoEncryption())
        fd = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as target:
            target.write(pem)
    key = serialization.load_pem_private_key(key_path.read_bytes(), password=None)
    if not isinstance(key, Ed25519PrivateKey):
        raise RuntimeError("Expected Ed25519 signing key")
    db = connect(data_dir)
    try:
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript(SCHEMA)
        db.execute("BEGIN IMMEDIATE")
        if 'role' not in {row['name'] for row in db.execute('PRAGMA table_info(users)')}:
            db.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin'))")
        # Preserve the device already licensed before the single-device account migration.
        db.execute("""INSERT OR IGNORE INTO user_bindings(user_id,fingerprint,bound_at)
          SELECT ul.user_id,d.fingerprint,d.created_at FROM user_licenses ul JOIN devices d ON d.license_id=ul.license_id
          ORDER BY d.created_at,d.id""")
        db.execute("""INSERT OR IGNORE INTO user_bindings(user_id,fingerprint,bound_at)
          SELECT user_id,fingerprint,created_at FROM user_sessions WHERE expires_at>? ORDER BY created_at DESC,token_hash""",(int(time.time()),))
        db.commit()
    finally:
        db.close()


def audit(db, event, subject, detail=""):
    db.execute("INSERT INTO audit(event,subject,detail,created_at) VALUES(?,?,?,?)",
               (event, subject, detail, int(time.time())))


def issue(data_dir, days, device_limit, features, reference, request_id=None, actor=None):
    if not 1 <= days <= 3650 or not 1 <= device_limit <= 10:
        raise ValueError("days must be 1..3650 and devices 1..10")
    if not features or any(not re.fullmatch(r"[a-z][a-z0-9_.-]{0,63}", f) for f in features):
        raise ValueError("Explicit feature IDs are required")
    if not reference.strip() or len(reference) > 200:
        raise ValueError("A non-secret issuance reference is required (max 200 characters)")
    code, license_id = "SX-" + secrets.token_hex(20).upper(), str(uuid.uuid4())
    now = int(time.time())
    db = connect(data_dir)
    try:
        with db:
            db.execute("BEGIN IMMEDIATE")
            payload_hash = digest(json.dumps([days, device_limit, sorted(set(features)), reference, actor]))
            if request_id:
                previous = db.execute("SELECT * FROM admin_mutations WHERE request_id=?", (request_id,)).fetchone()
                if previous:
                    if previous["payload_hash"] != payload_hash:
                        raise ValueError("Idempotency conflict")
                    return {"license_id": previous["subject"], "already_completed": True}
            db.execute("INSERT INTO licenses VALUES(?,?,?,?,?,?,0,?)",
                       (license_id, digest(code), reference, json.dumps(sorted(set(features))),
                        now + days * 86400, device_limit, now))
            audit(db, "license.issued", license_id, reference)
            if actor:
                audit(db, "admin.issue", license_id, actor)
            if request_id:
                db.execute("INSERT INTO admin_mutations VALUES(?,?,?,?)", (request_id, payload_hash, license_id, now))
    finally:
        db.close()
    return {"license_id": license_id, "activation_code": code, "expires_at": now + days * 86400}


def b64(value):
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def create_app(data_dir=None, key_path=None):
    data_dir = data_dir or os.environ.get("SYNAPSEX_DATA_DIR", "/var/lib/synapsex-license")
    key_path = key_path or os.environ.get("SYNAPSEX_KEY_PATH", "/etc/synapsex-license/signing.pem")
    key = serialization.load_pem_private_key(Path(key_path).read_bytes(), password=None)
    if not isinstance(key, Ed25519PrivateKey):
        raise RuntimeError("Expected Ed25519 key")
    public = key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    key_id = hashlib.sha256(public).hexdigest()[:24]
    app = Flask(__name__)
    app.config.update(MAX_CONTENT_LENGTH=4096)
    if os.environ.get("SYNAPSEX_TRUST_LOOPBACK_PROXY") == "1":
        original = app.wsgi_app
        forwarded = ProxyFix(original, x_for=1, x_proto=1, x_host=0, x_port=0, x_prefix=0)

        def loopback_proxy(environ, start_response):
            # Nginx overwrites forwarding headers; never trust headers from a direct peer.
            handler = forwarded if environ.get("REMOTE_ADDR") in ("127.0.0.1", "::1") else original
            return handler(environ, start_response)

        app.wsgi_app = loopback_proxy

    @app.after_request
    def headers(response):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Content-Security-Policy"] = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify(error=error.name.lower().replace(" ", "_")), error.code

    @app.errorhandler(Exception)
    def service_error(error):
        # Never log submitted credentials, request bodies or key material.
        app.logger.error("License request failed: %s", type(error).__name__)
        return jsonify(error="service_unavailable"), 503

    @app.before_request
    def rate_limit():
        if request.method != "POST":
            return None
        # Cloud deployments use only the single, explicitly trusted loopback proxy above.
        bucket = digest(request.remote_addr or "unknown")
        now = int(time.time())
        window = now // 60
        db = connect(data_dir)
        try:
            with db:
                db.execute("DELETE FROM rate_limits WHERE window < ?", (window - 2,))
                db.execute("""INSERT INTO rate_limits VALUES(?,?,1)
                    ON CONFLICT(bucket) DO UPDATE SET
                    count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,
                    window=excluded.window""", (bucket, window))
                count = db.execute("SELECT count FROM rate_limits WHERE bucket=?", (bucket,)).fetchone()[0]
            if count > 60:
                return jsonify(error="rate_limited"), 429, {"Retry-After": str(60 - now % 60)}
        finally:
            db.close()

    @app.get("/healthz")
    def health():
        db = connect(data_dir)
        try:
            db.execute("SELECT count(*) FROM licenses").fetchone()
        finally:
            db.close()
        return jsonify(status="ok", version=VERSION, mode="internal-pilot")

    @app.get("/v1/public-key")
    def public_key():
        # Desktop must PIN this key from a trusted release; don't blindly trust a fetched key.
        return jsonify(algorithm="Ed25519", key_id=key_id, public_key=b64(public))

    def envelope(license_row, device, user_id=None, account_role=None):
        now = int(time.time())
        claims = {"iss": ISSUER, "aud": AUDIENCE, "license_id": license_row["id"],
                  "device_id": device["id"], "device_hash": device["fingerprint"],
                  "features": json.loads(license_row["features"]), "iat": now, "nbf": now,
                  "exp": min(now + GRACE_SECONDS, license_row["expires_at"]),
                  "license_expires_at": license_row["expires_at"], "version": 1}
        if user_id:
            claims["user_id"] = user_id
        if account_role == 'admin' and user_id:
            claims['account_role'] = 'admin'
            claims['exp'] = min(claims['exp'], now + 300)
        header = b64(json.dumps({"alg": "EdDSA", "typ": "JWT", "kid": key_id},
                                separators=(",", ":"), sort_keys=True).encode())
        payload = b64(json.dumps(claims, separators=(",", ":"), sort_keys=True).encode())
        signing_input = (header + "." + payload).encode("ascii")
        token = signing_input.decode("ascii") + "." + b64(key.sign(signing_input))
        return {"license": token, "expires_at": claims["exp"], "key_id": key_id,
                "server_time": now, "refresh_after_seconds": 86400}

    def body():
        value = request.get_json(silent=True)
        return value if isinstance(value, dict) else {}

    @app.post("/v1/licenses/activate")
    def activate():
        data = body()
        code, fingerprint = data.get("activation_code"), data.get("device_hash")
        if not isinstance(code, str) or not re.fullmatch(r"SX-[A-F0-9]{40}", code):
            return jsonify(error="invalid_request"), 400
        if not isinstance(fingerprint, str) or not re.fullmatch(r"[a-f0-9]{64}", fingerprint):
            return jsonify(error="invalid_request"), 400
        db = connect(data_dir)
        try:
            with db:
                # Serialize capacity check and insert, including across gunicorn workers.
                db.execute("BEGIN IMMEDIATE")
                row = db.execute("SELECT * FROM licenses WHERE code_hash=?", (digest(code),)).fetchone()
                if row is None or row["revoked"] or row["expires_at"] <= int(time.time()):
                    return jsonify(error="license_unavailable"), 403
                if db.execute("SELECT 1 FROM user_licenses WHERE license_id=?", (row["id"],)).fetchone():
                    return jsonify(error="account_login_required"), 403
                device = db.execute("SELECT * FROM devices WHERE license_id=? AND fingerprint=?",
                                    (row["id"], fingerprint)).fetchone()
                now, refresh_token = int(time.time()), secrets.token_urlsafe(32)
                if device is None:
                    count = db.execute("SELECT count(*) FROM devices WHERE license_id=?", (row["id"],)).fetchone()[0]
                    if count >= row["device_limit"]:
                        return jsonify(error="device_limit_reached"), 409
                    device_id = str(uuid.uuid4())
                    db.execute("INSERT INTO devices VALUES(?,?,?,?,?,?)",
                               (device_id, row["id"], fingerprint, digest(refresh_token), now, now))
                else:
                    device_id = device["id"]
                    db.execute("UPDATE devices SET token_hash=?,last_seen=? WHERE id=?",
                               (digest(refresh_token), now, device_id))
                device = {"id": device_id, "fingerprint": fingerprint}
                result = envelope(row, device)
                audit(db, "device.activated", device_id)
            return jsonify(**result, refresh_token=refresh_token, device_id=device_id)
        finally:
            db.close()

    @app.post("/v1/licenses/refresh")
    def refresh():
        authorization = request.headers.get("Authorization", "")
        if not authorization.startswith("Bearer ") or not re.fullmatch(r"[A-Za-z0-9_-]{43}", authorization[7:]):
            return jsonify(error="unauthorized"), 401
        fingerprint = body().get("device_hash")
        if not isinstance(fingerprint, str) or not re.fullmatch(r"[a-f0-9]{64}", fingerprint):
            return jsonify(error="invalid_request"), 400
        db = connect(data_dir)
        try:
            with db:
                db.execute("BEGIN IMMEDIATE")
                device = db.execute("SELECT * FROM devices WHERE token_hash=? AND fingerprint=?",
                                    (digest(authorization[7:]), fingerprint)).fetchone()
                if device is None:
                    return jsonify(error="unauthorized"), 401
                row = db.execute("SELECT * FROM licenses WHERE id=?", (device["license_id"],)).fetchone()
                if db.execute("SELECT 1 FROM user_licenses WHERE license_id=?", (row["id"],)).fetchone():
                    return jsonify(error="account_login_required"), 403
                if row["revoked"] or row["expires_at"] <= int(time.time()):
                    return jsonify(error="license_unavailable"), 403
                result = envelope(row, device)
                db.execute("UPDATE devices SET last_seen=? WHERE id=?", (int(time.time()), device["id"]))
            return jsonify(**result)
        finally:
            db.close()

    @app.post("/v1/licenses/deactivate")
    def deactivate():
        authorization = request.headers.get("Authorization", "")
        fingerprint = body().get("device_hash")
        if not authorization.startswith("Bearer ") or not re.fullmatch(r"[A-Za-z0-9_-]{43}", authorization[7:]):
            return jsonify(error="unauthorized"), 401
        if not isinstance(fingerprint, str) or not re.fullmatch(r"[a-f0-9]{64}", fingerprint):
            return jsonify(error="invalid_request"), 400
        db = connect(data_dir)
        try:
            with db:
                db.execute("BEGIN IMMEDIATE")
                device = db.execute("SELECT id FROM devices WHERE token_hash=? AND fingerprint=?",
                                    (digest(authorization[7:]), fingerprint)).fetchone()
                if device:
                    db.execute("DELETE FROM devices WHERE id=?", (device["id"],))
                    audit(db, "device.deactivated", device["id"])
            # Idempotent: an already removed or replaced token has no device slot to release.
            return jsonify(ok=True)
        finally:
            db.close()

    from admin import register_admin
    from accounts import register_accounts
    from product import register_product
    register_product(app, data_dir, key, key_id)
    register_accounts(app, data_dir, envelope)
    register_admin(app, data_dir)
    return app

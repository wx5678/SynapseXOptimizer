"""Same-origin, server-side admin sessions. Private listener until TLS is configured."""
import json
import os
import re
import secrets
import time
from functools import wraps
from pathlib import Path
from urllib.parse import urlsplit

from flask import g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash
from app import audit, connect, digest, issue

SESSION_SECONDS = 8 * 3600
DUMMY_HASH = generate_password_hash(secrets.token_urlsafe(32), method="scrypt:16384:8:1")


def set_admin(data_dir, username, password):
    if not re.fullmatch(r"[a-zA-Z0-9_.-]{3,48}", username):
        raise ValueError("Administrator name must be 3..48 ASCII letters, numbers or ._-")
    if not isinstance(password, str) or not 14 <= len(password) <= 128:
        raise ValueError("Administrator password must be 14..128 characters")
    password_hash = generate_password_hash(password, method="scrypt:16384:8:1")
    db = connect(data_dir)
    try:
        with db:
            db.execute("INSERT INTO admins VALUES(?,?,?) ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash",
                       (username, password_hash, int(time.time())))
            db.execute("DELETE FROM admin_sessions WHERE username=?", (username,))
            audit(db, "admin.password_set", username)
    finally:
        db.close()


def register_admin(app, data_dir):
    origin = os.environ.get("SYNAPSEX_ADMIN_ORIGIN", "http://127.0.0.1:8787").rstrip("/")
    parsed = urlsplit(origin)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.path:
        raise ValueError("Invalid administrator origin")
    if parsed.scheme != "https" and parsed.hostname not in ("127.0.0.1", "localhost", "::1"):
        raise ValueError("Remote administrator origin requires HTTPS")
    secure = parsed.scheme == "https"
    assets = Path(__file__).with_name("admin-web")

    @app.before_request
    def admin_boundary():
        if not request.path.startswith("/admin"):
            return None
        if request.host.lower() != parsed.netloc.lower():
            return jsonify(error="invalid_host"), 403
        if request.method == "POST" and request.headers.get("Origin") != origin:
            return jsonify(error="invalid_origin"), 403

    def authenticated(fn):
        @wraps(fn)
        def inner(*args, **kwargs):
            token = request.cookies.get("sx_admin", "")
            if not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
                return jsonify(error="unauthorized"), 401
            db = connect(data_dir)
            try:
                row = db.execute("SELECT * FROM admin_sessions WHERE token_hash=? AND expires_at>?",
                                 (digest(token), int(time.time()))).fetchone()
            finally:
                db.close()
            if row is None:
                return jsonify(error="unauthorized"), 401
            if request.method == "POST" and not secrets.compare_digest(request.headers.get("X-CSRF-Token", ""), row["csrf"]):
                return jsonify(error="invalid_csrf"), 403
            g.admin = dict(row)
            return fn(*args, **kwargs)
        return inner

    def body():
        value = request.get_json(silent=True)
        return value if isinstance(value, dict) else {}

    from accounts import register_user_admin
    register_user_admin(app, data_dir, authenticated)
    from product import register_product_admin
    register_product_admin(app, data_dir, authenticated)

    @app.get("/admin/")
    def admin_page():
        return send_from_directory(assets, "index.html")

    @app.get("/admin/assets/<name>")
    def admin_asset(name):
        if name not in ("app.js", "product.js", "style.css"):
            return jsonify(error="not_found"), 404
        return send_from_directory(assets, name)

    @app.post("/admin/api/login")
    def login():
        data = body()
        username, password = data.get("username"), data.get("password")
        if not isinstance(username, str) or not isinstance(password, str) or len(username) > 48 or len(password) > 128:
            return jsonify(error="invalid_request"), 400
        now = int(time.time())
        db = connect(data_dir)
        try:
            # Count attempts before password hashing, shared by all workers.
            with db:
                db.execute("BEGIN IMMEDIATE")
                count = db.execute("SELECT count(*) FROM audit WHERE event='admin.login_attempt' AND subject=? AND created_at>?",
                                   (digest(request.remote_addr or "unknown"), now - 600)).fetchone()[0]
                if count >= 8:
                    return jsonify(error="login_rate_limited"), 429
                audit(db, "admin.login_attempt", digest(request.remote_addr or "unknown"))
            row = db.execute("SELECT * FROM admins WHERE username=?", (username,)).fetchone()
            valid = check_password_hash(row["password_hash"] if row else DUMMY_HASH, password)
            if not valid or row is None:
                return jsonify(error="invalid_credentials"), 401
            token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
            with db:
                db.execute("DELETE FROM admin_sessions WHERE expires_at<=? OR username=?", (now, username))
                db.execute("INSERT INTO admin_sessions VALUES(?,?,?,?)", (digest(token), username, csrf, now + SESSION_SECONDS))
                audit(db, "admin.login", username)
            response = jsonify(username=username, csrf=csrf)
            response.set_cookie("sx_admin", token, max_age=SESSION_SECONDS, httponly=True,
                                secure=secure, samesite="Strict", path="/admin")
            return response
        finally:
            db.close()

    @app.get("/admin/api/session")
    @authenticated
    def session_info():
        return jsonify(username=g.admin["username"], csrf=g.admin["csrf"], expires_at=g.admin["expires_at"])

    @app.post("/admin/api/logout")
    @authenticated
    def logout():
        db = connect(data_dir)
        try:
            with db:
                db.execute("DELETE FROM admin_sessions WHERE token_hash=?", (g.admin["token_hash"],))
                audit(db, "admin.logout", g.admin["username"])
        finally:
            db.close()
        response = jsonify(ok=True)
        response.delete_cookie("sx_admin", path="/admin", secure=secure, httponly=True, samesite="Strict")
        return response

    @app.post("/admin/api/password")
    @authenticated
    def change_password():
        data = body()
        old, new = data.get("old_password"), data.get("new_password")
        if not isinstance(old, str) or len(old) > 128 or not isinstance(new, str) or not 14 <= len(new) <= 128:
            return jsonify(error="invalid_request"), 400
        db = connect(data_dir)
        try:
            row = db.execute("SELECT password_hash FROM admins WHERE username=?", (g.admin["username"],)).fetchone()
        finally:
            db.close()
        if not check_password_hash(row[0], old):
            return jsonify(error="invalid_credentials"), 401
        set_admin(data_dir, g.admin["username"], new)
        return jsonify(ok=True, login_required=True)

    @app.get("/admin/api/licenses")
    @authenticated
    def licenses():
        try:
            page = int(request.args.get("page", "1"))
            if not 1 <= page <= 100000:
                raise ValueError()
        except ValueError:
            return jsonify(error="invalid_request"), 400
        search = request.args.get("q", "")[:200]
        db = connect(data_dir)
        try:
            query = "%" + search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            where = "WHERE reference LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\'"
            total = db.execute("SELECT count(*) FROM licenses " + where, (query, query)).fetchone()[0]
            rows = db.execute("SELECT id,reference,features,expires_at,device_limit,revoked,created_at,"
                              "(SELECT count(*) FROM devices WHERE license_id=licenses.id) AS device_count "
                              "FROM licenses " + where + " ORDER BY created_at DESC,id LIMIT 25 OFFSET ?",
                              (query, query, (page - 1) * 25)).fetchall()
            now = int(time.time())
            stats = dict(db.execute("SELECT count(*) total, coalesce(sum(revoked=0 AND expires_at>?),0) active,"
                                    "coalesce(sum(revoked=1),0) revoked, coalesce(sum(revoked=0 AND expires_at<=?),0) expired FROM licenses",
                                    (now, now)).fetchone())
            return jsonify(items=[dict(row, features=json.loads(row["features"])) for row in rows],
                           page=page, total=total, stats=stats, server_time=now)
        finally:
            db.close()

    @app.post("/admin/api/licenses")
    @authenticated
    def create_license():
        data = body()
        if type(data.get("days")) is not int or type(data.get("device_limit")) is not int or not isinstance(data.get("reference"), str):
            return jsonify(error="invalid_request"), 400
        features = data.get("features")
        if not isinstance(features, list) or len(features) > 32 or any(not isinstance(f, str) for f in features):
            return jsonify(error="invalid_request"), 400
        request_id = data.get("request_id")
        if not isinstance(request_id, str) or not re.fullmatch(r"[a-f0-9-]{36}", request_id):
            return jsonify(error="invalid_request"), 400
        try:
            result = issue(data_dir, data["days"], data["device_limit"], features, data["reference"], request_id, g.admin["username"])
        except ValueError:
            return jsonify(error="invalid_request"), 400
        return jsonify(**result), 201

    @app.get("/admin/api/licenses/<license_id>/devices")
    @authenticated
    def devices(license_id):
        db = connect(data_dir)
        try:
            rows = db.execute("SELECT id,created_at,last_seen,substr(fingerprint,1,12) AS fingerprint_hint FROM devices WHERE license_id=? ORDER BY created_at", (license_id,)).fetchall()
            return jsonify(items=[dict(row) for row in rows])
        finally:
            db.close()

    @app.post("/admin/api/licenses/<license_id>/<action>")
    @authenticated
    def license_action(license_id, action):
        if action not in ("revoke", "extend", "unbind"):
            return jsonify(error="not_found"), 404
        data = body()
        reason = data.get("reason")
        if not isinstance(reason, str) or not reason.strip() or len(reason) > 200:
            return jsonify(error="reason_required"), 400
        request_id = data.get("request_id")
        if not isinstance(request_id, str) or not re.fullmatch(r"[a-f0-9-]{36}", request_id):
            return jsonify(error="invalid_request"), 400
        db = connect(data_dir)
        try:
            with db:
                db.execute("BEGIN IMMEDIATE")
                payload_hash = digest(json.dumps([action, license_id, data, g.admin["username"]], sort_keys=True))
                previous = db.execute("SELECT * FROM admin_mutations WHERE request_id=?", (request_id,)).fetchone()
                if previous:
                    if previous["payload_hash"] != payload_hash:
                        return jsonify(error="invalid_request"), 409
                    return jsonify(ok=True, already_completed=True, offline_notice="该操作已完成，本次没有重复修改。")
                row = db.execute("SELECT * FROM licenses WHERE id=?", (license_id,)).fetchone()
                if row is None:
                    return jsonify(error="not_found"), 404
                detail = {"actor": g.admin["username"], "reason": reason}
                if action == "revoke":
                    db.execute("UPDATE licenses SET revoked=1 WHERE id=?", (license_id,))
                elif action == "extend":
                    days = data.get("days")
                    now = int(time.time())
                    if row["revoked"]:
                        return jsonify(error="license_revoked"), 409
                    if type(days) is not int or not 1 <= days <= 3650:
                        return jsonify(error="invalid_request"), 400
                    expiry = max(now, row["expires_at"]) + days * 86400
                    if expiry > now + 3650 * 86400:
                        return jsonify(error="invalid_request"), 400
                    detail.update(previous_expiry=row["expires_at"], expires_at=expiry)
                    db.execute("UPDATE licenses SET expires_at=? WHERE id=?", (expiry, license_id))
                else:
                    device_id = data.get("device_id")
                    if not isinstance(device_id, str):
                        return jsonify(error="invalid_request"), 400
                    account_device = db.execute("""SELECT d.fingerprint, ul.user_id FROM devices d
                        JOIN user_licenses ul ON ul.license_id=d.license_id WHERE d.id=? AND d.license_id=?""", (device_id, license_id)).fetchone()
                    changed = db.execute("DELETE FROM devices WHERE id=? AND license_id=?", (device_id, license_id)).rowcount
                    if changed != 1:
                        return jsonify(error="not_found"), 404
                    if account_device:
                        db.execute("DELETE FROM user_sessions WHERE user_id=? AND fingerprint=?", (account_device["user_id"], account_device["fingerprint"]))
                    detail["device_id"] = device_id
                audit(db, "admin." + action, license_id, json.dumps(detail, ensure_ascii=False))
                db.execute("INSERT INTO admin_mutations VALUES(?,?,?,?)", (request_id, payload_hash, license_id, int(time.time())))
            return jsonify(ok=True, offline_notice="已签发的离线凭证在到期前仍可用，最长 7 天。")
        finally:
            db.close()

    @app.get("/admin/api/audit")
    @authenticated
    def audit_log():
        try:
            before = int(request.args.get("before", "9223372036854775807"))
            if not 1 <= before <= 9223372036854775807:
                raise ValueError()
        except ValueError:
            return jsonify(error="invalid_request"), 400
        db = connect(data_dir)
        try:
            rows = db.execute("SELECT * FROM audit WHERE id<? ORDER BY id DESC LIMIT 50", (before,)).fetchall()
            return jsonify(items=[dict(row) for row in rows])
        finally:
            db.close()

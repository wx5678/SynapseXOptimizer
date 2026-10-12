"""Software user accounts. Game accounts and administrator credentials are separate."""
import json
import os
import re
import secrets
import sqlite3
import time
import uuid
from functools import wraps

from flask import g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash
from app import audit, connect, digest

SESSION_SECONDS = 180 * 86400
DUMMY_HASH = generate_password_hash(secrets.token_urlsafe(32), method="scrypt:16384:8:1")


def owned_license(db, user_id):
    return db.execute("""SELECT l.* FROM licenses l JOIN user_licenses ul ON ul.license_id=l.id
        WHERE ul.user_id=? ORDER BY l.revoked ASC, l.expires_at DESC, l.created_at DESC LIMIT 1""",
        (user_id,)).fetchone()


def user_view(row):
    return {"id": row["id"], "username": row["username"], "created_at": row["created_at"], "role": row['role']}


def register_accounts(app, data_dir, envelope):
    def body():
        value = request.get_json(silent=True)
        return value if isinstance(value, dict) else {}

    @app.before_request
    def account_throttle():
        if request.path not in ("/v1/account/login", "/v1/account/register") or request.method != "POST":
            return
        # Shared, transactional buckets prevent expensive password hashing abuse across workers.
        now = int(time.time())
        category = request.path.rsplit("/", 1)[-1]
        limit = 5 if category == "register" else 12
        bucket = category + ":" + digest(request.remote_addr or "unknown")
        db = connect(data_dir)
        try:
            with db:
                db.execute("BEGIN IMMEDIATE")
                count = db.execute("SELECT count(*) FROM audit WHERE event='user.auth_attempt' AND subject=? AND created_at>?",
                                   (bucket, now - 600)).fetchone()[0]
                if count >= limit:
                    return jsonify(error="account_rate_limited"), 429
                audit(db, "user.auth_attempt", bucket)
        finally:
            db.close()

    def authenticated(fn):
        @wraps(fn)
        def inner(*args, **kwargs):
            auth = request.headers.get("Authorization", "")
            fingerprint = body().get("device_hash")
            if not re.fullmatch(r"Bearer [A-Za-z0-9_-]{43}", auth) or not isinstance(fingerprint, str) or not re.fullmatch(r"[a-f0-9]{64}", fingerprint):
                return jsonify(error="unauthorized"), 401
            db = connect(data_dir)
            try:
                row = db.execute("""SELECT u.*, s.token_hash, s.expires_at AS session_expires
                    FROM user_sessions s JOIN users u ON u.id=s.user_id
                    WHERE s.token_hash=? AND s.fingerprint=? AND s.expires_at>?""",
                    (digest(auth[7:]), fingerprint, int(time.time()))).fetchone()
                if row is not None:
                    binding=db.execute('SELECT fingerprint FROM user_bindings WHERE user_id=?',(row['id'],)).fetchone()
                    if row['role'] != 'admin' and binding and binding['fingerprint']!=fingerprint:
                        return jsonify(error='account_device_bound'),409
            finally:
                db.close()
            if row is None or row["disabled"]:
                return jsonify(error="unauthorized"), 401
            g.account = dict(row)
            g.fingerprint = fingerprint
            return fn(*args, **kwargs)
        return inner

    def credentials(*, owner_login=False):
        data = body()
        username, password, fingerprint = data.get("username"), data.get("password"), data.get("device_hash")
        owner = owner_login and username == "1"
        if not isinstance(username, str) or not (owner or re.fullmatch(r"[A-Za-z][A-Za-z0-9_.-]{3,31}", username)):
            return None
        if not isinstance(password, str) or not (1 if owner else 12) <= len(password) <= 128:
            return None
        if not isinstance(fingerprint, str) or not re.fullmatch(r"[a-f0-9]{64}", fingerprint):
            return None
        return username.lower(), password, fingerprint

    def session(db, row, fingerprint):
        now, token = int(time.time()), secrets.token_urlsafe(32)
        db.execute('INSERT OR IGNORE INTO user_bindings VALUES(?,?,?)',(row['id'],fingerprint,now))
        db.execute("DELETE FROM user_sessions WHERE expires_at<=? OR (user_id=? AND fingerprint=?)", (now, row["id"], fingerprint))
        # Bounded retained logins, independent from licensed-device capacity.
        if row['role'] != 'admin':
            db.execute("""DELETE FROM user_sessions WHERE token_hash IN
                (SELECT token_hash FROM user_sessions WHERE user_id=? ORDER BY created_at DESC LIMIT -1 OFFSET 9)""", (row["id"],))
        db.execute("INSERT INTO user_sessions VALUES(?,?,?,?,?)", (digest(token), row["id"], fingerprint, now + SESSION_SECONDS, now))
        db.execute("UPDATE users SET last_login=? WHERE id=?", (now, row["id"]))
        audit(db, "user.login", row["id"])
        return {"user": user_view(row), "session_token": token, "session_expires_at": now + SESSION_SECONDS}

    @app.post("/v1/account/register")
    def register():
        if os.environ.get("SYNAPSEX_REGISTRATION_ENABLED") != "1":
            return jsonify(error="registration_closed"), 403
        values = credentials()
        if not values:
            return jsonify(error="invalid_account_input"), 400
        username, password, fingerprint = values
        password_hash = generate_password_hash(password, method="scrypt:16384:8:1")
        db = connect(data_dir)
        try:
            with db:
                db.execute("BEGIN IMMEDIATE")
                if db.execute("SELECT 1 FROM users WHERE username=?", (username,)).fetchone():
                    return jsonify(error="username_unavailable"), 409
                user_id = str(uuid.uuid4())
                db.execute("INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,?,?)",
                           (user_id, username, password_hash, int(time.time())))
                audit(db, "user.register", user_id)
                result = session(db, db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone(), fingerprint)
            return jsonify(**result), 201
        finally:
            db.close()

    @app.post("/v1/account/login", endpoint="account_login")
    def login():
        values = credentials(owner_login=True)
        if not values:
            return jsonify(error="invalid_credentials"), 401
        username, password, fingerprint = values
        db = connect(data_dir)
        try:
            row = db.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
            valid = check_password_hash(row["password_hash"] if row else DUMMY_HASH, password)
            if not valid or row is None or row["disabled"] or (username == "1" and row["role"] != "admin"):
                return jsonify(error="invalid_credentials"), 401
            with db:
                db.execute("BEGIN IMMEDIATE")
                current = db.execute("SELECT * FROM users WHERE id=?", (row["id"],)).fetchone()
                if current is None or current["disabled"] or current["password_hash"] != row["password_hash"] or (username == "1" and current["role"] != "admin"):
                    return jsonify(error="invalid_credentials"), 401
                binding=db.execute('SELECT fingerprint FROM user_bindings WHERE user_id=?',(row['id'],)).fetchone()
                if current['role'] != 'admin' and binding and binding['fingerprint']!=fingerprint: return jsonify(error='account_device_bound'),409
                result = session(db, current, fingerprint)
            return jsonify(**result)
        finally:
            db.close()

    def sync_result(db):
        user = db.execute("SELECT * FROM users WHERE id=?", (g.account["id"],)).fetchone()
        # Recheck under write lock: an administrator may have disabled the account after authentication.
        if user["disabled"] or not db.execute("SELECT 1 FROM user_sessions WHERE token_hash=? AND expires_at>?", (g.account["token_hash"], int(time.time()))).fetchone():
            return {"error": "unauthorized"}, 401
        row = owned_license(db, user["id"])
        binding=db.execute('SELECT fingerprint FROM user_bindings WHERE user_id=?',(user['id'],)).fetchone()
        if user['role'] != 'admin' and binding and binding['fingerprint']!=g.fingerprint: return {'error':'account_device_bound'},409
        db.execute('INSERT OR IGNORE INTO user_bindings VALUES(?,?,?)',(user['id'],g.fingerprint,int(time.time())))
        expires=int(time.time())+SESSION_SECONDS
        db.execute('UPDATE user_sessions SET expires_at=? WHERE token_hash=?',(expires,g.account['token_hash']))
        result = {"user": user_view(user), "license": None, "status": "unlicensed", "session_expires_at":expires,
                  "vip_status": 'none' if row is None or 'vip' not in json.loads(row['features']) else 'revoked' if row['revoked'] else 'expired' if row['expires_at'] <= int(time.time()) else 'active'}
        if user['role'] == 'admin':
            # Role is never inferred from license feature strings or client-supplied fields.
            # A short-lived, device-bound signed claim is renewed independently of VIP.
            now = int(time.time())
            features = json.loads(row['features']) if row and not row['revoked'] and row['expires_at'] > now else []
            valid_vip = row and not row['revoked'] and row['expires_at'] > now
            admin_license = {'id': 'account-admin:' + user['id'], 'features': json.dumps(sorted(set(features + ['account.admin']))), 'expires_at': min(now + 300, row['expires_at']) if valid_vip else now + 300}
            device = {'id': digest(user['id'] + ':' + g.fingerprint), 'fingerprint': g.fingerprint}
            result.update(envelope(admin_license, device, user['id'], account_role='admin'), status='active', device_limit=None)
            result['license_expires_at'] = row['expires_at'] if row and not row['revoked'] and row['expires_at'] > now else None
            return result, 200
        if row is None:
            return result, 200
        result.update(license_id=row["id"], license_expires_at=row["expires_at"], device_limit=row["device_limit"])
        if row["revoked"] or row["expires_at"] <= int(time.time()):
            result["status"] = "revoked" if row["revoked"] else "expired"
            return result, 200
        device = db.execute("SELECT * FROM devices WHERE license_id=? AND fingerprint=?", (row["id"], g.fingerprint)).fetchone()
        now = int(time.time())
        if device is None:
            if db.execute("SELECT count(*) FROM devices WHERE license_id=?", (row["id"],)).fetchone()[0] >= 1:
                result["status"] = "device_limit"
                return result, 200
            device = {"id": str(uuid.uuid4()), "fingerprint": g.fingerprint}
            db.execute("INSERT INTO devices VALUES(?,?,?,?,?,?)", (device["id"], row["id"], g.fingerprint, digest(secrets.token_urlsafe(32)), now, now))
            audit(db, "user.device_bound", user["id"], device["id"])
        else:
            db.execute("UPDATE devices SET last_seen=? WHERE id=?", (now, device["id"]))
        result.update(envelope(row, device, user["id"]), status="active")
        return result, 200

    @app.post("/v1/account/sync")
    @authenticated
    def sync():
        db = connect(data_dir)
        try:
            with db:
                db.execute("BEGIN IMMEDIATE")
                result, status = sync_result(db)
            return jsonify(**result), status
        finally:
            db.close()

    @app.post("/v1/account/redeem")
    @authenticated
    def redeem():
        code = body().get("activation_code")
        if not isinstance(code, str) or not re.fullmatch(r"SX-[A-F0-9]{40}", code):
            return jsonify(error="invalid_request"), 400
        db = connect(data_dir)
        try:
            with db:
                db.execute("BEGIN IMMEDIATE")
                if db.execute("SELECT disabled FROM users WHERE id=?", (g.account["id"],)).fetchone()[0] or not db.execute("SELECT 1 FROM user_sessions WHERE token_hash=? AND expires_at>?", (g.account["token_hash"], int(time.time()))).fetchone():
                    return jsonify(error="unauthorized"), 401
                row = db.execute("SELECT * FROM licenses WHERE code_hash=?", (digest(code),)).fetchone()
                if row is None or row["revoked"] or row["expires_at"] <= int(time.time()):
                    return jsonify(error="license_unavailable"), 403
                owner = db.execute("SELECT user_id FROM user_licenses WHERE license_id=?", (row["id"],)).fetchone()
                if owner and owner["user_id"] != g.account["id"]:
                    return jsonify(error="code_already_claimed"), 409
                if not owner:
                    existing = owned_license(db, g.account["id"])
                    if existing and not existing["revoked"]:
                        return jsonify(error="existing_entitlement"), 409
                    # Never take ownership of a previously used legacy code without operator review.
                    if db.execute("SELECT 1 FROM devices WHERE license_id=?", (row["id"],)).fetchone():
                        return jsonify(error="legacy_code_in_use"), 409
                    db.execute("INSERT INTO user_licenses VALUES(?,?,?)", (row["id"], g.account["id"], int(time.time())))
                    audit(db, "user.redeem", g.account["id"], row["id"])
                result, status = sync_result(db)
            return jsonify(**result), status
        finally:
            db.close()

    @app.post("/v1/account/logout", endpoint="account_logout")
    @authenticated
    def logout():
        db = connect(data_dir)
        try:
            with db:
                db.execute("DELETE FROM user_sessions WHERE token_hash=?", (g.account["token_hash"],))
                audit(db, "user.logout", g.account["id"])
            return jsonify(ok=True)
        finally:
            db.close()


def register_user_admin(app, data_dir, authenticated):
    @app.get("/admin/api/users")
    @authenticated
    def users():
        try:
            page = int(request.args.get("page", "1"))
            if not 1 <= page <= 100000:
                raise ValueError()
        except ValueError:
            return jsonify(error="invalid_request"), 400
        query = request.args.get("q", "")[:200].strip()
        db = connect(data_dir)
        try:
            where = "WHERE instr(lower(username),lower(?))>0 OR instr(lower(remark),lower(?))>0 OR id=?"
            args = (query, query, query)
            total = db.execute("SELECT count(*) FROM users " + where, args).fetchone()[0]
            rows = db.execute("SELECT * FROM users " + where + " ORDER BY created_at DESC, id LIMIT 25 OFFSET ?", (*args, (page - 1) * 25)).fetchall()
            items = []
            for row in rows:
                item = {**user_view(row), "remark": row["remark"], "disabled": bool(row["disabled"]), "last_login": row["last_login"], "entitlement": None,
                        "session_device_count": db.execute('SELECT count(*) FROM user_sessions WHERE user_id=? AND expires_at>?', (row['id'], int(time.time()))).fetchone()[0]}
                license_row = owned_license(db, row["id"])
                if license_row:
                    item["entitlement"] = {k: license_row[k] for k in ("id", "reference", "expires_at", "device_limit", "revoked")}
                    item["entitlement"].update(features=json.loads(license_row["features"]), device_count=db.execute("SELECT count(*) FROM devices WHERE license_id=?", (license_row["id"],)).fetchone()[0])
                items.append(item)
            return jsonify(items=items, total=total, page=page, server_time=int(time.time()))
        finally:
            db.close()

    @app.post("/admin/api/users/<user_id>/<action>")
    @authenticated
    def user_action(user_id, action):
        if action not in ("grant", "remark", "disable", "enable", "unbind", "promote", "demote"):
            return jsonify(error="not_found"), 404
        data = request.get_json(silent=True)
        if not isinstance(data, dict) or not isinstance(data.get("request_id"), str) or not re.fullmatch(r"[a-f0-9-]{36}", data["request_id"]):
            return jsonify(error="invalid_request"), 400
        reason = data.get("reason")
        if not isinstance(reason, str) or not reason.strip() or len(reason) > 200:
            return jsonify(error="reason_required"), 400
        db = connect(data_dir)
        try:
            with db:
                db.execute("BEGIN IMMEDIATE")
                payload = digest(json.dumps([user_id, action, data, g.admin["username"]], sort_keys=True))
                previous = db.execute("SELECT * FROM admin_mutations WHERE request_id=?", (data["request_id"],)).fetchone()
                if previous:
                    if previous["payload_hash"] != payload:
                        return jsonify(error="invalid_request"), 409
                    return jsonify(ok=True, already_completed=True)
                row = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
                if row is None:
                    return jsonify(error="not_found"), 404
                if action == "grant":
                    if row["disabled"]:
                        return jsonify(error="account_disabled"), 409
                    existing = owned_license(db, user_id)
                    if existing and not existing["revoked"]:
                        return jsonify(error="existing_entitlement"), 409
                    days, limit, features = data.get("days"), data.get("device_limit"), data.get("features")
                    if limit != 1: return jsonify(error='single_device_required'),400
                    if type(days) is not int or not 1 <= days <= 3650 or type(limit) is not int or not 1 <= limit <= 10 or not isinstance(features, list) or not 1 <= len(features) <= 32 or any(not isinstance(f, str) or not re.fullmatch(r"[a-z][a-z0-9_.-]{0,63}", f) for f in features):
                        return jsonify(error="invalid_request"), 400
                    license_id, now = str(uuid.uuid4()), int(time.time())
                    db.execute("INSERT INTO licenses VALUES(?,?,?,?,?,?,0,?)", (license_id, digest(secrets.token_urlsafe(40)), "账号 " + row["username"], json.dumps(sorted(set(features))), now + days * 86400, limit, now))
                    db.execute("INSERT INTO user_licenses VALUES(?,?,?)", (license_id, user_id, now))
                elif action in ('promote', 'demote'):
                    if row['disabled']:
                        return jsonify(error='account_disabled'),409
                    if action == 'promote':
                        db.execute("UPDATE users SET role='admin' WHERE id=?", (user_id,))
                    else:
                        db.execute("UPDATE users SET role='user' WHERE id=?", (user_id,))
                        db.execute('DELETE FROM user_sessions WHERE user_id=?', (user_id,))
                        db.execute('DELETE FROM user_bindings WHERE user_id=?', (user_id,))
                        db.execute('DELETE FROM devices WHERE license_id IN (SELECT license_id FROM user_licenses WHERE user_id=?)', (user_id,))
                elif action == 'unbind':
                    db.execute('DELETE FROM user_bindings WHERE user_id=?',(user_id,))
                    db.execute('DELETE FROM user_sessions WHERE user_id=?',(user_id,))
                    db.execute('DELETE FROM devices WHERE license_id IN (SELECT license_id FROM user_licenses WHERE user_id=?)',(user_id,))
                elif action == "remark":
                    if not isinstance(data.get("remark"), str) or len(data["remark"]) > 200:
                        return jsonify(error="invalid_request"), 400
                    db.execute("UPDATE users SET remark=? WHERE id=?", (data["remark"].strip(), user_id))
                else:
                    db.execute("UPDATE users SET disabled=? WHERE id=?", (int(action == "disable"), user_id))
                    if action == "disable":
                        db.execute("DELETE FROM user_sessions WHERE user_id=?", (user_id,))
                audit(db, "admin.user_" + action, user_id, json.dumps({"actor": g.admin["username"], "reason": reason}, ensure_ascii=False))
                db.execute("INSERT INTO admin_mutations VALUES(?,?,?,?)", (data["request_id"], payload, user_id, int(time.time())))
            return jsonify(ok=True)
        finally:
            db.close()

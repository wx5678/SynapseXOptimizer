"""Local operator-only provisioning; never exposed as a public HTTP endpoint."""
import re
import time
import uuid

from werkzeug.security import generate_password_hash
from app import audit, connect


def create_software_admin(data_dir, username, password, *, allow_owner_short_credentials=False):
    owner = allow_owner_short_credentials and username == "1"
    if not isinstance(username, str) or not (owner or re.fullmatch(r"[A-Za-z][A-Za-z0-9_.-]{3,31}", username)):
        raise ValueError("Invalid software account name")
    if not isinstance(password, str) or not (1 if owner else 12) <= len(password) <= 128:
        raise ValueError("Invalid password length")
    password_hash = generate_password_hash(password, method="scrypt:16384:8:1")
    user_id = str(uuid.uuid4())
    db = connect(data_dir)
    try:
        with db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute("SELECT 1 FROM users WHERE username=?", (username,)).fetchone():
                raise ValueError("Account already exists; refusing to replace its password or role")
            db.execute("INSERT INTO users(id,username,password_hash,created_at,role) VALUES(?,?,?,?,?)",
                       (user_id, username.lower(), password_hash, int(time.time()), "admin"))
            audit(db, "operator.software_admin_create", user_id)
        return user_id
    finally:
        db.close()

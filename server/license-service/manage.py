"""Local-only administration; invoke as the dedicated service user via SSH/Workbench."""
import argparse
import json
import os
from pathlib import Path
import sqlite3
import getpass
import secrets
from datetime import datetime, timezone
from app import audit, connect, initialize, issue


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default=os.environ.get("SYNAPSEX_DATA_DIR", "/var/lib/synapsex-license"))
    parser.add_argument("--key-path", default=os.environ.get("SYNAPSEX_KEY_PATH", "/etc/synapsex-license/signing.pem"))
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("init")
    commands.add_parser("list")
    issuing = commands.add_parser("issue")
    issuing.add_argument("--days", type=int, required=True)
    issuing.add_argument("--devices", type=int, default=2)
    issuing.add_argument("--feature", action="append", required=True)
    issuing.add_argument("--reference", required=True)
    commands.add_parser("revoke").add_argument("license_id")
    commands.add_parser("unbind").add_argument("device_id")
    commands.add_parser("backup").add_argument("destination")
    admin = commands.add_parser("admin-set")
    admin.add_argument("username")
    admin.add_argument("--generate-file", help="Create a new 0600 credential file; never overwrite")
    software_admin = commands.add_parser("software-admin-create", help="Create a client administrator, NOT a backend administrator")
    software_admin.add_argument("username")
    software_admin.add_argument("--allow-owner-short-credentials", action="store_true", help="Explicit exception for locally provisioned owner account 1 only")
    args = parser.parse_args()
    if args.command == "software-admin-create":
        from software_admin import create_software_admin
        password = getpass.getpass("New software account password: ")
        if password != getpass.getpass("Repeat password: "):
            raise ValueError("Passwords do not match")
        user_id = create_software_admin(args.data_dir, args.username, password,
            allow_owner_short_credentials=args.allow_owner_short_credentials)
        print("Software administrator created: " + user_id + "; no backend access granted")
        return
    if args.command == "init":
        initialize(args.data_dir, args.key_path)
        print("Initialized; signing key retained on server only")
        return
    if args.command == "admin-set":
        from admin import set_admin
        if args.generate_file:
            password = secrets.token_urlsafe(24)
            # Create exclusively before changing the account, never overwrite existing credentials.
            fd = os.open(args.generate_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as target:
                target.write("Administrator: " + args.username + "\nPassword: " + password + "\n")
            set_admin(args.data_dir, args.username, password)
            print("Administrator created; credentials saved in the specified private file. Change the password after login.")
        else:
            password = getpass.getpass("New administrator password (14+ characters): ")
            if password != getpass.getpass("Repeat password: "):
                raise ValueError("Passwords do not match")
            set_admin(args.data_dir, args.username, password)
            print("Administrator updated; existing sessions invalidated")
        return
    if args.command == "issue":
        print(json.dumps(issue(args.data_dir, args.days, args.devices, args.feature, args.reference)))
        return
    db = connect(args.data_dir)
    try:
        if args.command == "list":
            rows = db.execute("""SELECT l.id,l.reference,l.expires_at,l.device_limit,l.revoked,
                       (SELECT count(*) FROM devices d WHERE d.license_id=l.id) AS devices
                       FROM licenses l ORDER BY l.created_at DESC LIMIT 100""").fetchall()
            print(json.dumps([dict(row) for row in rows], ensure_ascii=False))
        elif args.command in ("revoke", "unbind"):
            with db:
                if args.command == "revoke":
                    changed = db.execute("UPDATE licenses SET revoked=1 WHERE id=?", (args.license_id,)).rowcount
                    subject = args.license_id
                else:
                    changed = db.execute("DELETE FROM devices WHERE id=?", (args.device_id,)).rowcount
                    subject = args.device_id
                if changed != 1:
                    raise ValueError("Target not found; nothing changed")
                audit(db, "admin." + args.command, subject)
            print("Done; cached signed permits remain valid until their signed expiration")
        elif args.command == "backup":
            destination = Path(args.destination)
            destination.mkdir(parents=True, exist_ok=True, mode=0o700)
            target = destination / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + ".sqlite3")
            out = sqlite3.connect(target)
            try:
                db.backup(out)
                if out.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                    raise RuntimeError("Backup integrity check failed")
            finally:
                out.close()
            os.chmod(target, 0o600)
            print(str(target))
    finally:
        db.close()


if __name__ == "__main__":
    os.umask(0o077)
    main()

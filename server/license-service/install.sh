#!/bin/sh
# Run from an uploaded release directory. Does not open firewall ports or alter SSH.
set -eu
umask 077
test "$(id -u)" -eq 0
release=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
case "$release" in /opt/synapsex-license/releases/*) ;; *) echo 'Unexpected release directory' >&2; exit 1;; esac
test -x /usr/bin/gunicorn
/usr/bin/python3 -c 'import flask, cryptography'
/usr/bin/python3 -m unittest discover -s "$release" -p 'test_*.py' -v
systemd-analyze verify "$release/synapsex-license.service" "$release/synapsex-license-backup.service" "$release/synapsex-license-backup.timer"
previous=''
if test -L /opt/synapsex-license/current; then
    previous=$(readlink /opt/synapsex-license/current)
    case "$previous" in /opt/synapsex-license/releases/*) ;; *) echo 'Invalid previous release' >&2; exit 1;; esac
fi
rollback() {
    result=$?
    if test "$result" -ne 0 && test -n "$previous"; then
        ln -sfn "$previous" /opt/synapsex-license/current
        for name in synapsex-license.service synapsex-license-backup.service synapsex-license-backup.timer; do
            if test -f "$release/$name.previous"; then
                install -o root -g root -m 0644 "$release/$name.previous" "/etc/systemd/system/$name"
            fi
        done
        systemctl daemon-reload
        systemctl restart synapsex-license.service
        echo 'Deployment failed; restored previous application release. Database migration is additive.' >&2
    fi
    exit "$result"
}
trap rollback 0
if test -n "$previous"; then
    /usr/bin/python3 "$previous/manage.py" backup /var/backups/synapsex-license
    systemctl stop synapsex-license.service
fi
if ! getent passwd synapsex-license >/dev/null; then
    useradd --system --home-dir /var/lib/synapsex-license --shell /usr/sbin/nologin synapsex-license
fi
install -d -o synapsex-license -g synapsex-license -m 0700 /var/lib/synapsex-license
install -d -o root -g synapsex-license -m 0750 /etc/synapsex-license
install -d -o root -g root -m 0700 /var/backups/synapsex-license
/usr/bin/python3 "$release/manage.py" init
chown synapsex-license:synapsex-license /var/lib/synapsex-license/licenses.sqlite3
for suffix in -wal -shm; do
    if test -e "/var/lib/synapsex-license/licenses.sqlite3$suffix"; then
        chown synapsex-license:synapsex-license "/var/lib/synapsex-license/licenses.sqlite3$suffix"
    fi
done
chown root:synapsex-license /etc/synapsex-license/signing.pem
chmod 0640 /etc/synapsex-license/signing.pem
chmod 0755 /opt/synapsex-license /opt/synapsex-license/releases "$release"
chmod 0644 "$release"/*.py "$release"/*.service "$release"/*.timer
chmod 0755 "$release/admin-web"
chmod 0644 "$release/admin-web"/*
chmod 0755 "$release/public-assets"
chmod 0644 "$release/public-assets"/*
if test -e /opt/synapsex-license/current && ! test -L /opt/synapsex-license/current; then
    echo 'Refusing to replace a non-symlink current directory' >&2; exit 1
fi
if test -L /opt/synapsex-license/current; then
    readlink /opt/synapsex-license/current > "$release/previous-release.txt"
fi
ln -sfn "$release" /opt/synapsex-license/current
for name in synapsex-license.service synapsex-license-backup.service synapsex-license-backup.timer; do
    if test -e "/etc/systemd/system/$name"; then
        cp -p "/etc/systemd/system/$name" "$release/$name.previous"
    fi
    install -o root -g root -m 0644 "$release/$name" "/etc/systemd/system/$name"
done
systemctl daemon-reload
systemctl enable synapsex-license.service synapsex-license-backup.timer
systemctl restart synapsex-license.service
/usr/bin/python3 "$release/verify_health.py"
systemctl start synapsex-license-backup.timer synapsex-license-backup.service
systemctl is-active synapsex-license.service
systemctl list-timers synapsex-license-backup.timer --no-pager

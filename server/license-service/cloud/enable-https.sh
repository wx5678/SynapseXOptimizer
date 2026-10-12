#!/bin/sh
# Certificate must already be issued; this script does not accept CA terms or set passwords.
set -eu
umask 077
test "$(id -u)" -eq 0
base=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
case "$base" in /opt/synapsex-license/releases/*/cloud) ;; *) exit 1;; esac
test -f /etc/letsencrypt/live/39.96.195.192/fullchain.pem
test -f /etc/letsencrypt/live/39.96.195.192/privkey.pem
test ! -e /etc/synapsex-license/service.env
test ! -e "$base/nginx-http.previous"
cp -p /etc/nginx/sites-available/synapsex "$base/nginx-http.previous"
rollback() {
    result=$?
    if test "$result" -ne 0; then
        install -m 0644 "$base/nginx-http.previous" /etc/nginx/sites-available/synapsex
        nginx -t && systemctl reload nginx.service
        echo 'HTTPS activation failed; restored HTTP-only gateway (no backend exposed).' >&2
    fi
    exit "$result"
}
trap rollback 0
install -o root -g synapsex-license -m 0640 "$base/service.env" /etc/synapsex-license/service.env
systemctl restart synapsex-license.service
/usr/bin/python3 "$base/../verify_health.py"
install -o root -g root -m 0644 "$base/nginx-https.conf" /etc/nginx/sites-available/synapsex
nginx -t
systemctl reload nginx.service
curl --fail --silent --resolve 39.96.195.192:443:127.0.0.1 https://39.96.195.192/healthz
install -o root -g root -m 0755 "$base/synapsex-cert-reload" /usr/local/sbin/synapsex-cert-reload
install -o root -g root -m 0644 "$base/synapsex-cert-renew.service" /etc/systemd/system/synapsex-cert-renew.service
install -o root -g root -m 0644 "$base/synapsex-cert-renew.timer" /etc/systemd/system/synapsex-cert-renew.timer
systemctl daemon-reload
systemctl enable --now synapsex-cert-renew.timer
systemctl list-timers synapsex-cert-renew.timer --no-pager

#!/bin/sh
# Run only after approval to expose HTTP/HTTPS on the named server.
set -eu
test "$(id -u)" -eq 0
base=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
case "$base" in /opt/synapsex-license/releases/*/cloud) ;; *) exit 1;; esac
test ! -e /etc/nginx/sites-enabled/synapsex
if test -L /etc/nginx/sites-enabled/default; then
    test "$(readlink -f /etc/nginx/sites-enabled/default)" = /etc/nginx/sites-available/default
    test ! -e "$base/nginx-default.previous"
    mv /etc/nginx/sites-enabled/default "$base/nginx-default.previous"
fi
install -d -o root -g root -m 0755 /var/www/synapsex-acme/.well-known/acme-challenge
install -o root -g root -m 0644 "$base/nginx-http.conf" /etc/nginx/sites-available/synapsex
ln -s /etc/nginx/sites-available/synapsex /etc/nginx/sites-enabled/synapsex
nginx -t
systemctl enable --now nginx.service
systemctl reload nginx.service
curl --fail --silent --head http://127.0.0.1/

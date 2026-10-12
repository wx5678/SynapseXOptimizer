# 0.39.19 — operator-provisioned owner login

Client accepts login-only username `1`; public registration keeps the existing 4–32 character, letter-first username and 12–128 character password requirements. No production password is embedded in source, tests, or the package.

The service accepts that exceptional login only for a database user with role `admin`. Password verification, IP rate limits, encrypted client session persistence and short-lived signed role claims are unchanged. Disabling/demoting the account prevents owner login. The role does not grant website-backend access or automatically create a separate VIP entitlement.

Local server operator command: `python3 manage.py software-admin-create 1 --allow-owner-short-credentials`. Password input is hidden and confirmed twice. Existing usernames are never overwritten. Passwords use scrypt; creation is audited. This command is not an HTTP route.

Verified locally: 236 Node tests; 51 Python service tests; production build/package; two real portable resource isolation launches. Tests cover cross-device owner login, session persistence without passwords, registration rejection, wrong passwords, duplicate provisioning, disabled/demoted users and backend access isolation.

Package: `release/0.39.19-owner-account/SynapseX-Game-Optimizer-0.39.19.exe`.

Cloud preparation: Workbench tab 15 is connected to the specified ECS instance. Live release is `/opt/synapsex-license/releases/0.4.2-admin-44cffeeec395`; its accounts.py hash matches the reviewed prior source. `scripts/build-owner-account-transfer.cjs` serves a loopback-only reviewed deployment command, verifies previous source hashes, clones the live release, overlays only the account-related files and version, and uses the existing tested backup/rollback installer. It preserves all unrelated cloud files.

Cloud completed 2026-09-16: deployed `/opt/synapsex-license/releases/0.4.3-owner-b3d466328227`; 51 service tests passed on the server, health reported version 0.4.3 and systemd active. Pre-deployment database backup: `/var/backups/synapsex-license/20260916T091552056545Z.sqlite3`. Previous code remains available for rollback.

Created software administrator `1` using hidden, twice-confirmed input through the local operator CLI as the service user. No backend administrator was created or modified. HTTPS verification using the actual Electron account implementation and production public key passed on two independent test device fingerprints, including signed admin role verification and restoring encrypted login state. Both devices stayed valid concurrently. Verification sessions were logged out and only isolated smoke-test files removed; the user's existing software profile was untouched. No separate VIP entitlement was issued (`vipStatus: none`).

Use the new 0.39.19 executable: older client versions still reject this short username/password before sending a request. Artifact SHA-256: `F9AF55B5B8DF47E837E859C7EF507E833D58A883850BB738445A371427019005`.

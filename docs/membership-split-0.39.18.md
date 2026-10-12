# 0.39.18 — free diagnostics / VIP application boundaries

## Delivered behavior

- Free: basic one-click optimization; existing monitoring/overlay/reporting; one-account automatic sign-in; lab latency and input/driver diagnostics; compatibility inspection and current settings; game-library and exemption-list preferences; stop/restore operations and records.
- VIP retained: optimal/maximum one-click application, expert settings application, TCP/QoS and advanced NIC writes, lab advanced session/core/thread/driver/persistent experimental writes, up to three sign-in accounts with batch sign-in.
- Higher-risk experiments retain explicit confirmation, compatibility checks and existing recovery mechanisms. They are not advertised as guaranteed performance benefits. This change does not certify experimental performance gains or move them into one-click optimization.
- JiuYin FPS/view-distance above original limits remains software-administrator-only. Normal VIP grants do not authorize those writes. Human tuning/overclocking services are stated as separately quoted.
- Merely visiting a premium settings page no longer opens the registration dialog. Premium application requests still trigger the existing account/authorization flow. NIC options can be previewed without membership; applying still checks VIP.

## Implementation

`host/feature-access.json` is the explicit route inventory, shared by Electron and the PowerShell host. It is included both inside ASAR and with the native host resources. Reads, diagnostics, benign preferences and recovery are explicitly allowed without a VIP capability. Known paid writes and unknown paths in protected endpoint families fail closed. Endpoint names ending in `state` or `restore` no longer receive an automatic exemption.

Existing feature IDs and signed license claims are unchanged (`lab.all` now describes advanced lab applications, not all lab tools). No price changes, new roles or cloud data migrations. The cloud authorization service does not require deployment for the new client permission split. The repository's admin help text was corrected, but its cloud copy was not deployed in this task.

## Verification

- 235/235 Node unit/regression tests passed, including free/expired/revoked permissions, partial grants, account quotas, admin-only FPS, explicit route inventory and PowerShell/Electron parity.
- TypeScript/Vite build and portable packaging passed; existing bundle-size warning only.
- Actual packaged host integration passed: all ten paid write routes returned 403 without VIP; selected reads/preferences succeeded; both diagnostic start routes reached confirmation validation; a free latency measurement started and stopped successfully; recovery was not gated. Invalid application/recovery inputs were used to avoid modifying real system settings or restoring user backups.
- The existing HTTP abort/crash/recovery/report persistence tests passed with the new package.
- Actual Electron ASAR load verified shared-policy inclusion and free/paid decisions.
- Two actual portable Node-mode probes confirmed independent extraction and preserved first-instance resources after the second exited. Probes did not launch the product UI or use real accounts.

No real VIP optimization, driver installation, game modification, cloud authorization mutation or new UI screenshot validation was performed.

## Release

`release/0.39.18-membership-split/SynapseX-Game-Optimizer-0.39.18.exe`

Size: 108062884 bytes.

SHA256: `641FE5FD54C232F3F04FDA5E35A29EFF4A259C2A3E201AAB743203AD1E4368C3`

Fully close the previous client and open this version to use the new boundaries. Existing prices, memberships and account data are preserved; no public release was published.

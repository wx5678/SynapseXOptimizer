# 0.39.22 — visible update entry and close-to-tray

## User-visible changes

- Add a check-updates button in the shared top navigation and a software-update
  card in Settings. Checks do not require login or VIP. No-update and connection
  errors are visible; manual checking can reopen a previously dismissed release.
- Clicking the main window X (including Alt+F4) defaults to a native dialog:
  minimize to tray / exit / cancel, with an optional remember checkbox.
- Settings can change the choice back to ask, or select tray/exit directly.
- Hiding keeps the workbench renderer and existing background services alive.
  It does not enable monitoring, optimization or auto-sign options by itself.
- The notification-area menu supports open workspace, check updates and exit;
  double-click opens the workspace. Startup-background mode reuses its existing
  tray icon rather than creating another one.
- Explicit exit bypasses the remembered close action and uses the existing
  report flush, collector, overlay and service shutdown path. The mandatory
  update dialog's exit button now uses this explicit exit API.
- Tray initialization/save failure keeps the main window visible. Repeated X
  clicks coalesce while the question is open. Cancel never stores a preference.

## Existing update behavior (verified from source)

1. Startup and every 15 minutes fetch `/v1/product` from the configured service.
2. Verify signed manifest, issuer/audience, expiry and rollback protection.
3. A release is offered only if enabled and its numeric version is newer.
4. Optional releases can be postponed. A known mandatory release blocks normal
   UI access and guarded operations, including offline after manifest caching;
   recovery/stop paths remain available. No unknown server policy can be learned
   on a first offline launch.
5. Download only from allowed Gitee HTTPS addresses and allowed redirects, with
   progress from bytes read. Verify length, SHA-256 and executable header.
6. This is a portable application, not an auto-replacing installer: after a
   verified download, open the containing folder, fully exit the old application,
   and run the new executable. Accounts/settings share the existing userData.
   If startup was enabled, re-register it after moving to a different EXE path.

## Actual public-channel checks on 2026-09-16

- `https://39.96.195.192/v1/product` returned a valid signed manifest, revision 0.
- `update.enabled=false`, version `0.0.0`; URL/hash are empty, size 0.
- Anonymous Gitee releases API for `wx_Tens/youxiyouhuaqianzhuangbao` returned a
  preview release `v0.39.0-preview.1`, with a SHA-256 text file and source archives.
  There was no EXE asset. Source archives are not runnable software updates.
- The release description reports its prior EXE upload exceeded that repository's
  100M per-asset limit. The local 0.39.21 EXE is 108,061,911 bytes; do not assume a
  new build can be uploaded unchanged without checking the current limit.
- Therefore production end-to-end download/update is NOT yet validated or usable.
  Publish an anonymously downloadable executable with its exact version/hash/size,
  test an optional update first, and only then consider mandatory release mode.
- This change does not publish assets, alter cloud settings or enable force-update.

## Tests

- 253 Node tests pass, covering preference persistence/reset/corruption, cancel,
  close-dialog concurrency, shutdown races, tray initialization failure, existing
  startup tray reuse, main-frame IPC guards and explicit-quit semantics.
- Real isolated Electron/Windows tray lifecycle test passes: main close event,
  hidden-but-not-destroyed window, native tray reopen/update/exit callbacks,
  and remembered choice after constructing a new controller.
- Update tests cover signed optional and mandatory policy, restart/offline cache,
  disabled/equal/older versions, streamed download progress, allowed and forbidden
  redirects, incorrect hashes/HTML/size, and cancellation with partial cleanup.
- Update download fixtures do not execute binaries and are not evidence of a
  successful production Gitee EXE download. Native tray tests do not access real
  user accounts, game resources, startup registry or the optimizer host.

Build output: `release/0.39.22-tray-updates/SynapseX-Game-Optimizer-0.39.22.exe`.

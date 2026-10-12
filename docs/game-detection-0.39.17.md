# 0.39.17 — portable startup and game-only automatic monitoring

## Changes

- Each portable launch uses its own NSIS `$PLUGINSDIR/app` extraction directory. Previously the build-level shared directory could be removed by a second launch exiting, breaking HTML and other resources used by the first instance.
- `portable.unpackDirName: true` is intentional: installed electron-builder 26.15.3's `NsisTarget.js` emits the shared `UNPACK_DIR_NAME` for a string or any falsy value. Its type-documentation statement about `false` contradicts that implementation. A test checks the installed implementation and an integration probe checks the resulting executable.
- Startup waits for both an authenticated API response and actual HTML containing the React root, rather than accepting API status alone.
- Automatic candidates must have a recognized game executable, game-library directory or engine evidence. Foreground focus, memory/CPU/GPU load and a generic `client.exe` are insufficient. WeChat variants, browsers, launchers, capture/remote-access apps and common helpers are excluded.
- Homepage, reports, monitor selection, overlay sampling and native automatic capture respect the same candidate eligibility. An existing FPS collector cannot pin an ineligible desktop app. Homepage samples clear after detection confirms no game.
- Overlay enabled preference remains persistent. Eligible game start shows it; three consecutive missing-target scans close it (normally 6–9 seconds). Alt+Tab, minimizing a recognized live game and transient request failure do not count as game exit. Explicitly closing/disabling overlay still disables the persistent preference.
- Unknown games can be manually bound by executable name. No game injection, driver installation, system optimization, account changes or game-file writes were performed for this release.

## Verification

- `pnpm run build` and `pnpm run package:win`: passed; existing large-chunk advisory only.
- `node --test tests/*.test.cjs`: 230/230 passed.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/Test-MonitorTargetStability.ps1`: passed, including WeChat/browser/launcher exclusions, generic-client rejection, CS2/Unreal fixtures, minimized retention and exit clearing.
- `tests/host-http.integration.cjs` against packaged resources: passed (aborted asset/body handling, auth/VIP checks, report persistence, host child crash/restart).
- `tests/portable-resources.integration.cjs`: passed with the actual 0.39.17 portable executable. Two concurrent Node-mode probes used distinct extraction directories; second cleanup preserved first HTML, referenced JS/CSS and host script. This does not launch product UI, use real accounts, invoke UAC or touch user's running application.
- Read-only scan on this machine: 10 candidates, no eligible game; both `Weixin.exe` and `WeChatAppEx.exe` had `autoEligible: false` (about 1.15 seconds).

Game fixtures verify selection/lifecycle logic, not compatibility with every installed game or exclusive fullscreen rendering. Games without known executable/directory/engine evidence need manual binding. Software must remain running with “游戏悬浮窗” enabled; the startup sign-in-only tray mode does not start monitoring.

## Artifact

`release/0.39.17-game-detection/SynapseX-Game-Optimizer-0.39.17.exe`

SHA256: `2D26426CAFEA1252B020CC33A89240CBA6BABEAABEFEB05CBFBF7FF8E472F900`

Exit the previous app completely before opening the new version. Existing preferences and accounts are retained. No cloud deployment or release publication was performed.

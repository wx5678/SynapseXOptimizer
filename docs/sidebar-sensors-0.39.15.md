# 0.39.15 — sidebar and CPU sensor installer

## Changes

- Sign-in text follows the entire sidebar hover/focus state; no second hover over the icon is required.
- Drawer background uses separate transformed connector/end-cap layers (300 ms). Menu width stays fixed; whole-menu clipping is no longer animated. Labels fade for 160 ms. Keyboard focus and reduced-motion preferences remain immediate.
- Sign-in and backup badges share 44 px geometry and alignment in dark/light appearances.
- Missing CPU sensor driver now offers download/install plus official documentation. A native confirmation precedes downloading; the official installer remains interactive and may request elevation/reboot.
- Pinned official PawnIO 2.2.0 installer: 3,410,960 bytes, SHA-256 `1f519a22e47187f70a1379a48ca604981c4fcf694f4e65b734aaa74a9fba3032`. PowerShell rechecks size/hash and valid Authenticode certificate before launch. No silent install, automatic terms acceptance, forced reboot, or security-setting changes.
- Electron download uses Chromium networking; Windows PowerShell module path is repaired locally in the verification process when inherited from PowerShell 7.

## Verification (2026-09-16)

- Build and Windows portable packaging passed.
- Full Node regression suite: 210/210 passed.
- Packaged-host HTTP integration passed, including interrupted asset downloads, malformed/truncated requests, authentication/VIP checks, report persistence and supervised crash recovery.
- Actual Electron official download + SHA-256 + Authenticode check passed using `-VerifyOnly`; **no driver was installed**.
- Browser UI verified shared hover expansion, keyboard focus, light/dark badges, game-effects-off transition compatibility and cancelled installation feedback.
- Isolated 6-second sidebar animation fixture, light appearance: 990 frames, P95 6.1 ms, maximum 6.2 ms, zero intervals above 33 ms, content-width change 0 px. Dark fixture also passed. These are browser fixture observations, not a guarantee under full game/GPU load.
- CPU temperature after actual driver installation remains unverified because installation was not performed.

## Artifact

`release/0.39.15-sidebar-sensors/SynapseX-Game-Optimizer-0.39.15.exe`

- Size: 108,056,603 bytes.
- SHA-256: `3183d418f1a410f857ebd4e11fa83fbe15adb00409731c9d24857ae92f61a84c`.
- Packaged `InstallSensorDriver.ps1` hash matches source.
- No cloud pricing, licensing or update configuration was changed.

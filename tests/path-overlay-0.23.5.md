# 0.23.5 verification — 2026-09-07

## Game location

The 0.23.4 live host returned empty gameRoot/gameExecutable while gameRunning was true. The executable and launcher existed on disk. Startup-only detection used Process.Path, which returned no path for the running game in the diagnostic environment.

Added repeatable discovery using QueryFullProcessImageName with PROCESS_QUERY_LIMITED_INFORMATION. Windows PowerShell 5.1 resolved the running game's actual bin64/fxgame.exe successfully. No injection or protection bypass was used.

- Test-GameDiscovery.ps1: empty discovery; stored directory without a running game; missing directory rejection; live detection after an empty result — passed.
- game-paths.test.cjs: merge concurrent saves, reload from a new native store, preserve saved values after invalid input — passed.
- Paths are stored in the application's userData/game-paths-v1.json, independent of the random localhost port. Explicit browse/save errors are shown to the user. Automatic persistence of incomplete typed paths is ignored; valid prior data is retained.

## Overlay

No generic background-click close handler was found in 0.23.4. The exact original disappearance mechanism was not established: native inspection found an overlay window still present, and the click attempt reported an obscuring non-target window. Do not claim a confirmed original hitbox cause.

The patch removes full-surface native dragging, provides a dedicated handle, disables minimize/maximize/resize gestures, fixes the X hitbox at 26x26, and permits close only from explicit close controls or application shutdown. Reopening disables mouse passthrough and updates the UI toggle.

overlay-window.integration.cjs runs production overlay window creation, real built React/CSS and preload, with a test-only offline telemetry server. It does not launch PresentMon or alter system/game settings.

- Horizontal and grid: actual renderer mouse clicks on metrics and padding keep the window alive.
- Both: unrequested native close is prevented; clicking X closes successfully.
- Both: computed root drag region is no-drag; dedicated handle is drag; X is 26x26.
- Existing desktop-exit tests still pass for main-window exit and collector shutdown ordering.

Full interactive dragging and exclusive-fullscreen visibility across other hardware were not tested. No claim of universal fullscreen support.

## Release

- 11 Node regression tests passed.
- TypeScript/Vite build and 0.23.5 Windows portable packaging passed.
- Packaged host integration: start, runtime compatibility audit, forced monitor target scan, network toolkit, shutdown, excluded development fixtures and retired endpoints — passed.
- The existing user application was not terminated or replaced during testing. Quit the old application before launching the 0.23.5 portable executable, otherwise its single-instance lock will activate the old version.

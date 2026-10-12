# 0.39.16 — combined frame/view limits and overlay position

## Behavior

- Game configuration combines FPS and view-distance limits in one card and one backed-up resource transaction. The original UI resource, not DLLs or process memory, is modified.
- Ordinary accounts: FPS 60–300, view 50–250. Software administrators, verified online before generation and again before replacement: FPS up to 1000 (actual 999 in steps of 3); view up to 1000 (steps of 2, actual 1000).
- Both numeric limits are resource/UI maxima. Applying does not change an account's currently selected in-game slider values. View values are internal units, not meters. Map-specific rules may cap or override rendering distance. High view settings have not been individually game-tested.
- UI and confirmation explain: larger view values usually show farther, but increase GPU load and may reduce frame rate. Formal application/restore remains game-closed-only.
- Active administrators retain raised limits. Ordinary accounts retain existing raised limits with valid VIP. Confirmed online VIP expiry restores the original resource (300 FPS / 250 view), only for managed roots with verified original backup and after game exit. Offline/logout/unknown membership is never interpreted as expiry. Resource restoration does not directly rewrite saved account settings.
- The prior local 999 FPS / 450 view test hash is recognized. It is never mistaken for an original backup. Import requires the exact original supported package; unknown edits/versions remain blocked.
- Legacy INI view editor restricted to 50–250 so it does not offer a second unrestricted high-view entry. Restoring existing backups remains available.
- Overlay starts horizontally centered, 8 DIP below the primary display work-area top. Dragged position is debounced and saved locally, flushed on close/destruction, and reused after recreation/app restart. The saved monitor is remembered; disconnect falls back to primary top, resolution/layout changes clamp into the available area.

## Verification

- Node regression: **222/222 passed**.
- Actual original-resource read-only conversion matrix: 64/64 combinations passed; verifies decompression, requested limits, exact resource and package sizes, and unchanged bytes outside the selected block. No generated packages written to the game.
- Packaged module running in Electron: 16/16 selected combinations passed, including 999 FPS + 1000 view. Packaged overlay-position module loaded successfully.
- Synthetic tests cover joint backup/recovery, visual-only expiry, role recheck at commit, original-range free use, known altered-resource import, and unknown/corrupt resource refusal.
- Position tests cover top default, corrupt preference fallback, negative monitor coordinates, debounce, restart/close persistence, disconnected/repositioned monitor, resize bounds and transient display errors. Lifecycle tests verify coordinates are passed to native window construction and existing recovery/close behavior remains intact. User-driven dragging in the packaged desktop app under game load remains to be confirmed.
- Browser isolated UI: ordinary view=1000 submission disabled; administrator FPS=1000 + view=1000 requires FPS risk acknowledgement; confirmation includes both values and performance warning; applied mock state shows 999/1000; non-admin restore yields 300/250. Dark layout visually checked. No production authorization or game mutation from UI fixture.
- Packaged-host integration passed interrupted downloads, malformed/truncated requests, auth/VIP, report persistence and child-service recovery.
- Live game read-only check: still running, recognized as 999 FPS / 450 view. Resource SHA256 remains `a63a6b79ee13c3ddff249b17dbdf269be2b5a43b42b67d9aa35d9bf8a27e6a2b`.

## Artifact

`release/0.39.16-visual-overlay/SynapseX-Game-Optimizer-0.39.16.exe`

108,058,160 bytes. SHA256 `8829612ccba5146137828ac6a3549f487159f9b0d1b59fc3bb574886c89f931c`.

No cloud pricing, membership policy configuration, release publishing or driver installation was performed.

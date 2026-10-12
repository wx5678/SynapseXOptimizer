# 0.39.24 — themed close-window dialog

Replace the normal Windows message box with an app-owned HTML dialog, using the
existing graphite/platinum theme tokens, primary/secondary buttons and typography.
Two radio cards describe tray versus exit. Tray is the default selection;
remember is unchecked. Cancel receives initial focus. Escape and the small X
cancel without saving preferences. The existing settings reset remains available.

Following emil-design-eng guidance, prioritize readable text, visual consistency
and immediate response rather than adding decorative modal animation. The native
HTML dialog supplies modal focus containment, background inertness and focus
restoration. Key events do not leak to underlying custom confirmation dialogs.

The renderer only returns a decision for the outstanding main-process request.
Main-frame-only IPC, sender/request-id matching, input validation and one-use
responses prevent stale or unrelated decisions. All actual preference writes,
tray creation and app shutdown continue through the existing main controller.

The main process waits for the renderer to acknowledge presentation. If no
renderer is ready, or presentation is not acknowledged within 2.5 seconds, it
falls back to the native message box. This is failure recovery only. Renderer
teardown/reload and app shutdown release pending requests as cancellation.

Verification:

- 257 Node tests pass, including matching-request validation, stale replies,
  cancellation, renderer teardown, fallback, shutdown and main-frame IPC checks.
- Isolated real Electron test uses the production preload, actual React component,
  prompt broker and preference controller. It validates dark/light layout without
  horizontal overflow, Escape cancellation and focus restoration, remembered tray
  behavior, changed confirmation label and explicit exit.
- Screenshots under `design-evidence/close-dialog-0.39.24/` were inspected in both
  themes. No real accounts, game resources, host services or startup settings were
  touched by these UI fixtures.

If a user already remembered tray or exit, preserve that choice: change Settings
> close main window to Ask each time to see the new prompt.

Output: `release/0.39.24-close-dialog/SynapseX-Game-Optimizer-0.39.24.exe`.

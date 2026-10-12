# SynapseX 0.30.0 — 石墨 / 银白

## Changes

- Reworked shared shell, typography, spacing, panels, inputs, tabs and confirmation dialogs using neutral graphite / platinum tokens and blue accents.
- One-click optimization follows the selected composition: grouped Basic / Best / Maximum controls, left-hand items, right-hand execution summary and local static glass artwork. Filters remain available in a disclosure.
- Appearance switches use compact, accurately themed choices instead of outdated page thumbnails. Existing skin, follow-system, motion and particle preferences remain supported.
- Smaller windows hide decorative artwork and stack the execution summary. Game/hidden-window effect pause remains intact. Standalone OSD styles are outside the new override scope.
- Standardized monitor/report headings and missing-memory placeholder.
- Backend logic unchanged; host version updated only. Retired keybind and priority features remain absent.

## Asset provenance

`src/assets/graphite-glass.png` is a new generated decorative bitmap based on the selected visual reference, not a whole-screen screenshot. Brief: smoked-glass layered sculpture on a neutral graphite background, ice-blue edge lighting, silver reflections, compact S emblem; no UI or paragraphs. Generated source: `C:/Users/Administrator/.codex/generated_images/01a0340c-1fb6-76c2-b370-58456fb6b190/exec-fda10476-158d-4f0a-9395-5a87201add33.png`.

## Verification and artifact

- 36/36 Node tests; TypeScript and production build pass.
- Browser design QA: see project-root `design-qa.md` and `design-evidence/graphite-paired.png`.
- Packaged service read-only audit passes on Windows PowerShell 5.1; no system/game optimization writes.
- Artifact: `release/0.30.0-graphite/SynapseX-Game-Optimizer-0.30.0.exe` (Windows x64 portable).
- SHA256: `6A41ACC4F9286A266147BC09259FBAC9B3B334497518DAA831F2F6502E135C7A`.
- Previous release remains untouched. Preview data is illustrative and excluded from production.

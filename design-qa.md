# SynapseX 0.30.2 — Home refinement (latest, 2026-09-14)

final result: passed

## Scope and visual truth

Scoped correction of the user's rejected home layout, continuing the previously chosen graphite/silver art direction. Intentional redesign, not a clone of the rejected screenshot. Source: `design-evidence/home-032-user.png` (1000 × 643), supplied clipboard f7ddfdb4. Same-route baseline: `design-evidence/home-032-before.png` at CSS 1360 × 860. New render: `design-evidence/home-032-dark.png`, same viewport, active fixture session. Before raster 1352 × 855; final raster 1360 × 860. Equal-width natural-aspect comparison normalizes minor scrollbar/frame differences, not claimed as exact pixel matching. Generic program names/metrics are synthetic, not measurements of this computer.

Combined evidence: `design-evidence/home-032-compare.html` and `home-032-paired.png`. Includes full same-state before/after, magnified header crops, and the user screenshot alongside the generic no-frame state. The last pair has differing heights (643 versus 855) and is used only to assess the seam, generic art and empty-state control, not vertical density.

## Findings and iteration history

- P1 fixed: opaque overview context rectangle over ambient layers created the reported top-left seam. Overview context is now transparent and non-sticky; old ambient/noise backgrounds are suppressed only on overview, particles fade in below the native title bar. Long-page opaque sticky headers remain unchanged.
- P2 fixed: old oversized home heading, isolated thumbnail and spare right area left the session composition fragmented. Smaller heading, a single session panel with full-height art, consolidated actions and integrated metric strip now form the primary region. Chart and backup become two columns on wide windows, one below 1100px.
- P2 fixed: broad `.chart-plot svg` sizing stretched the empty-state arrow and squeezed its text. Explicit 14px icon sizing and nowrap action now measured 118 × 31.8px, icon 14 × 14px.
- P2 fixed in first visual pass: new hero/metrics/chart initially pushed the backup below the 860px fold. Reduced hero padding, metric padding and plot height; final 1360 × 860 capture contains the entire core home including backup and bottom report link. Temporary post-HMR scroll was reset; appearance control remains below the native title bar at page top.
- No remaining actionable P0/P1/P2 findings in the tested desktop scope. Browser minimum rendered width was 1000px even when a smaller override was requested; do not claim a validated 600px viewport.

## Required surfaces

- Typography: retained Segoe UI/Microsoft YaHei and existing Lucide family; page heading 30px/600, game title 26–38px/600, data 36px/500 tabular numerals. Long executable titles truncate with a native full-title tooltip. Empty-state action does not wrap.
- Layout: 22px major gaps, 18px primary panel corners, 14px secondary panels. No document horizontal overflow at observed 1360px and 1000px. Wide chart/backup and compact stacked layout visually checked.
- Colors: graphite and silver tokens drive every new surface/control. Header/context/main form a continuous background. Silver running badge has a darker green foreground. Existing keyboard focus treatment retained and explicit homepage focus added.
- Assets: reused existing local JiuYin cover and graphite-glass image; no new image download, fabricated game artwork or inline illustration. Non-JiuYin target uses the neutral glass asset rather than a large placeholder gamepad. Masking deliberately blends asset into the theme surface.
- Copy/data: functional Chinese text; unavailable numbers remain em dashes. No fabricated gains or measurements. Preview-only generic/no-frame fixtures are excluded from the release bundle. Production data source and collection behavior unchanged.

## Verification

- Dark wide: `home-032-dark.png`; silver wide: `home-032-light.png`; small silver: `home-032-small-light.png`; generic no-frame/particles: `home-032-generic.png`; inactive game/particles at actual 1000px: `home-032-narrow.png`.
- Appearance open/close, dark/silver switch, particle toggle tested. Temporary particle preference restored off after checks.
- Empty-state monitor action reaches realtime monitor; optimization action reaches one-click; backup action reaches backup/history. Existing game/runtime/report navigation preserved and source-regression tested.
- System page regression after PageDown: scrollY 752, context top 48px, section navigation top 96px.
- Browser error logs empty. TypeScript, Vite, 40 Node tests, portable packaging pass. Packaged host v0.30.2 starts; read-only audit passes; retired routes 6/6 return 404; retired module and development fixtures excluded. No system/game optimization writes.
- Vite retains a non-blocking >500kB JS chunk warning. No claim of hardware-wide runtime testing or improved game FPS.

## Checklist

- [x] Fix home seam without changing long-page sticky mechanics.
- [x] Refine home composition, both skins and empty/active states.
- [x] Keep real data/actions and collector lifecycle unchanged.
- [x] Compare source and new captures together and resolve visual findings.
- [x] Package separately as 0.30.2, retaining previous releases.

---

# SynapseX 0.30.1 — Settings refinement (archived, 2026-09-13)

final result: passed

## Scope, reference and states

Scoped revision to the existing desktop product using the user's annotated screenshot: simplify the crowded system page, keep the top navigation visible on long pages, and reduce ornamental noise. This is not a pixel-for-pixel clone of the rejected layout.

- Source visual truth: `C:/Users/Administrator/AppData/Local/Temp/codex-clipboard-084e76c2-dc53-42dd-b074-665cb8501305.png` (1360 × 860); annotation: `codex-clipboard-8fa295f3-ddfe-4020-beab-b1b7155d4616.png` in the same directory.
- Copied reference: `design-evidence/settings-031-reference.png`.
- Actual top state: `design-evidence/settings-031-top.png` (1352 × 855); CSS viewport 1360 × 860, DPR 1. Minor raster/frame difference is not counted as visual drift.
- Combined full-view + focused comparison: `design-evidence/settings-031-compare.html`, captured to `design-evidence/settings-031-paired.png`. Equal-width, natural-aspect images; matching 180% focused crops show the changed hierarchy together.
- State: System → 基础与显卡, dark theme, summary/details collapsed. User screenshot has AMD hardware and already-applied values; browser evidence deliberately uses synthetic Intel data and pending settings. Hardware and status differences are not layout findings or actual measurements.
- Preview URL: `http://127.0.0.1:5193/?designPreview=1`.

## Findings and iteration history

No remaining actionable P0/P1/P2 findings in tested scope.

1. [P1, fixed] Long-page header originally scrolled away. First sticky implementation was defeated by an existing body overflow container. Changed desktop-only root/body overflow to `clip visible`, removing the intervening scrolling ancestor. Read-only browser measurement at scrollY 1720: context top 48px, header top 96px. Final evidence: `settings-031-scrolled.png`.
2. [P2, fixed] Hardware table consumed half the settings width, while each card stacked category/recommendation/risk/status labels. Replaced with a dynamic, expandable summary and full-width preference rows. Details are independently keyboard/click accessible; restart notes remain visible. Evidence: `settings-031-top.png`, `settings-031-details.png`, paired comparison.
3. [P2, fixed] Common settings alternated between uneven two-column cards and long descriptions. Replaced with aligned rows and a stable action column, preserving functional impact and unavailable reasons. Evidence: `settings-031-advanced.png`.
4. [P2, fixed] Large title/eyebrow and boxed tabs occupied excessive persistent area. A compact 30px title, short description and underline tabs now take ~132px below the context row. No particles render on settings pages; original overall skin/brand remains.
5. Preview-only system data was incomplete and blocked downstream visual inspection. Added explicit read-only fixture responses; production bundle fixture exclusion verified by packaged regression.

## Required fidelity surfaces

- Fonts: existing Segoe UI/Microsoft YaHei retained. Fixed-area heading 30px/600, section 18px/600, preference labels 14px/600, supporting content 12px. No stretched or fake typography assets; checked full-size dark and narrow silver renders.
- Layout: compact navigation, 24px section rhythm, 12px grouped panels, 20px preference-row padding. Hardware information, preferences, optional diagnostics and GPU controls now have separate sections. Eight system categories are preserved. Narrow category row is horizontally scrollable and supports keyboard Home/End/arrows.
- Colors/tokens: existing graphite and silver palettes, blue selection underline, subdued separators. Header/context backgrounds are opaque so moving text cannot show through. Focus, disabled and selected states remain distinct. No new glow or background renderer.
- Assets: existing SynapseX brand and Lucide icons retained; no new decorative assets requested or approximated. Particles are intentionally restricted to the overview when enabled, and still pause during games/hidden windows.
- Copy: functional titles and real setting descriptions retained; duplicate label clutter moved into expandable details. Full original hardware values remain in the details. Model name is read from the API, not hard-coded in production.

## Interaction, responsive and regression checks

- System sticky at scrollY 1720; switching categories returns to content start.
- Network sticky at scrollY 224, context top 48/header top 96; DNS/Hosts category changes work. Evidence: `settings-031-network-scrolled.png` and `settings-031-network.png`.
- Expanded hardware details show all values. Unchecking one preference updates selection; expanding its details does not reselect it.
- Keyboard ArrowRight selects adjacent category; End selects final category.
- Silver at 980 × 680: no document horizontal overflow (scrollWidth 972), controls remain reachable. Evidence: `settings-031-small-light.png`.
- Browser error log empty. 38 Node tests pass; TypeScript and Vite builds pass.
- Packaged v0.30.1 host starts under Windows PowerShell 5.1, read-only runtime audit passes, retired routes 6/6 return 404, retired module and development fixtures excluded. No system/game optimization writes.

## Residual scope

No live-game FPS claim and no claim of all-hardware certification. This pass changes presentation and preview-only fixtures; host change is version only. Native overlay retained outside new CSS scope. Other product pages keep their existing sections; shared context actions stay sticky, while full title/category fixing is implemented on System and Network.

## Completed checklist

- [x] Reorganize the screenshot's crowded content without deleting controls.
- [x] Fix and verify long-page sticky navigation, including the actual scroll-container issue.
- [x] Check expanded states, keyboard category navigation and silver narrow layout.
- [x] Compare reference and final rendering together.
- [x] Produce Windows portable artifact and pass read-only regression.

---

# Archived: SynapseX 0.30.0 — Desktop Design QA (2026-09-13)

final result: passed

## Visual truth and evidence

- Selected source: `C:/Users/Administrator/.codex/generated_images/01a0340c-1fb6-76c2-b370-58456fb6b190/exec-3ab9765e-cfcb-40ae-a40a-a73d9d360047.png`; copied unchanged to `design-evidence/graphite-reference.png` (1487 × 1058 pixels).
- Actual browser rendering: `design-evidence/graphite-dark.png` (1480 × 1050 pixels), `graphite-light.png`, `graphite-system.png`, `graphite-monitor.png`, `graphite-confirm.png`.
- URL: `http://127.0.0.1:5193/?designPreview=1`; synthetic local preview, no system optimization executed. Production build excludes preview fixtures.
- CSS viewport override: 1488 × 1056, devicePixelRatio 1. In-app capture returns 1480 × 1050 raster; scrollbar/frame differences are not treated as layout defects.
- Dark reference and dark actual state: one-click page, Best tier, 24 selected. Source descriptions are illustrative; implementation retains real functional settings and readback status. Silver evidence uses Basic tier, 4 selected.
- Full-view and focused list comparison: both source and actual are placed together in `design-evidence/graphite-compare.html`, captured as `design-evidence/graphite-paired.png`. Full images are fit into equal-width columns with natural aspect ratio; focused views use the same 200% scale and crop. No pixel-perfect claim.
- Responsive: 980 × 680, `graphite-small.png`, `graphite-small-appearance.png`; filters and alternate skin: `graphite-light-filter.png`.

## Findings and iterations

No remaining actionable P0/P1/P2 findings in tested states.

1. Initial capture (`graphite-initial.png`) had undersized headings and a duplicated top-left brand. Corrected heading hierarchy, sidebar top alignment and native titlebar brand visibility; retained drag area and window controls. Revised evidence: `graphite-dark.png` and paired comparison.
2. Filtering a long list left a large gap above the results due to implicit grid row distribution. Added explicit `auto 1fr` grid rows; measured final tier-to-list gap 18px. Revised evidence: `graphite-light-filter.png`.
3. Monitor/reports used oversized thin headings inconsistent with other pages. Unified header class and functional titles; also guarded missing memory data so preview does not print undefined values. Revised evidence: `graphite-monitor.png`.
4. Final paired comparison inspected full composition and magnified list details. Extra current/target labels, counts and collapsed filters are intentional functional additions. They increase list height versus the illustration but do not hide the primary apply control at the target desktop size.

## Required fidelity surfaces

- Typography: native Segoe UI / Microsoft YaHei fallbacks, no font download. Desktop display title up to 52px, navigation and main list labels 15px, secondary values 12px. Semibold titles replace the older thin display treatment. Chinese and Latin labels remain legible in dark and silver captures.
- Layout: grouped three-tier selector, left change list, right continuous execution summary; 232px desktop sidebar, 204px narrower desktop sidebar. Restrained 9–14px control/panel radii and thin borders. At 980px the summary stacks and artwork hides to preserve usable space. No horizontal overflow in tested widths.
- Color: neutral #121417 canvas, #1b1e23 surfaces, ice-blue #a9cbf8 action background with dark text; silver #f5f6f8 canvas and #345f9f primary action. Inputs, selects, focus outlines, disabled controls and dialogs share tokens. Semantic warnings remain distinct.
- Imagery: local static generated smoked-glass sculpture, `src/assets/graphite-glass.png`; subject/material matches selected reference. Existing SynapseX vector brand and Lucide controls deliberately retained rather than substituting the mockup's invented logo. No continuous WebGL/canvas renderer was added. The dark image block in silver skin is intentional contrast, not a missing theme override.
- Copy: real names, actual selected counts and current/target settings retained. No source-design or prestige/style labels added to the product. Existing risk and restore information remains available. Monitor/report headings use functional names.

## Interaction and technical verification

- Basic / Best / Maximum: 4 / 24 / 72 selections in fixtures; Maximum warning remains visible.
- Best confirmation opens with complete list access; cancelled without execution.
- Uncheck one item gives 23 selected. Search and status filters show 3 results without changing those 23 selections.
- Skin switching through actual controls, persisted appearance preferences and small-window popover tested.
- System settings, monitor and preferences routes inspected. Browser error log empty at final check.
- 36 Node tests pass; TypeScript build passes; Vite production build and Windows portable package succeed.
- Packaged Windows PowerShell 5.1 service read-only audit passes for v0.30.0; retired routes 6/6 return 404, retired module excluded, development fixtures excluded. No system/game writes.

## Residual test scope / follow-up

- This is a visual refresh, not proof of performance gains or compatibility with every hardware/driver combination. No new hardware behavior introduced.
- Optional fine-tuning (P3): a separately art-directed lighter sculpture could be offered for silver skin; current dark inset is accepted.
- Native window/OSD behavior is covered by existing regression tests, not a new live game session in this pass. Scope of new CSS excludes standalone overlay.

## Completed checklist

- [x] Match selected graphite composition and recolor the shared application shell.
- [x] Preserve functional optimization, confirmation and restore paths.
- [x] Verify both skins, dialog and desktop narrow layout.
- [x] Compare source and actual together; fix and recapture identified issues.
- [x] Package and run read-only production-service regression.

---

# Archived: SynapseX 0.23.0 — Desktop Design QA

## Scope and visual target

Implement the approved dual-skin Chinese Windows desktop workbench, with optional particles and restrained 3D motion. Preserve existing optimization behavior and local backups. This is a desktop release, not a replacement website.

- Approved source: `C:/Users/Administrator/.codex/generated_images/01a0340c-1fb6-76c2-b370-58456fb6b190/exec-0bdb36ba-0cdf-4890-badf-5fef1fe05667.png`.
- Implementation: `src/components/WorkbenchDashboard.tsx`, `AppearancePanel.tsx`, `DepthCard.tsx`, `src/lib/appearance.tsx`, `src/skins.css`, and `electron/appearance.cjs`.
- Evidence directory: `design-evidence/0.23.0/`.
- Visual review performed 2026-09-06; final fresh-preview console/appearance check 2026-09-07.
- Browser: Codex in-app browser, using the same React renderer with explicitly labeled development-only fixtures. These figures are not current hardware measurements.
- Desktop viewports: 1360 × 860 and minimum 980 × 680. Captures were 1352 × 855 and 972 × 674. Source and final captures were opened together in one comparison input at original detail, without resampling. Different source capture dimensions prevent a pixel-exact claim.

## Comparison history and fixes

1. First pass (`dark-initial.png`, `light-initial.png`): preview banner and heading spacing pushed the backup card below the default viewport. Too many visible navigation entries crowded the sidebar. Moved the development label out of content flow, tightened header layout, and grouped secondary tools under More Tools.
2. Revised pass (`dark-revised.png`): backup content was still near the lower edge and the floating assistant covered its action. Reduced metric/graph vertical density and hid the assistant on the overview only. Backup and its action are now visible at the default desktop size.
3. Appearance thumbnails initially showed old mockups rather than this implementation. Replaced them with actual rendered light/dark workbench thumbnails.
4. Light confirmation review (`confirm-light.png`): pale backup-note text and the page icon lacked contrast. Applied semantic light-skin colors and checked `confirm-light-fixed.png`. Cyan primary buttons use dark text for contrast.
5. Final source-versus-implementation comparison: inspected `dark-final.png`, `light-final.png`, and the approved reference together; also inspected closed-popover `home-light.png`. No remaining actionable P0/P1/P2 finding in this visual scope.

`appearance-detail.png` is an invalid clipped capture and is not used as evidence. Earlier captures intentionally record pre-fix states.

## Required fidelity surfaces

- Typography: native Segoe UI / Microsoft YaHei UI Chinese font stack; consistent readable heading, label, and body hierarchy. No remote font dependency. Native Electron high-DPI rasterization was not independently captured.
- Spacing/layout: compact sidebar, cover/game actions, four metrics, sampled frame-time chart, and recent backup match the approved workbench hierarchy. At minimum size the content scrolls vertically; no horizontal overflow was observed. The appearance popover remained inside the viewport (left 586, right 946, top 98, bottom 632 in the minimum-window check).
- Colors: dark navy/cyan and glacier light skins share semantic tokens across overview, forms, tables, buttons, and confirmation dialogs. Primary and secondary actions remain distinct.
- Assets: retained the established SynapseX logo and Lucide icon family. Added a production wuxia cover with the intended subject placement/crop; full generation prompt and provenance are in `asset-notes.md`. Actual UI screenshots supply theme thumbnails.
- Copy: Chinese functional labels, explicit sample-data warning in development, truthful empty states in production. Chart states “采样平均帧时间 · 非逐帧轨迹”; it is not represented as raw frame-event data.

Intentional deviations from the reference: existing brand mark retained; More Tools preserves existing functions; an additional 3D-motion switch satisfies the user's follow-up; production metrics remain empty when no valid samples exist.

## Interaction checks

- Light/dark switches apply immediately; reload preserves selection.
- Follow System reflects the system scheme; explicitly choosing a skin turns that preference off.
- Native appearance storage accepts only supported fields; persistence across store instances and concurrent last-write ordering pass automated tests.
- Motion disabled with particles selected: motion off and no canvas. Motion and particles enabled: one canvas. Game-running fixture: motion off and no canvas, while user preferences remain saved (`game-paused.png`).
- Particle and 3D switches are independent preferences. Decorations pause when the window is hidden, reduced motion is requested, or the existing host reports the Jiuyin game running. No measured game-FPS improvement is claimed.
- Escape closes the appearance panel and returns focus to its trigger; close button works. Unique switch IDs support both popover and settings-page instances.
- More Tools reveals the five existing secondary entries. Overview actions navigate to existing configuration/monitoring pages.
- Configuration editing opens the custom confirmation dialog; cancellation was verified without applying changes.
- Missing telemetry renders empty values and no fabricated graph (`empty.png`). Overview reuses existing sample publishing and does not start an additional FPS collector.
- Final fresh preview on 2026-09-07 loaded and opened Appearance successfully. Its inspected console contained no warning/error entries; this is a smoke check, not a claim about every app operation.

3D pointer-tilt implementation was reviewed for bounded angles, a single pending animation frame, and cleanup/reset. Actual native hover feel and GPU cost were not benchmarked.

## Build and packaged-host verification

- TypeScript/Vite build passed; Windows portable packaging passed.
- Artifact: `release/0.23.0/SynapseX-Game-Optimizer-0.23.0.exe`.
- Size: 104071734 bytes.
- SHA-256: `154C6565CD501BEF1467C9FE570ABDDDAA47AC3E050C72C9E066045F9C47C8A9`.
- UI/package/host versions are 0.23.0.
- `node --test tests/appearance.test.cjs`: 2 passed, 0 failed.
- `tests/Test-RetiredKeybinds.ps1`: packaged host started; six retired routes returned 404; retired module and development fixtures excluded; test host shut down afterward.
- Vite watch exclusions prevent release output from triggering EBUSY errors while packaging.
- No game/system/driver/Profile configuration changes were applied during this UI release. Existing backups and saved schemes were preserved. Prior QA is archived at `design-evidence/0.22.0/design-qa.md`.

## Remaining scope

Full native Electron window launch, every system/network action, native high-DPI hover feel, and performance during a crowded game session were not re-tested. Renderer QA used isolated fixtures; packaged backend startup and appearance persistence were tested separately. Existing automatic telemetry preferences were not changed or exercised against a running game.

Final result: passed for the approved visual redesign, interaction, packaging, and isolated-host test scope.

## 2026-09-14 — 0.32.2 selected mock detail refinement

Source visual truth: `design-evidence/polish-0322/selected-reference.png` (selected original dark option; no new direction).
Implementation: `design-evidence/polish-0322/home-dark.png`.
Combined full-view and focused button/metric comparison: `design-evidence/polish-0322/comparison.png`, generated from `compare.html` in the browser. Both were opened together, not judged from filenames.
Viewport: 1488 × 1071 CSS pixels, density 1. Source and final implementation are 1488 × 1071 pixels; comparison scales both equally. An intermediate capture taken before viewport settling was discarded and recaptured after DOM dimension verification.
State: overview, graphite theme, existing preview fixture. Account API unavailable in browser, so the dock truthfully directs users to the desktop app. Example telemetry/date differ from the generated mock deliberately; production data remains unchanged. Existing supplied wuxia cover and icon library are retained under the user's detail-only scope.

### Comparison history and required surfaces

- P2, first pass: desktop composition too compact and SVG axis text stretched. Fixed wide-screen sidebar/type/spacing scale; chart uses measured container width with ResizeObserver, no nonuniform text scaling. Observer disconnects on unmount.
- P2, second pass: hero actions/process line too small relative to the selected mock. Increased wide-screen actions to 54px/17px and process line to 16px; final combined comparison shows legible aligned actions.
- Typography: existing Windows Chinese font stack, restrained 500/600 weights, consistent hierarchy; tabular metric numbers and aligned units; no clipped Chinese headings.
- Spacing/layout: original sidebar, wide hero, four metrics, chart/backup split preserved. Uniform 20px section gaps, restrained 12px radii and 1px dividers. Only the user's requested sign-in relocation changes information placement.
- Colors/tokens: existing graphite/pale-blue and silver theme tokens retained; primary/secondary control distinction, readable dark-on-light text and icons verified.
- Imagery: actual existing wuxia raster kept, correct crop and aspect, no placeholder replacement. Exact scenery differs from generated mock by deliberate asset reuse, not a fidelity blocker for this detail-polish task.
- Copy/content: no invented telemetry or account status; removed duplicate sign-in navigation/home mounts. Only the bottom-right global entry remains. No new collectors or decorative polling.

### Responsive and interaction evidence

- `home-light-980.png`: 980 × 800, silver theme, no horizontal page overflow (scroll width 972).
- `home-mobile.png`: 390 × 844 CSS viewport, full-page capture, scroll width 382; horizontally scrollable existing mobile nav remains usable, one sign-in entry.
- `system-scroll.png`: long system page after scrolling; persistent dock remains visible and opens the community sign-in route.
- Global entry -> sign-in heading verified; overview/system navigation and appearance picker tested. Local sign-in mutations are intentionally disabled in browser preview, not reported as real authentication tests.
- Browser console error check returned no errors. Temporary viewport override reset after checks.
- Main content bottom padding permits last controls to scroll above the fixed dock. Mid-scroll overlay is intentional floating-entry behavior.

### Verification and limitations

68 Node tests passed; TypeScript, Vite and portable packaging passed. Isolated Electron smoke verified official unauthenticated state, 27 groups/207 realms, encryption and official login page load; submitted sign-in requests: 0.
Real-account multi-factor login and a real successful/repeated sign-in were not performed. The release fixes confirmed response-classification and state-retention bugs; external-channel sign-ins with no explicit today proof remain “今日待确认”, not a false “未签到”.
P3: optional finer source/mock icon and artwork alignment; not part of the approved detail-only scope. No remaining actionable P0/P1/P2 visual findings.

final result: passed

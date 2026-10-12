# 0.39.23 — reviewed 7d1dbf resource variant

## Evidence

The user supplied files from another computer on 2026-09-16:

- `skin.package`: 4,747,607 bytes, SHA-256
  `7d1dbf6c25baeb941723c20008f53e45ba07d7dac35e0b2cd5fd4b5c5da21ddf`.
- `fxgamelogic.dll`: 43,327,760 bytes, SHA-256
  `16cf49b652c39b63ba0767780cc39f32ea1e50bdc683da9d5e7b2697cf95c3e8`.

The DLL matches the existing supported profile. The target compressed block at
offset 3,231,222, length 4,312 is byte-identical to the original supported sample.
The decoded 62,584-byte XML has SHA-256
`81c4efcf72b0ec8901b4e37f8d536bac118c1c389ede9d6a763bd983346e19ca`,
with resource defaults 300 FPS and view 250.

Compared with the `000f1022...` baseline, there are 196,779 differing bytes between
offsets 8 and 197,644; the suffix starting at 197,645 is identical. The cause of
these leading-byte differences was not established. This is a reviewed sample,
not a claim of official publisher authenticity.

## Implementation

Add only this exact whole-package hash as a third profile. Do not inherit other
profiles' patched hashes. Preserve whole-file recognition, DLL matching, original
backups, target-block boundaries, role checks, running-game guard and atomic
replacement. Unknown variants still fail closed; there is no wildcard matching.

Retain the 0.39.21 process-scoped PowerShell compatibility fix and 0.39.22 update
entry / remembered close-to-tray functionality. No server configuration changed.

## Verification

- All 254 Node tests pass.
- On temporary copies of the supplied files, test 360/250, 600/250, 1000/250,
  300/1000 and 1000/1000. Requested 1000 FPS resolves to actual resource cap 999.
- Verify target-exterior bytes unchanged, original backup unchanged, recognition
  after controller restart, expiry restoration and manual restoration to original.
- A further unknown leading-byte edit is rejected without another write.
- Run the same integration checks against the initial supported baseline.
- The supplied files remain unchanged; DLL contents were not executed. The
  integration replacement adapter operates on temporary files only. Actual game
  launch and behavior on the recipient's computer remain to be verified.

Output: `release/0.39.23-resource-compat/SynapseX-Game-Optimizer-0.39.23.exe`.

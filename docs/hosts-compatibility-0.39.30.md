# Hosts compatibility fix — 0.39.30

## Diagnosis

The previous audit called `Test-Path`, read content, then used `Get-Item` without `-Force`. Hidden/system metadata could fail at the final step. Access failures and a file disappearing between calls also escaped the audit and aborted the whole network-toolkit response. The other computer's exact file attributes have not been verified.

## Changes

- Read metadata with `Get-Item -LiteralPath -Force -ErrorAction Stop`, without changing file attributes or ACLs.
- Keep Hosts errors local. Return explicit ready, read-only, missing, access-denied and read-failed states.
- Keep DNS, TCP, NIC and other network sections available when Hosts cannot be read.
- Show a local warning and disable the editor/save action for unreadable or read-only content. Enforce the same guard in the backend so an empty error placeholder cannot be saved.
- Allow an explicit restore from an existing backup when the file is missing; do not auto-create or reset it during detection.
- No changes to the machine's actual Hosts, DNS, security settings or file attributes during verification.

## Verification

- `tests/hosts-compatibility.test.cjs`: PowerShell cases for missing, hidden/system metadata, read-only, metadata/read access denial, sharing violation, disappearing file, directory, non-admin and toolkit isolation. Missing-path lookup is real; other conditions are simulated without modifying Windows files.
- UI source checks for the warning and save guard.
- Full Node regression suite: 271 passing tests.
- `Test-NetworkRuntimeReadOnly.ps1`: live read-only network/runtime regression.
- Production TypeScript/Vite build and portable packaging. Existing large-chunk warning remains unrelated to this fix.

The recipient still needs to verify the new build on the affected computer; these checks do not establish its original file attributes or permissions.

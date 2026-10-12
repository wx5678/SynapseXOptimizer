# 0.23.1 compatibility verification — 2026-09-07

## Changes

Removed source-machine CPU wording, fixed CPPC branding on non-AMD platforms, and removed personal installation-path defaults from distributed active modules/UI. Runtime priority operations use a query-limited + set-information handle; creation-time token is verified on the same handle before mutation. No debug privilege, injection or protection bypass is used. Readback must match before success is recorded. Restore targets the matching process backup and original identity. Repeated requests do not overwrite original priority; failed records are not offered as successful backups.

Windows CPU Sets provide topology evidence; CPU model/SMT arithmetic alone is not sufficient. Unknown/incomplete topology, mobile devices, mixed efficiency classes, and multi-cache-domain AMD CPUs retain platform scheduling/core parking. Exposed power-setting GUIDs are filtered before display; exposure is not proof of hardware effect. A failed setting cancels a new CPU scheme rather than activating a partially applied preset.

## Tests performed

- `Test-RuntimeCompatibility.ps1` passed under both PowerShell 7 and Windows PowerShell 5.1.
- 10 identity/topology cases: Intel i7-9700, i9-13900K, Core Ultra 285K with no SMT, i5-12400, AMD 9800X3D, dual-cache-domain 9950X3D, mixed-class Ryzen AI, Qualcomm-like mixed-class fixture, unknown Intel topology, incomplete virtual topology.
- Three capability cases: portable-device fallback, partial power-setting exposure, missing base settings (no compatible preset).
- Native priority apply/readback/restore passed on a test-owned hidden child process. Stale creation token was rejected without writing.
- Mocked runtime routes exercised access denial before/at write, readback mismatch, idempotence, original-backup preservation, restore and PID reuse. No game process was modified.
- Live read-only CPU Sets and power catalog worked on this development machine.
- TypeScript/Vite build and portable package passed.
- Packaged Windows PowerShell host started, reported 0.23.1, and served the read-only runtime compatibility audit. Six retired keybinding routes remain 404; retired module/development fixtures excluded.
- Appearance persistence tests: 2 passed.
- Development renderer showed an i7-9700 fixture without Ryzen wording; denied-priority controls disabled with a specific explanation and actual-service privilege label. Missing CPU capabilities disabled preset creation. Inspected browser error log was empty.

No system power plan, actual game priority, game configuration, driver or BIOS was changed during these tests. Temporary test-owned child and test state were cleaned up; user backups and old releases remain intact.

## Artifact

`release/0.23.1/SynapseX-Game-Optimizer-0.23.1.exe`

- 104075395 bytes
- SHA256 `9B964A7F33464F14F6E16BEDA00F0378780AA9324BADF0E8284333A62A22967A`

## Limits

This is not certification on every CPU/OEM/Windows combination. Simulated topology tests verify decision logic, not performance on those physical machines. Native ARM64 distribution is not supplied; current package is Windows x64. Protected game processes can still deny access even when elevated. A changed priority or power setting is not proof of an FPS increase. No fresh crowded-scene FPS comparison or full native-window UI automation was performed. Existing historical priority backups are retained, but schema-1 records cannot establish whether their old write actually succeeded and are not automatically replayed.

## API references

- [Microsoft: CPU Set topology and EfficiencyClass](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-system_cpu_set_information)
- [Microsoft: GetSystemCpuSetInformation](https://learn.microsoft.com/en-us/windows/win32/procthread/getsystemcpusetinformation)
- [Microsoft: SetPriorityClass access rights and behavior](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-setpriorityclass)

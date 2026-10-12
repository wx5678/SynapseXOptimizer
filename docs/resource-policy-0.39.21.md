# 0.39.21 — resource replacement execution-policy compatibility

## Confirmed cause

The reported failure contains `SecurityError`, `UnauthorizedAccess` and
`about_Execution_Policies`. Windows PowerShell rejected the bundled replacement
script before it ran. The recognized original resource and generated 600 FPS
candidate were not the reason for this failure.

The resource replacement invocation omitted the process-scoped execution-policy
argument already used by the application's other bundled PowerShell workers.

## Change

- Add `-ExecutionPolicy Bypass` to this child process only. No `Set-ExecutionPolicy`,
  registry changes, security-software changes or machine/user policy changes.
- Preserve argument-array execution, hidden window, timeout, game-process guard,
  role revalidation, original backup, hash validation and atomic replacement.
- Translate recognizable policy-startup errors into actionable Chinese, including
  when localized output cannot be decoded correctly. Do not attempt to override
  organization Group Policy or application control if they still block execution.

## Verification

- All 241 Node tests passed, including 26 resource tests.
- A real Windows PowerShell test inherited a process-scoped `Restricted` policy:
  the old `-File` call was rejected; the production replacement call applied
  600 FPS / view 250 and restored 300 FPS / view 250 successfully.
- This test used synthetic resources in a temporary Chinese-and-spaces path,
  not a game installation. It exercised the actual `File.Replace` script.
- Simulated policy rejection preserved both the original resource and its verified
  backup, removed only staging data, and returned the readable error.
- The recipient's computer has not been remotely retested; distribute the new
  portable executable and have them retry after closing the game and old app.

Output: `release/0.39.21-resource-policy/SynapseX-Game-Optimizer-0.39.21.exe`.

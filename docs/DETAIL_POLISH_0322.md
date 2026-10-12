# 0.32.2 — detail polish and sign-in state

- Keep selected graphite mock composition; refine spacing, type, dividers, actions, metrics and responsive chart labels. Silver and narrow-window checks completed.
- One global sign-in entry, bottom-right. Remove home summary and desktop/mobile navigation duplicates; retain the sign-in route, multiple accounts, remarks and automatic sign-in preferences.
- Official `4026` (request frequency) throws a transient query error, never marks logout. Only verified `4028` is unauthenticated. Unknown responses do not overwrite the last known login state.
- Activity requests across profiles are serialized at 2.5-second intervals. Nearby init requests share one in-flight/successful response for up to 3 seconds; a submission invalidates totals cache. Re-login/credential submission invalidate cached auth; no automatic retry of a sign request.
- Verified login publishes back to account manager. Re-login starts with no assumed identity and restores an existing receipt only after the same account name is verified. Different accounts never inherit receipts.
- Today's successful/explicit already-signed results can restore missing receipt state; transient refresh failures retain known successful state. Explicit “今日已签过到” variants recognized.
- No local receipt is NOT proof of no sign-in: label is now “今日待确认”. Current official page uses accumulated `days_num`; do not invent today's status from the total. External-channel confirmation may require the user to invoke the daily sign action and receive an explicit official already-signed result.

Verification: 68 tests, TypeScript, Vite, Windows portable packaging; isolated official unauthenticated/login/encryption smoke passed. No real-user sign submission, cookie clearing, system optimization, or game modification was performed during this release. Existing user data and previous executable retained.

Artifact: `release/0.32.2-detail-polish/SynapseX-Game-Optimizer-0.32.2.exe`.

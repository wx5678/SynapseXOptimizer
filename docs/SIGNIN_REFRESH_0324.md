# 0.32.4 — stale login feedback and read-only refresh

- Successful official login verification clears the in-memory login-window error. Successful status-page rendering also clears it.
- Account snapshot uses nullish fallback for the window error: an authoritative empty string no longer resurrects an older persisted error.
- Local account-list sync failure after official login success is no longer mislabeled as unconfirmed authentication. The window distinguishes confirmed login from pending local synchronization.
- Refresh reconciles existing today receipts and explicit already-signed results without calling the sign endpoint. Tests cover missing receipt recovery, cross-day expiry and no submissions.
- Confirmed daily status has a separate dated success message. Historical submission text is retained under a collapsed history section, not presented as an active error.
- Refresh still does not infer today's sign-in from accumulated days. No verified logged-in response schema proving an external-channel sign-in is available yet; this is a remaining limitation, not a claim that official APIs cannot support it. State stores bounded response field names only (`queryFields`) to inspect the actual schema on the next user refresh, never credentials or raw field values.

Validation: 71 Node tests, TypeScript and Vite passed. Browser fixture starts with the user's contradictory error/signed condition; clicking Refresh removes the old error and retains today's confirmation. Evidence: `design-evidence/signin-0324/after-refresh.png`. No real-account login/session change or sign submission was performed in this turn.

Artifact: `release/0.32.4-signin-refresh/SynapseX-Game-Optimizer-0.32.4.exe`.

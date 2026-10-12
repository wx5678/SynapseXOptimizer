# Community login lifecycle fix — 0.39.31

The reported page is the Snail community-login fallback, not the product-license login screen. Exact external network response on the affected computer is unknown.

## Findings and changes

- Previous catch-all handler described a failed post-login status query as a failed login-page load. Temporary activity throttling, query timeout or DOM navigation races could therefore present the wrong retry advice.
- A confirmed official response now latches success for the current authentication generation. Late load failures cannot replace it.
- Identical in-flight completion events share a verification; stale windows/generations cannot change the next attempt's state or account identity.
- Successful callback verification and account-list synchronization close the login window. A manual account refresh can also recover and close a pending/error window without restarting SSO. It does not recursively call the account synchronization callback while holding the account lock.
- Query failures show “登录状态待确认”, preserve the session and do not include the re-login link. They do not invent a successful login. Official explicit non-login remains distinct.
- Normal ERR_ABORTED redirects are ignored. DOM inspection failure on an official activity callback does not prevent independent official API verification.
- Synchronization failure after official success is described as a synchronization issue, not a login failure.

## Verification

- 276 Node tests pass, including duplicate events, throttled confirmation followed by manual refresh, delayed old-window completion, redirect abort, DOM inspection failure, stale account identity and existing multi-account/sign-in protections.
- These are isolated simulations; no real account credentials were entered and no sign-in reward requests were sent for this task.
- Production TypeScript/Vite build and portable package generated. Existing Vite chunk-size warning is unrelated.
- Official host allowlist, session separation, sandboxing, IPC guards, credential encryption and TLS verification remain unchanged.

Recipient should fully exit the previous build (including the tray), open 0.39.31, then refresh the community-account state first. Re-enter credentials only if the official state actually reports that login is required.

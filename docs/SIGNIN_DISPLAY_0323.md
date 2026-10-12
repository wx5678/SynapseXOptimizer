# 0.32.3 — sign-in entry and identity display

## Confirmed cause

Read-only inspection of the account snapshot found `loggedIn=true`, a current-day receipt and the official message “您今日已经签到过了”, with empty account name and remark. `accountTitle` previously fell back unconditionally to “等待登录”. This was a display bug, not evidence of expired authentication or failed sign-in.

## Changes

- One persistent entry at the bottom-left inside the desktop sidebar bounds; responsive widths follow the sidebar. Reserved footer space prevents navigation/backup overlap. On narrow mobile previews it remains at bottom-left.
- Account title and account identity are separate from authentication and daily sign-in state. Empty names no longer display “等待登录” or instruct a logged-in user to reauthenticate merely to obtain a name. Remarks remain optional and first priority.
- A nonblank official SSO MFA page no longer unconditionally erases the submitted account name. It is cleared only when the username form is actually shown again. Password, OTP, captcha and form payloads are not read.
- Existing accounts, login sessions and receipts untouched; no real sign-in request submitted during verification.

## Verification

70 Node regression tests passed, including missing-name/already-signed display, remark precedence, independent login/sign-in states and SSO multi-step identity retention. TypeScript and Vite passed.
Browser fixture reproduces logged-in/signed/empty-name state and displays “已登录账号”, “已签到” and the count in silver theme. Production preview has exactly one entry with left=14, right=218 inside sidebar right=232, clear of content.
Evidence: `design-evidence/signin-0323/left-entry.png`, `design-evidence/signin-0323/missing-name-signed.png`.

Known limitation: an account name absent from previously saved data cannot be invented. The display is truthful and remains usable with a remark; actual official multi-factor login was not repeated on the user's account.

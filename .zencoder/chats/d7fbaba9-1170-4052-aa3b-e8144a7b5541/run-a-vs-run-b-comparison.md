# Run A vs Run B Comparison

Date: 2026-03-15  
Mode: investigation only, no implementation

## 1. Objective

Compare two consecutive development sign-up runs:

- Run A: Google sign-in/sign-up completed successfully once
- Run B: immediately after that, the same flow got stuck again at `Rendering...`

Goal: identify the first point where Run B diverges from Run A and determine what state changed.

## 2. Evidence Used

- prior failing trace artifact:
  - `.zencoder/chats/d7fbaba9-1170-4052-aa3b-e8144a7b5541/clerk-dev-request-trace.md`
- prior middleware/system-route investigations:
  - `.zencoder/chats/d7fbaba9-1170-4052-aa3b-e8144a7b5541/system-route-poisoning-analysis.md`
- local server log:
  - `logs/server.log`
- current repository flow code:
  - `src/security/middleware/with-auth.ts`
  - `src/app/auth/bootstrap/page.tsx`
  - `src/app/onboarding/actions.ts`
  - `src/app/onboarding/layout.tsx`
  - `src/app/users/layout.tsx`
  - `src/app/layout.tsx`
  - `src/modules/auth/ui/HeaderAuthControls.tsx`
- installed Clerk shared/backend runtime code in `node_modules`
- user-provided dev console/server logs from the failing run
- user-provided screenshot/context indicating later failures can remain visibly stuck on `/auth/bootstrap` with `Rendering...`

Important limitation:

- there is no direct cookie dump, `localStorage` dump, or `sessionStorage` dump captured for both runs
- there is no preserved full browser waterfall for the successful run
- browser-state conclusions below are therefore inferred from the available runtime evidence, not directly dumped from DevTools storage panels

## 3. High-Level Verdict

The strongest current conclusion is:

- Run A and Run B do not meaningfully diverge in repository middleware behavior
- Run A and Run B do not meaningfully diverge in server-side `/auth/bootstrap` success
- the first reliable divergence appears after the server has already handed control back to the browser for post-auth/post-bootstrap continuation

Best-fit issue class:

- primary: Clerk session/callback state on the client
- secondary: browser-held Clerk dev state across repeated attempts
- amplifier: Next.js dev runtime / App Router refresh instability during Clerk auth-state transitions
- not primary: repository redirect logic

## 4. Run A

### 4.1 Strongest successful-run evidence

The clearest successful completion sequence in `logs/server.log` is:

- line 76: bootstrap succeeds at `1773611878299`
- lines 79-81: onboarding action succeeds at `1773611888433`
- lines 83-92: browser/app activity continues and the users experience loads
- lines 88 and 90: server serves the users route data
- lines 91-92: browser logs `Users loaded`

This proves Run A did not stall at `/auth/bootstrap`. It progressed into the authenticated app flow.

### 4.2 Run A request progression

Based on the available evidence, the successful path is:

1. `/sign-up`
2. Clerk callback requests
3. `/auth/bootstrap`
4. `/onboarding?redirect_url=/users`
5. `POST /onboarding?redirect_url=/users`
6. browser continues into `/users`
7. users page fetches complete successfully

### 4.3 Run A bootstrap behavior

- identity resolves successfully
- `provisioning:ensure` succeeds
- bootstrap does not fail server-side
- post-bootstrap browser continuation succeeds

## 5. Run B

### 5.1 Failing-run request progression

From the failing trace and the raw dev server logs already captured:

1. `GET /sign-up`
2. `POST /sign-up`
3. `GET /sign-up/SignUp_clerk_catchall_check_...`
4. `GET /sign-up/sso-callback?sign_up_force_redirect_url=http://localhost:3000/auth/bootstrap&sign_in_force_redirect_url=http://localhost:3000/auth/bootstrap`
5. `GET /sign-up/sso-callback/SignUp_clerk_catchall_check_...`
6. `POST /sign-up/sso-callback?sign_up_force_redirect_url=http://localhost:3000/auth/bootstrap&sign_in_force_redirect_url=http://localhost:3000/auth/bootstrap`
7. `GET /auth/bootstrap`
8. `GET /onboarding?redirect_url=%2Fusers`
9. `POST /onboarding?redirect_url=%2Fusers`
10. then, in the pasted failing run, `GET /` rather than clear `/users` continuation

Separately, later failing attempts were observed stuck on `/auth/bootstrap` with `Rendering...`.

That means the client failure is not perfectly stable, but both failure shapes happen after successful auth callback handling and after bootstrap is already in play.

### 5.2 Run B bootstrap behavior

From the failing traces:

- `/auth/bootstrap` is reached
- identity resolves successfully
- `provisioning:ensure` succeeds
- server-side bootstrap continues normally

### 5.3 Run B browser-side outcome

Observed failing outcomes:

- visible stall on `/auth/bootstrap` with `Rendering...`
- or, in the earlier failing request log, post-onboarding navigation falls back to `GET /` instead of continuing into stable `/users` activity
- browser console shows Clerk-side `TypeError: Invalid URL`

## 6. Direct Comparison

### 6.1 Request sequence

Common behavior in both runs:

- `/sign-up` is reached
- Clerk callback requests complete
- `/auth/bootstrap` is reached
- bootstrap provisioning succeeds server-side

Observed divergence:

- Run A continues into authenticated app activity and later loads users data
- Run B does not settle into the authenticated app flow

### 6.2 Query params

Run B callback requests explicitly carried:

- `sign_up_force_redirect_url=http://localhost:3000/auth/bootstrap`
- `sign_in_force_redirect_url=http://localhost:3000/auth/bootstrap`

Run B also showed:

- no repository `307` redirect from `/sign-up` or `/sign-up/sso-callback` to `/auth/bootstrap`
- no tracked Clerk callback params on the later `/auth/bootstrap` request
- `/auth/bootstrap` arriving without a query string
- `/onboarding` carrying `redirect_url=/users`

Run A limitation:

- there is no preserved full callback URL list for the successful browser run, so exact callback query-param parity cannot be proven request-by-request

Best comparison supported by evidence:

- there is no server-visible query-param divergence before or at bootstrap
- the first clear divergence is later, during client-side continuation after bootstrap success

### 6.3 Middleware behavior

No meaningful divergence found.

Relevant branch behavior remains the same:

- auth-route callback requests are passed through
- bootstrap route is passed through once authenticated
- onboarding requests are handled as authenticated private-route pass-through

This is consistent with the earlier finding that middleware is not stripping Clerk callback params in the failing flow.

### 6.4 Bootstrap behavior

No meaningful server-side divergence found.

In both runs:

- `auth()`/identity resolution succeeds
- bootstrap provisioning succeeds
- bootstrap does not produce the failure

### 6.5 Post-onboarding/app continuation

This is where the strongest practical difference appears.

Run A:

- after onboarding success, the app clearly continues into the users experience
- evidence: `Users loaded` and users-route activity in `logs/server.log` lines 83-92

Run B:

- after the same broad auth/bootstrap chain, the failing log shows `POST /onboarding?redirect_url=%2Fusers` followed by `GET /`
- there is no matching users-route/browser success evidence

Why this matters:

- repository code does not have a normal success path from onboarding to `/`
- `completeOnboarding()` redirects to a sanitized internal target, which falls back to `/users`
- the only explicit repo redirect from `/users` to `/` is the `FORBIDDEN` / `TENANT_MEMBERSHIP_REQUIRED` branch in `src/app/users/layout.tsx`
- there is no evidence in the failing trace of a normal, stable `/users` page load before the client gets derailed

So the failing browser is not completing the same post-bootstrap/post-onboarding navigation that the successful run completes.

## 7. Exact Divergence Point

The first reliable divergence point is:

- after successful `/auth/bootstrap` handling, when the browser should settle into the post-auth app flow

More concrete formulation:

- server-side auth callback handling and bootstrap success are shared
- Run A then stabilizes into onboarding/users activity
- Run B instead stalls in Clerk UI on `/auth/bootstrap` or falls into an abnormal client navigation outcome (`GET /` rather than stable `/users` continuation)

This makes the divergence primarily browser-side, not middleware-side.

## 8. What State Changed Between The Runs

### 8.1 Confirmed changed state

What is definitely different by the time Run B happens:

- the browser is no longer in a clean pre-auth state
- there is already an authenticated Clerk identity available during later server work
- the user is already provisioned in application state during repeated bootstrap handling

### 8.2 Most likely browser-held changed state

Based on the installed Clerk runtime and the repeated dev auth flow, the most likely changed browser state is:

- Clerk session cookies:
  - `__session`
  - `__refresh`
  - `__client_uat`
- Clerk dev/browser sync cookies or params:
  - `__clerk_db_jwt`
  - `__clerk_handshake`
  - `__clerk_handshake_nonce`
  - `__clerk_redirect_count`
  - `__clerk_redirect_url`
- Clerk client-side auth/callback lifecycle state associated with `setActive`, router refresh, and dev-browser URL cleanup

What I can support from the codebase:

- Clerk backend/shared packages explicitly define the above dev/session cookie and query names
- Clerk shared runtime contains dev-browser JWT URL handling
- Clerk provider integration in this repo feeds `/auth/bootstrap` into Clerk redirect configuration

### 8.3 What I could not directly prove

I do not have direct per-run evidence for:

- exact cookie values in Run A vs Run B
- exact `localStorage` contents in Run A vs Run B
- exact `sessionStorage` contents in Run A vs Run B

Repository-side note:

- there is no repo-owned auth browser storage usage that explains the difference
- the meaningful browser-held state here is most likely Clerk-owned

## 9. Root-Cause Classification

Best-fit classification from current evidence:

- most likely: Clerk session/callback state
- also likely: browser storage/cookie state, but specifically Clerk-owned state
- also plausible amplifier: dev runtime instability during App Router refresh/auth-state transitions
- least likely: repository redirect logic

Why repository redirect logic is no longer the strongest candidate:

- callback requests are not being corrupted by middleware
- both runs still reach bootstrap successfully
- the server-side flow succeeds in both runs
- the earliest stable divergence is client-side after bootstrap success

## 10. Strongest Next Fix Target

The strongest next fix target is:

1. the Clerk-facing post-auth redirect and auth-state integration around `/auth/bootstrap`

Most relevant touchpoints:

- `src/app/layout.tsx`
- `src/modules/auth/ui/HeaderAuthControls.tsx`
- Clerk client behavior after callback completion and after `setActive`

Why this is the strongest next target:

- `/auth/bootstrap` is the shared value visible in Clerk callback requests
- `/auth/bootstrap` is also the value surfaced in the client-side `Invalid URL` evidence
- bootstrap succeeds on the server, so the unresolved part is the browser-side handoff/continuation

Secondary cleanup target:

1. exclude `/.well-known/*` from auth interception

That remains a real cleanup item, but it does not explain the Run A vs Run B divergence as strongly as the Clerk client-side post-bootstrap state does.

## 11. Final Answer

- exact divergence point: after successful `/auth/bootstrap` handling, when the browser should continue into stable onboarding/users flow
- what changed between the runs: Run B happens with already-established Clerk session/provisioning state and likely Clerk-owned dev callback/session state carried in browser cookies/runtime state; server-side behavior stays effectively the same
- most likely issue class: Clerk session/callback state plus dev runtime instability, not repository middleware redirect logic
- strongest next fix target: Clerk post-auth redirect/provider integration around `/auth/bootstrap`, with emphasis on the client-side handoff after bootstrap success

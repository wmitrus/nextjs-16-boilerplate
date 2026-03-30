# Run A vs Run B Comparison

## Objective

Compare two consecutive development sign-up runs:

- Run A: Google sign-in/sign-up completed successfully once
- Run B: immediately after that, the same flow got stuck again at `Rendering...`

Goal: identify the first point where Run B diverges from Run A and determine what state changed.

Constraint: investigation only. No implementation.

## Evidence Used

- existing forensic traces in this session
- browser/server incident report notes
- current server log in `logs/server.log`
- current middleware, bootstrap, and Clerk client runtime code
- user-provided screenshot showing the later stuck state on `/auth/bootstrap` with `Rendering...`

## High-Level Verdict

The strongest current conclusion is:

- Run A and Run B do **not** diverge in repository middleware behavior
- Run A and Run B do **not** diverge in server-side `/auth/bootstrap` success
- the first observed divergence is **after** successful `/auth/bootstrap` handling, during browser-side Clerk post-auth state transition

This makes the issue most likely a combination of:

- **Clerk session/callback state on the client**
- **browser-held Clerk runtime state across repeated attempts**
- **development runtime instability during Clerk's auth-state refresh cycle**

It does **not** currently point to repository redirect logic as the primary cause.

## Run A

### Observed successful completion evidence

The clearest successful run in `logs/server.log` is this sequence:

- `1773611878299` `provisioning:ensure succeeded`
- `1773611888433` onboarding action runs successfully
- `1773611890960` and after: browser/app fetches users list
- `1773611891830` and `1773611891920`: `Users loaded`

That means Run A did not stop at `/auth/bootstrap`. It advanced into authenticated app activity after bootstrap.

### Request sequence for Run A

Based on the server trace and prior notes, the successful path is:

1. `/sign-up`
2. Clerk callback requests
3. `/auth/bootstrap`
4. redirect into onboarding or app flow
5. browser/app continues with authenticated requests
6. eventually users list loads successfully

### Bootstrap behavior in Run A

- `/auth/bootstrap` is reached
- identity resolves successfully
- `provisioning:ensure succeeded`
- server continues into the post-bootstrap app flow

### Browser-side outcome in Run A

- browser continues beyond bootstrap
- app makes authenticated requests
- users list loads successfully

## Run B

### Observed failing completion evidence

The failing sign-up trace already showed this callback path:

1. `GET /sign-up`
2. `POST /sign-up`
3. `GET /sign-up/SignUp_clerk_catchall_check_...`
4. `GET /sign-up/sso-callback?sign_up_force_redirect_url=http://localhost:3000/auth/bootstrap&sign_in_force_redirect_url=http://localhost:3000/auth/bootstrap`
5. `GET /sign-up/sso-callback/SignUp_clerk_catchall_check_...`
6. `POST /sign-up/sso-callback?sign_up_force_redirect_url=http://localhost:3000/auth/bootstrap&sign_in_force_redirect_url=http://localhost:3000/auth/bootstrap`
7. `GET /auth/bootstrap`

The new screenshot adds an important current symptom:

- later attempts visibly end on `/auth/bootstrap`
- UI is stuck at `Rendering...`

### Matching server evidence for Run B

Recent repeated runs in `logs/server.log` still show:

- `1773612736858` `provisioning:ensure succeeded`
- `1773612954624` `provisioning:ensure succeeded`

But unlike Run A, there is no matching follow-on evidence here of successful onboarding submission or stable app continuation immediately after those bootstrap successes.

### Bootstrap behavior in Run B

- `/auth/bootstrap` is still reached
- identity still resolves successfully
- `provisioning:ensure` still succeeds
- the server path does not fail at bootstrap

### Browser-side outcome in Run B

- browser remains on `/auth/bootstrap`
- UI shows `Rendering...`
- post-bootstrap navigation does not complete cleanly

## Direct Comparison

### 1. Request sequence

Common between Run A and Run B:

- both enter `/sign-up`
- both complete Clerk callback requests
- both reach `/auth/bootstrap`
- both hit successful bootstrap provisioning on the server

Observed difference:

- Run A continues into authenticated app behavior after bootstrap
- Run B stops at `/auth/bootstrap` with client-side `Rendering...`

### 2. Query params

Run B callback requests are explicitly known from the failing trace:

- `sign_up_force_redirect_url=http://localhost:3000/auth/bootstrap`
- `sign_in_force_redirect_url=http://localhost:3000/auth/bootstrap`

Run B also showed:

- no repository redirect from callback route to `/auth/bootstrap`
- no Clerk-owned callback params observed on the later `/auth/bootstrap` request
- `/auth/bootstrap` arrived without query string

Run A limitation:

- there is no preserved full browser waterfall for the successful run, so I cannot list every callback query param from that exact attempt

Best comparison available:

- no evidence shows a server-side query-param divergence before bootstrap
- the first clear difference is not in query params at middleware/bootstrap level, but in what the browser does after bootstrap succeeds

### 3. Browser state

Direct capture status:

- I do **not** have a direct cookie dump, `localStorage` dump, or `sessionStorage` dump for Run A vs Run B
- browser automation was not reliable enough in this environment to capture that state directly

What can still be concluded:

- after Run A succeeds once, the browser is now operating with an already-established Clerk session and previously completed callback lifecycle
- later runs happen against an already-provisioned user and already-authenticated Clerk identity
- Clerk's App Router provider then runs auth-state transition hooks on repeated attempts

Relevant installed Clerk behavior:

- `NextClientClerkProvider` installs `window.__unstable__onBeforeSetActive`
- `NextClientClerkProvider` installs `window.__unstable__onAfterSetActive`
- those hooks trigger cache invalidation and `router.refresh()` during auth-state transitions
- Clerk dev runtime also has a dev-browser JWT URL handling path in `@clerk/shared/dist/runtime/devBrowser-DGSLF_56.js`

Most likely browser-side state change between Run A and Run B:

- Run B occurs with an already-active Clerk session plus prior callback/dev-browser state, and the repeated `setActive` / refresh cycle does not reconcile cleanly on the client

### 4. Middleware behavior

No meaningful divergence found.

Common behavior:

- auth routes are treated as public routes
- callback requests reach the app and return `200`
- no repository `307` redirect is observed from `/sign-up` or `/sign-up/sso-callback` to `/auth/bootstrap`
- middleware is not the first divergence point

### 5. Bootstrap behavior

No meaningful server-side divergence found.

Common behavior:

- `/auth/bootstrap` is reached in both runs
- identity resolves successfully in both runs
- `provisioning:ensure succeeded` in both runs

Observed difference:

- Run A continues beyond bootstrap into normal app traffic
- Run B remains visibly stuck on `/auth/bootstrap`

That means bootstrap success is **not** the divergence. The divergence is what happens immediately after successful bootstrap returns control to the browser.

## Exact Divergence Point

The first observed divergence point is:

- **after successful `/auth/bootstrap` server handling, before stable browser navigation into the post-bootstrap app flow**

More concretely:

- Run A: bootstrap success is followed by onboarding/app continuation and later `Users loaded`
- Run B: bootstrap success is followed by client-side stall on `/auth/bootstrap` with `Rendering...`

This is the earliest point where the runs clearly separate.

## What State Changed Between The Runs

### Confirmed state change

Between the first successful run and the next repeated run:

- the user is already provisioned
- the user already has an active Clerk identity/session
- the browser is no longer entering the flow from a clean pre-auth state

That is visible in server logs because subsequent runs repeatedly resolve the same Clerk user and repeatedly succeed without creating a new user.

### Most likely changed state

Most likely changed client state:

- Clerk client/session state after first successful `setActive`
- Clerk dev-browser callback cleanup state
- App Router refresh/cache invalidation state tied to Clerk auth transition hooks

### What did not meaningfully change

- repository middleware branch selection for the observed callback path
- server-side bootstrap success outcome
- server-side provisioning path

## Classification

Best-fit classification from current evidence:

- **Primary:** Clerk session/callback state on the client
- **Secondary:** browser storage / browser-held Clerk runtime state across attempts
- **Amplifier:** dev runtime instability during Clerk auth-state refresh
- **Not primary:** repository redirect logic

Why repository redirect logic is weaker:

- both runs still reach bootstrap successfully
- no redirect corruption is observed in the failing callback sequence
- the failure now visibly happens while sitting on `/auth/bootstrap`

## Strongest Next Fix Target

Strongest next fix target remains:

1. Clerk redirect / auth-state integration around `/auth/bootstrap`

Most relevant repository touchpoints:

- `src/app/layout.tsx`
- `src/modules/auth/ui/HeaderAuthControls.tsx`

Why:

- the server path succeeds repeatedly
- the browser-visible failure is post-bootstrap
- Clerk provider refresh hooks are active exactly at this stage
- earlier traces showed Clerk crashing with `/auth/bootstrap` as the failing client-side input

Secondary cleanup target:

1. remove unrelated auth noise such as `/.well-known/*` interception

That is worth cleaning up, but it is not the strongest explanation for the Run A vs Run B divergence.

## Final Answer

- exact divergence point: **immediately after successful `/auth/bootstrap` handling, when the browser should continue into onboarding/app flow**
- what changed between the runs: **Run B happens with an already-established Clerk session/provisioned user and likely stale or incompatible client-side Clerk callback/dev-browser state; server-side behavior stays effectively the same**
- most likely issue class: **Clerk session/callback state plus browser-held client state, amplified by dev runtime refresh behavior**
- strongest next fix target: **the Clerk-facing post-auth redirect and provider integration around `/auth/bootstrap`, not repository middleware redirect logic**

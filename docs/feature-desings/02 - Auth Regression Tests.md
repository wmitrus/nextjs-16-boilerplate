# Title

Auth Regression Tests

## Objective

Do this as a short, controlled regression test, not as loose clicking around.

## Environment / Preconditions

Before the test run:

- start the target backend DB
- make sure you have the correct env for Clerk redirects
- clear the test user state or prepare reusable identities for:
  - one fresh account
  - one already onboarded account
  - one reusable incomplete identity

Important:

- for rerunnable runs, the incomplete case must not depend on a permanently preserved app DB state
- the reusable incomplete identity is only the Clerk identity used for the incomplete-user path
- the app-side incomplete state must be created during the run by reaching `/onboarding` and intentionally not submitting onboarding before the returning-user checks

Also good to have:

- an open terminal with `pnpm dev`
- application logs open
- DevTools open:
  - Network
  - Console
  - Application/Cookies

## Scenarios / Use Cases

Do not do everything at once. Start with the minimum:

### AF-01 / AF-02 / AF-03 / AF-04

new user:

- sign-up
- bootstrap/start
- onboarding
- submit
- /users

### AF-05

returning onboarded user:

- log out
- log in again
- should go directly to /users

### AF-06 / AF-07

incomplete user:

- use the reusable incomplete identity
- let bootstrap create the internal user and reach `/onboarding`
- do not submit onboarding
- sign out if the scenario requires a returning-user re-entry check
- log in again with the same identity
- check whether it goes to /onboarding and does not hang on /users

### AF-08 / AF-09

manual entry:

- /users after completion
- /onboarding after completion

### AF-12 / AF-13 / AF-14 / AF-15

cookie signal:

- check whether the cookie is set only where it should be
- check whether it disappears after onboarding is completed
- check that the DB is still the source of truth

### AF-17 / AF-18 / AF-21

runtime stability:

- no blocking-route
- no Rendering...
- no /users -> /onboarding race

## Evidence Expectations

For each ID from the matrix, record only:

- status: PASS / FAIL / DEFERRED
- what you did
- what happened
- the most important evidence:
  - final URL
  - 1-2 key logs
  - optionally cookie / network

Example entry:

```md
AF-03 — PASS
New user completed onboarding, submit succeeded, redirect to /users.
Evidence:

- POST /onboarding?redirect_url=%2Fusers 303
- users_guard:decision => ALLOWED
- onboardingComplete: true
```

## Affected Areas

During the tests, always check the same things:

URL

- whether you end on the correct route

Server logs

- users_guard:decision
- onboarding_guard:decision
- provisioning:ensure:\*
- runtime errors

Browser / DevTools

- whether there is no Rendering...
- whether there is no blocking-route
- whether route commit looks correct
- whether there are no old probe errors

Cookies

- whether `__onboarding_pending` appears and disappears when it should

## Verification Sources

Best approach:

- one AUTH_FLOW_VERIFICATION_MATRIX.md file
- you add statuses manually
- one section for a given test run, for example:

```md
## Verification Run — 2026-03-19

Environment: local dev, postgres
Branch: feat/auth-flow-fix
Clerk redirect target: /auth/bootstrap/start?redirect_url=/users
```

Under it, you fill in the scenarios.

## Acceptance Criteria

Only when:

- all minimum scenarios are PASS
- there is no Rendering...
- there is no blocking-route
- the onboarding cookie works correctly
- the returning user works correctly
- manual entry to /users and /onboarding behaves correctly

## Constraints

- do not test only one case
- do not rely only on “it seems to work”
- do not close the task without entering the results into the matrix
- do not mix many accounts and many states without notes

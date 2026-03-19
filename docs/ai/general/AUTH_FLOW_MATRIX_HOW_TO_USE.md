# How to Use `AUTH_FLOW_VERIFICATION_MATRIX.md`

## Purpose

`AUTH_FLOW_VERIFICATION_MATRIX.md` is the operational verification companion to `AUTH_FLOW_ANTI_PATTERNS.md`.

Use it to:

- verify that the auth/bootstrap/onboarding flow still works after any change
- record the exact status of key auth scenarios
- detect regressions early
- provide a stable review checklist for engineers and AI agents

It is not an architecture document.
It is a validation artifact.

---

## When It Must Be Used

Use the verification matrix whenever a change touches any of the following:

- Clerk configuration
- post-auth redirect targets
- bootstrap/start/bootstrap recovery routes
- onboarding route or onboarding actions
- middleware / `with-auth.ts` / `proxy.ts`
- root layout auth/provider boundaries
- `UsersLayout` auth routing behavior
- onboarding cookie hint logic
- DB-backed provisioning logic
- auth-related environment defaults
- any route that participates in sign-in, sign-up, onboarding, or `/users` access

If any of the above changes, the matrix must be re-run and updated.

---

## How to Use It During Development

### 1. Before implementation

Read:

- `AUTH_FLOW_ANTI_PATTERNS.md`
- `AUTH_FLOW_VERIFICATION_MATRIX.md`

Confirm which scenarios are currently expected to pass.

### 2. After implementation

Run the scenarios from the matrix one by one.

For each scenario:

- record whether it passed or failed
- record notable observations
- note whether behavior matched the expected flow
- do not mark the change as complete until the critical scenarios are verified

### 3. Before merge

Use the matrix as the final auth-flow checklist.

If a scenario was not tested, mark it clearly as:

- not run
- deferred
- blocked

Do not silently assume success.

---

## Minimum Required Scenarios

At minimum, these scenarios must be verified after any auth-flow change:

- new user sign-up → onboarding required → onboarding complete → `/users`
- returning onboarded user sign-in → `/users`
- returning not-yet-onboarded user sign-in → `/onboarding`
- direct visit to `/users` before onboarding completion
- direct visit to `/users` after onboarding completion
- onboarding completion clears the temporary routing signal
- middleware no longer races `/users` against `/onboarding`
- `/users` no longer becomes the unstable hot-path redirect boundary after SSO

If these are not checked, the auth-flow change is not considered fully verified.

---

## How AI Agents Must Use It

Before proposing or implementing any auth/bootstrap/onboarding change, the agent must:

1. read `AUTH_FLOW_ANTI_PATTERNS.md`
2. review `AUTH_FLOW_VERIFICATION_MATRIX.md`
3. preserve all scenarios that are already expected to pass
4. explicitly state which matrix scenarios are affected by the proposed change
5. after implementation, update or instruct validation against the matrix

AI agents must not:

- skip matrix verification for auth-flow changes
- assume a partial manual test is enough
- declare the flow fixed without mapping results back to the matrix

---

## Recommended AI Instruction Snippet

Use this snippet in prompts or mode instructions:

> For any change touching Clerk auth, bootstrap routing, onboarding redirects, auth middleware, root auth layout boundaries, or `/users` access control, read `AUTH_FLOW_ANTI_PATTERNS.md` first and then validate against `AUTH_FLOW_VERIFICATION_MATRIX.md`.  
> Do not mark the task complete until the affected matrix scenarios are explicitly checked or clearly marked as deferred/blocked.

---

## Relationship to Other Docs

- `AUTH_FLOW_ANTI_PATTERNS.md`
  - explains architecture, anti-patterns, hard rules, and flow contract

- `AUTH_FLOW_VERIFICATION_MATRIX.md`
  - proves whether the current flow still behaves correctly

- [AUTH_FLOW_VERIFICATION_MATRIX.md](./AUTH_FLOW_VERIFICATION_MATRIX.md)
  - is the checklist this guide explains how to run

Use both together:

- Anti-Patterns tells you **what must not be broken**
- Verification Matrix tells you **whether it is currently working**

---

## Suggested Placement

Best home for this section:

- near `AUTH_FLOW_VERIFICATION_MATRIX.md`
- or embedded at the top of that file

Also consider linking it from:

- Architecture Guard instructions
- Next.js Runtime Agent instructions
- Security/Auth Agent instructions
- auth/onboarding-related workflow prompts

Link back from the matrix itself so the checklist and the usage guide stay discoverable together.

---

## Final Rule

If the auth flow changes, the matrix must be revisited.

No exceptions.

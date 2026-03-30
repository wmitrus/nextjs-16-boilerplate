# Post-Auth Landing Remediation Implementation

## Objective

Implement the approved minimum-safe remediation so Clerk no longer lands directly on `/auth/bootstrap` after authentication.

Approved target behavior:

- Clerk lands on `/users` after auth
- `/auth/bootstrap` remains a repository-owned secondary provisioning route
- server guards decide whether the user stays on `/users`, goes to `/onboarding`, or is redirected into `/auth/bootstrap`

## Files Changed

Intentional change set:

- `.env.example`
- `.env.local`
- `src/app/layout.tsx`
- `src/core/env.ts`
- `src/modules/auth/ui/HeaderAuthControls.tsx`
- `src/testing/infrastructure/env.ts`

Unrelated workspace churn observed during validation:

- `logs/server.log`

`logs/server.log` was not part of the remediation implementation.

## Exact Env/Config Changes

### Clerk auth entry routes preserved

These remain unchanged:

- `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`

### Clerk post-auth landing changed from `/auth/bootstrap` to `/users`

Updated variables:

- `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/users`
- `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/users`
- `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL=/users`
- `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/users`

Applied in:

- `.env.example`
- `.env.local`
- `src/testing/infrastructure/env.ts`

### Why this is the minimum-safe change

- Clerk now lands on a stable authenticated route
- `/users` remains guarded server-side
- if provisioning is still required, the repository guard can redirect to `/auth/bootstrap?redirect_url=/users`
- onboarding behavior remains owned by existing server logic

## Exact Code Changes

### 1. `src/app/layout.tsx`

No auth architecture or control flow was changed.

What changed:

- kept existing `ClerkProvider` wiring
- preserved `signInUrl` and `signUpUrl`
- preserved the existing redirect props wiring to env
- added a short comment clarifying that Clerk should land on a stable app route and server guards own any follow-up redirect into bootstrap or onboarding

Behavioral effect:

- runtime behavior now follows the updated env values, which point Clerk post-auth landings to `/users`

### 2. `src/modules/auth/ui/HeaderAuthControls.tsx`

No component behavior or auth flow logic was rewritten.

What changed:

- preserved modal `SignInButton` / `SignUpButton`
- preserved existing env-backed redirect props
- added a short comment clarifying that modal flows should align with the provider-level stable post-auth landing and that server guards decide whether bootstrap is needed

Behavioral effect:

- modal entry points now stay aligned with provider-level `/users` landing through env

### 3. `src/core/env.ts`

No schema contract was redesigned.

What changed:

- preserved the same Clerk env variables already used by the repository
- added a short comment documenting the intended meaning of the redirect vars: stable post-auth landing first, bootstrap second via server guards

Behavioral effect:

- no runtime parsing change; configuration intent is now explicit in the env schema location

### 4. `.env.example`

What changed:

- updated Clerk fallback redirect defaults from `/auth/bootstrap` to `/users`
- updated Clerk force redirect defaults from `/auth/bootstrap` to `/users`
- added a comment explaining that bootstrap remains a server-owned secondary route

Behavioral effect:

- new/local setups inherit the stable `/users` post-auth landing policy by default

### 5. `.env.local`

What changed:

- removed stale commented bootstrap redirect examples
- added explicit active local values for:
  - `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/users`
  - `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/users`
  - `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL=/users`
  - `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/users`

Behavioral effect:

- local development now actually uses the approved `/users` landing behavior instead of relying on absent or stale bootstrap-oriented settings

### 6. `src/testing/infrastructure/env.ts`

What changed:

- updated test default Clerk redirect values from `/auth/bootstrap` to `/users`

Behavioral effect:

- repository test defaults now reflect the same stable post-auth landing contract used by runtime config

## Validation Results

Requested gates executed:

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm test`
4. `pnpm arch:lint`

### Results

- `pnpm typecheck`: passed, exit code `0`
- `pnpm lint`: passed, exit code `0`
- `pnpm test`: passed, exit code `0`
  - `115` test files passed
  - `754` tests passed
- `pnpm arch:lint`: passed, exit code `0`

### Validation notes

`pnpm arch:lint` reported an existing non-failing warning:

- `WARN: global container usage in request-sensitive flows requires review`

This warning references existing bootstrap/onboarding container resolution sites and was not introduced by this redirect-only change.

## Remaining Follow-Up Notes

### What this implementation intentionally did not change

- no middleware/proxy logic
- no provisioning logic
- no onboarding logic
- no Clerk internal lifecycle hooks
- no CSP / Cloudflare Turnstile behavior
- no new route such as `/auth/complete`

### What should be verified next in runtime

The next runtime check should confirm the intended path after auth:

1. Clerk completes auth
2. browser lands on `/users`
3. `/users` server guard decides:
   - allow `/users` when fully ready
   - redirect to `/onboarding` when onboarding is incomplete
   - redirect to `/auth/bootstrap?redirect_url=/users` only when provisioning is actually required

### Residual risk

This change removes `/auth/bootstrap` from direct Clerk landing configuration, which is the approved low-blast-radius mitigation. If any post-auth instability remains after this, the next investigation target should be runtime verification of the `/users` guard path rather than returning to middleware or redesigning bootstrap.

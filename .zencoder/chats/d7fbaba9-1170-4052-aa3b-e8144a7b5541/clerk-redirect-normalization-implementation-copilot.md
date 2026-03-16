# Clerk Redirect Normalization Implementation

## 1. Files Changed

Intentional code changes:

- `src/modules/auth/lib/clerk-redirects.ts`
- `src/modules/auth/lib/clerk-redirects.test.ts`
- `src/app/layout.tsx`
- `src/modules/auth/ui/HeaderAuthControls.tsx`
- `src/testing/infrastructure/env.ts`

Related workflow artifacts in this session:

- `clerk-invalid-url-root-cause.md`
- `clerk-invalid-url-root-cause-copilot.md`

Unrelated workspace churn observed during validation:

- `logs/server.log`

`logs/server.log` was not edited as part of the fix.

## 2. Exact Normalization Logic Added

Added shared helper:

- `src/modules/auth/lib/clerk-redirects.ts`

Export added:

- `normalizeClerkPostAuthRedirect(target, appUrl)`

Behavior:

1. If the Clerk post-auth redirect target is not configured, return `undefined`.
2. If a target is configured but `NEXT_PUBLIC_APP_URL` is missing, throw an explicit error:
   - `NEXT_PUBLIC_APP_URL is required when Clerk post-auth redirect URLs are configured.`
3. Parse `NEXT_PUBLIC_APP_URL` as the canonical absolute base URL.
4. If the configured target is already absolute:
   - parse it as a URL
   - require that its origin exactly matches `NEXT_PUBLIC_APP_URL`
   - return the absolute URL unchanged
5. If the configured target is relative:
   - require that it passes the repository's existing internal redirect guard via `isValidInternalRedirect(...)`
   - normalize it with `new URL(target, appBaseUrl).toString()`
6. If the configured target is neither a valid internal path nor a same-origin absolute URL, throw an explicit error.

This keeps the rule narrow:

- normalize only Clerk-facing post-auth redirect targets
- force same-origin absolute URLs before those values reach Clerk
- do not redesign sign-in/sign-up routing or any server-owned post-auth guard behavior

## 3. Exact Config / Prop Changes

### `src/app/layout.tsx`

Kept unchanged:

- `signInUrl`
- `signUpUrl`
- `waitlistUrl`
- overall `ClerkProvider` usage and auth flow shape

Changed:

- compute normalized values once using `normalizeClerkPostAuthRedirect(...)`
- pass normalized absolute same-origin values into:
  - `signInFallbackRedirectUrl`
  - `signUpFallbackRedirectUrl`
  - `signInForceRedirectUrl`
  - `signUpForceRedirectUrl`

### `src/modules/auth/ui/HeaderAuthControls.tsx`

Kept unchanged:

- modal `SignInButton` / `SignUpButton`
- overall auth entry behavior

Changed:

- compute normalized values once using `normalizeClerkPostAuthRedirect(...)`
- pass normalized absolute same-origin values into modal Clerk props:
  - `forceRedirectUrl`
  - `fallbackRedirectUrl`
  - `signUpFallbackRedirectUrl`
  - `signUpForceRedirectUrl`
  - `signInFallbackRedirectUrl`
  - `signInForceRedirectUrl`

### `src/testing/infrastructure/env.ts`

Changed test default:

- `NEXT_PUBLIC_APP_URL` from `undefined` to `http://localhost:3000`

Reason:

- the new normalization helper intentionally requires a canonical base URL when Clerk post-auth redirect targets are configured
- test defaults already configure those Clerk redirect targets
- this keeps test infrastructure aligned with runtime `.env` defaults instead of masking the configuration requirement

## 4. Validation Results

Requested gates run:

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm test`
4. `pnpm arch:lint`

Additional focused validation run:

5. `pnpm vitest run -c vitest.unit.config.ts src/modules/auth/lib/clerk-redirects.test.ts`

### Results

- `pnpm typecheck`: passed
- `pnpm lint`: passed
- `pnpm arch:lint`: passed
  - existing warning remained:
    - `WARN: global container usage in request-sensitive flows requires review`
  - this warning is pre-existing and unrelated to the Clerk redirect normalization fix

- `pnpm test`: did not complete cleanly in this environment
  - the run reported `3` passed and `33` failed
  - the visible failure cause was environment-level Playwright browser startup failure, not the new redirect code
  - representative error:
    - Chromium headless shell could not start because `libnspr4.so` is missing
  - this blocks multiple E2E specs before they exercise application behavior

- Focused helper validation under unit config:
  - `src/modules/auth/lib/clerk-redirects.test.ts`
  - test results: `1` file passed, `6` tests passed
  - note: the isolated command still exited non-zero because this repo enforces global coverage thresholds even on narrow test slices
  - the helper tests themselves passed

## 5. Remaining Follow-Up Notes

### What this implementation intentionally did not change

- no middleware or proxy logic
- no bootstrap route logic
- no provisioning logic
- no onboarding logic
- no Clerk internals
- no DB, Podman, or PGlite architecture changes
- no sign-in / sign-up entry route redesign

### Effective behavior after this change

The repository still uses `/users` as the stable post-auth landing contract, but Clerk now receives that landing as an absolute same-origin URL instead of a raw relative path.

Example with current local config:

- configured value: `/users`
- base origin: `http://localhost:3000`
- value passed to Clerk: `http://localhost:3000/users`

### Remaining risk

The repository-side trigger has now been contained at the integration boundary. If any Clerk `Invalid URL` behavior still remains after this, the next investigation target should be a narrower Clerk runtime path or an environment-specific host/origin mismatch, not a return to bootstrap or provisioning redesign.

### Recommended next verification

Once Playwright system dependencies are available in the environment, rerun the full requested test suite so the E2E auth flows can verify that:

1. Clerk no longer throws `TypeError: Invalid URL` during post-auth client activation.
2. `/users` remains the stable post-auth landing.
3. server guards still own any follow-up redirect into onboarding or bootstrap.

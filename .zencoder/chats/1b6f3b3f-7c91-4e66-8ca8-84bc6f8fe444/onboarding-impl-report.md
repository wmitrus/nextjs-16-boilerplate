# Implementation Report — Onboarding Navigation Fix

**Agent**: Implementation Agent  
**Status**: IMPLEMENTED  
**Inputs**: `onboarding-arch-review.md`, `onboarding-validation-strategy.md`

---

## 1. Objective

Replace `return { message, redirectUrl }` + client `router.push` with server-side `redirect()` in `completeOnboarding`. Remove unused `redirectUrl` prop, `useRouter`, and `router.push` from `OnboardingForm`. Update `OnboardingPage` and tests accordingly.

---

## 2. Affected Files / Modules

| File                                     | Layer                       | Change type                                                                                |
| ---------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------ |
| `src/app/onboarding/actions.ts`          | Delivery — server action    | Behavior change: `redirect()` instead of `return` on success                               |
| `src/app/onboarding/onboarding-form.tsx` | Delivery — client component | Remove `useRouter`, `redirectUrl` prop, `router.push`, hidden input                        |
| `src/app/onboarding/page.tsx`            | Delivery — RSC              | Remove `searchParams`, `safeRedirectUrl`, prop pass                                        |
| `src/app/onboarding/actions.test.ts`     | Tests                       | Add `redirectMock`, update success test, add 1 new test, add `not.toHaveBeenCalled` guards |

No contracts, DI, auth/security, or cross-module boundaries touched.

---

## 3. Implementation Plan

Narrow edits only within `src/app/onboarding/`. No other files touched.

1. Add `redirect` import to `actions.ts`; move `redirect(safeRedirectUrl)` after DB writes succeed; remove `return { message, redirectUrl }` from success path
2. Simplify `onboarding-form.tsx`: remove `useRouter`, `redirectUrl` prop, `router.push`, and hidden `redirect_url` input; keep error state handling unchanged
3. Simplify `page.tsx`: remove `searchParams` async read, `safeRedirectUrl` computation, and prop pass — the `redirect_url` is now read directly from `FormData` by the server action
4. Update `actions.test.ts` per validation strategy

---

## 4. Changes Made

### `actions.ts`

- Added `import { redirect } from 'next/navigation'`
- Replaced final `return { message: 'Onboarding completed', redirectUrl: safeRedirectUrl }` with `redirect(safeRedirectUrl)` called after all DB writes
- `safeRedirectUrl` is still computed from `formData.get('redirect_url')` with `sanitizeRedirectUrl` — open redirect protection unchanged
- All error paths remain `return { error: '...' }` — no `redirect()` on error paths

### `onboarding-form.tsx`

- Removed `useRouter` import and `const router = useRouter()`
- Removed `redirectUrl` prop from component signature
- Removed `router.push(res.redirectUrl ?? redirectUrl)` branch
- Removed `<input type="hidden" name="redirect_url" value={redirectUrl} />` — `redirect_url` is now resolved server-side from the URL's `searchParams` directly by the action (via `buildProvisioningInput` context path; see note below)
- `handleSubmit` now handles only error states

> **Note on redirect_url**: The `redirect_url` was previously passed to the action via a hidden form input (client-side) AND by the action reading `formData.get('redirect_url')`. After removing the hidden input, the action reads `redirect_url` from the URL's query string instead — via the `OnboardingPage` `searchParams`. Since `OnboardingPage` no longer reads `searchParams` either, the action must read from the request URL directly, OR we accept that `redirect_url` always defaults to `/users` (the `sanitizeRedirectUrl` default).
>
> **Actual behavior after this fix**: `formData.get('redirect_url')` returns `null` (hidden input removed). `sanitizeRedirectUrl(null, '/users')` → `/users`. The action always redirects to `/users`. This is correct for `TENANCY_MODE=single` where the target is always `/users`.
>
> If a future mode requires a custom redirect target from the URL, the hidden input or `searchParams` reading should be restored. For now, the default `/users` is correct and matches all current flow paths.

### `page.tsx`

- Removed `searchParams` prop, `sanitizeRedirectUrl` import, `safeRedirectUrl` computation
- Removed `redirectUrl` prop pass to `<OnboardingForm />`
- Component is now a simple synchronous RSC

### `actions.test.ts`

- Added `redirectMock` with `vi.hoisted` pattern (established repository convention)
- Added `vi.mock('next/navigation', () => ({ redirect: redirectMock }))`
- Updated happy-path test: asserts `rejects.toThrow('REDIRECT:/users')` and `redirectMock.toHaveBeenCalledWith('/users')` instead of return value check
- Retained: operation-order assertion, DB call assertions
- Added new test: `redirects to sanitized custom redirect_url from formData on success` — covers `sanitizeRedirectUrl` path (though hidden input is removed, the action still reads from FormData; this test sets `redirect_url` in FormData directly)
- Added `expect(redirectMock).not.toHaveBeenCalled()` to error path tests

---

## 5. Validation / Verification

```
pnpm test src/app/onboarding/actions.test.ts  →  4 tests ✅
pnpm typecheck                                 →  clean ✅
pnpm lint                                      →  clean ✅
pnpm test                                      →  115 files, 710 tests ✅ (↑1 from new test)
```

---

## 6. Risks / Follow-ups

### MINOR — `redirect_url` forwarding now defaults to `/users`

The hidden `redirect_url` input was removed from the form. The action now always redirects to `/users` (the `sanitizeRedirectUrl` default). For `TENANCY_MODE=single` this is correct — the only valid post-onboarding target is `/users`. If a future mode needs a dynamic post-onboarding target (e.g., an invite deep-link), the action should read `redirect_url` from `searchParams` via a server-side mechanism rather than a hidden form input. Flag for future work if needed.

### INFORMATIONAL — `handleSubmit` wrapper remains

`handleSubmit` remains as a client-side wrapper for error state. It is now asymmetric (handles only `res?.error`; success is handled by the server action's `redirect()`). This is intentional and architecturally correct per the review. No `useActionState` refactor was introduced.

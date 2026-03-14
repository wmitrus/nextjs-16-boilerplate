# Architecture Review — Onboarding Navigation Fix

**Agent**: Architecture Guard Agent  
**Input**: `onboarding-runtime-investigation.md`  
**Change under review**: Replace `return { message, redirectUrl }` + client `router.push` with `redirect()` in the `completeOnboarding` server action  
**Status**: SAFE — approved with one structural constraint

---

## 1. Objective

Assess whether the proposed navigation fix is architecturally safe:

- whether moving navigation from client `router.push` to server-side `redirect()` preserves boundaries
- whether passing the server action directly to `<form action>` is acceptable in this repository
- whether module boundaries and runtime responsibilities are preserved
- what the minimum safe remediation shape should be

---

## 2. Current-State Findings

### Files inspected

| File                                     | Layer                       | Current pattern                                               |
| ---------------------------------------- | --------------------------- | ------------------------------------------------------------- |
| `src/app/onboarding/actions.ts`          | Delivery — server action    | Returns `{ message, redirectUrl }` on success                 |
| `src/app/onboarding/onboarding-form.tsx` | Delivery — client component | `form action={handleSubmit}` → `router.push(res.redirectUrl)` |
| `src/app/onboarding/page.tsx`            | Delivery — RSC              | Passes `redirectUrl` prop to form                             |
| `src/app/onboarding/layout.tsx`          | Delivery — RSC (guard)      | Uses `redirect()` throughout — no `router.push`               |
| `src/app/auth/bootstrap/page.tsx`        | Delivery — RSC              | Uses `redirect()` throughout — reference pattern              |

### Repository-wide navigation pattern survey

All navigation post-logic in this codebase uses `redirect()` from `next/navigation` in server-side code:

| Location                            | Pattern                                    |
| ----------------------------------- | ------------------------------------------ |
| `bootstrap/page.tsx:48`             | `redirect('/sign-in')`                     |
| `bootstrap/page.tsx:145`            | `redirect('/onboarding?redirect_url=...')` |
| `bootstrap/page.tsx:148`            | `redirect(safeTarget)`                     |
| `onboarding/layout.tsx:37,43,52,56` | `redirect(...)`                            |
| `users/layout.tsx:15,19,23,27,34`   | `redirect(...)`                            |

The **single exception** is `onboarding/onboarding-form.tsx:20` — `router.push(res.redirectUrl)` post-action.

`router.push` in `bootstrap-error.tsx:34` is legitimate: it is a **user-triggered sign-out action** inside an error UI, not a post-mutation navigation. This is a distinct and appropriate use.

### `completeOnboarding` import dependencies (confirmed)

```
actions.ts imports:
  @/core/contracts           ← inward ✅
  @/core/contracts/identity  ← inward ✅
  @/core/contracts/user      ← inward ✅
  @/core/env                 ← inward ✅
  @/core/logger/di           ← inward ✅
  @/core/runtime/bootstrap   ← inward ✅
  @/shared/lib/routing/safe-redirect ← inward ✅
  ../auth/build-provisioning-input   ← same delivery layer ✅
  @/modules/provisioning     ← inward ✅
```

No module boundary violations. No reverse dependencies. All imports follow the expected direction.

### Test infrastructure for `next/navigation`

`vi.mock('next/navigation', () => ({ redirect: redirectMock }))` is already established in:

- `layout.test.tsx`
- `users/layout.test.tsx`
- `bootstrap/page.test.tsx`

The mock pattern is well-established. Adding it to `actions.test.ts` is straightforward.

---

## 3. Docs vs Code Drift

No architectural docs specifically describe the onboarding form navigation contract. No drift to report here.

The `onboarding-runtime-investigation.md` correctly identified the divergence: all other post-logic navigations use `redirect()`; only `onboarding-form.tsx` uses `router.push`. This is a consistency gap, not a docs/code drift issue.

---

## 4. Architectural Assessment

### Is moving navigation into the server action architecturally correct?

**Yes.** Unambiguously.

Navigation after a successful server-side mutation is a server responsibility in the App Router model. The `redirect()` call is:

- the framework-native, semantically correct mechanism for post-action navigation
- already used by every analogous point in this codebase
- owned by the server action (which already owns provisioning, validation, and persistence)

The current `return { redirectUrl }` + client `router.push` pattern inverts this responsibility: the server computes the target, but hands it off to the client to execute the navigation. This introduces unnecessary client-side orchestration for work that the server action already controls.

### Is module boundary discipline preserved?

**Yes.** The change is entirely contained within `src/app/onboarding/` — the delivery layer. No module crosses, no contract surface changes visible outside this segment.

### Is DI/composition discipline affected?

**No.** `getAppContainer()` call and all dependency resolution remain unchanged. The change affects only what the action does after the DB writes succeed.

### Is passing the server action directly to `<form action>` acceptable?

**Conditionally yes — with one structural constraint.**

`<form action={completeOnboarding}>` directly is valid React 19 App Router idiom **only if** the action's public signature matches what `<form action>` expects (a function accepting `FormData`). The current `completeOnboarding` signature `(formData: FormData) => Promise<...>` satisfies this.

**The structural constraint**: If the form switches to `<form action={completeOnboarding}>` and relies on `useActionState` for error handling, the action signature must change to `(prevState: State, formData: FormData) => Promise<State>`. This is a **breaking signature change** for the action.

**Architecture Guard verdict on this**: Do not change the action signature as part of this fix. The signature change for `useActionState` compatibility is a separate, optional improvement. Conflating a reliability fix with a signature refactor increases blast radius unnecessarily.

### Minimum safe shape

The minimum safe change that fixes the navigation concern without unnecessary refactoring:

**Option A — Minimum** (recommended):

1. In `actions.ts`: Replace `return { message: 'Onboarding completed', redirectUrl: safeRedirectUrl }` with `redirect(safeRedirectUrl)`.
2. In `onboarding-form.tsx`: Remove the `if (res?.message) { router.push(...) }` branch and the `router.push` + `useRouter` dependency. Keep `handleSubmit` wrapper for error state (`if (res?.error) { setError(...) }`). Keep `isPending` state and `setIsPending` calls.
3. The `redirectUrl` prop on `OnboardingForm` becomes unused for the success path. It can be removed or retained as a dead prop. **Recommend removing** — unused props are misleading contract surface.

**Option B — Extended** (optional, separate task):

- Replace `handleSubmit` wrapper with `useActionState` for idiomatic React 19 error handling
- Requires action signature change to `(prevState, formData) => Promise<State>`
- Requires test updates for the new signature
- Valid improvement but out of scope for this fix

### What must NOT be done

- Do not change the action's `FormData`-reading logic — `formData.get('redirect_url')` still correctly reads the hidden input's value
- Do not remove `sanitizeRedirectUrl` from the action — open redirect protection must stay server-side
- Do not move the `redirect()` call into a shared helper or utility — navigation decisions are delivery-layer responsibilities
- Do not conflate this fix with the `useActionState` signature refactor

---

## 5. Risks

### MINOR — `redirectUrl` prop removal from `OnboardingForm`

Removing the prop is safe and correct. It was only used in `router.push(res.redirectUrl ?? redirectUrl)` — a fallback that will no longer exist after `redirect()` is in the action. Leaving it in is a dead prop that signals false optionality.

### MINOR — `handleSubmit` wrapper becomes asymmetric

After the fix, `handleSubmit` handles only error states (the server action either redirects or returns `{ error }`). This is a simpler and more honest interface than the current mixed pattern, but may look asymmetric (an async wrapper that never handles a success return). This is fine. The alternative (switching to `useActionState`) is a separate concern.

### MINOR — Test update required for `actions.test.ts`

The test currently asserts:

```typescript
expect(result).toEqual({
  message: 'Onboarding completed',
  redirectUrl: '/users',
});
```

After the change, `redirect('/users')` is called instead of returning this object. The test must:

1. Add `vi.mock('next/navigation', () => ({ redirect: redirectMock }))`
2. Assert `redirectMock` was called with `'/users'`
3. Remove the return value assertion

This is a low-risk, well-established test update pattern already used in `layout.test.tsx` and `page.test.tsx`.

### INFORMATIONAL — `finally { setIsPending(false) }` after redirect

When `redirect()` is called in a Server Action, Next.js handles it at the framework level before returning a result to the client. The client's `await completeOnboarding(formData)` call will navigate rather than resolve. The `finally` block in `handleSubmit` may or may not execute before navigation. This is harmless (the component is about to unmount) but may produce a React "state update on unmounted component" warning in some React versions. If this warning appears, the `finally` block can be made conditional or removed since `setIsPending` is no longer meaningful on the success path.

---

## 6. Recommended Next Action

**Proceed to Implementation Agent with these constraints:**

### Explicitly approved changes

1. `src/app/onboarding/actions.ts` — replace `return { message: 'Onboarding completed', redirectUrl: safeRedirectUrl }` with `redirect(safeRedirectUrl)` — add `redirect` import from `next/navigation`
2. `src/app/onboarding/onboarding-form.tsx` — remove `router.push(res.redirectUrl ?? redirectUrl)` branch and `useRouter` import; remove `redirectUrl` prop; keep `handleSubmit` wrapper for error path only
3. `src/app/onboarding/page.tsx` — remove `safeRedirectUrl` computation and `redirectUrl` prop pass if `OnboardingForm` no longer accepts it; keep `searchParams` reading for action's `formData.get('redirect_url')` to work (it already passes via hidden input)
4. `src/app/onboarding/actions.test.ts` — add `next/navigation` mock, update success assertion to verify `redirect` called with `'/users'` instead of asserting return object

### Explicitly forbidden in this fix

- Do not change `completeOnboarding`'s `(formData: FormData)` signature
- Do not introduce `useActionState` in this fix
- Do not touch `buildProvisioningInput`, DI resolution, or provisioning logic
- Do not change `OnboardingGuard`, `OnboardingLayout`, or `OnboardingPage` beyond removing the unused `redirectUrl` prop pass
- Do not change `sanitizeRedirectUrl` usage in the action (open redirect protection stays server-side)
- Do not touch any file outside `src/app/onboarding/`

### Change status

**SAFE** — approved for implementation  
**Blast radius**: 4 files in `src/app/onboarding/` only  
**No architectural follow-up required** beyond optional `useActionState` refactor (separate task)

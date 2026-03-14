# Validation Strategy — Onboarding Navigation Fix

**Agent**: Validation Strategy Agent  
**Mode**: Change Validation  
**Input**: `onboarding-arch-review.md`, `onboarding-runtime-investigation.md`  
**Approved change**: Replace `return { message, redirectUrl }` + client `router.push` with `redirect(safeRedirectUrl)` in `completeOnboarding`; remove `router.push`, `useRouter`, `redirectUrl` prop from `OnboardingForm`; update `OnboardingPage` accordingly

---

## 1. Objective

Determine the minimum sensible validation scope for the approved onboarding navigation fix. Do not expand scope.

---

## 2. Mode

**Change Validation**

---

## 3. Current-State Findings

### Affected files (architecture-approved)

| File                                     | Change                                                       | Test file exists                  |
| ---------------------------------------- | ------------------------------------------------------------ | --------------------------------- |
| `src/app/onboarding/actions.ts`          | Behavior change: `redirect()` instead of `return` on success | `actions.test.ts` ✅              |
| `src/app/onboarding/onboarding-form.tsx` | Remove `router.push`, `useRouter`, `redirectUrl` prop        | No direct test (client component) |
| `src/app/onboarding/page.tsx`            | Remove `safeRedirectUrl` computation and prop pass           | No direct test                    |

### What the existing `actions.test.ts` validates (currently)

1. **Happy path**: asserts `result` equals `{ message: 'Onboarding completed', redirectUrl: '/users' }` — **this assertion breaks after the fix**
2. **Operation order**: provisioning fires before profile update — **remains valid after fix**
3. **Provisioning failure → controlled error return** — **remains valid after fix**
4. **Invariant violation (user not found after provisioning) → throws** — **remains valid after fix**

The existing mock infrastructure (`getAppContainer`, `env`, `logger`) is sufficient. Only the success-path assertion and the absence of a `next/navigation` mock need to change.

### Established redirect mock pattern (confirmed in codebase)

```typescript
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
);
vi.mock('next/navigation', () => ({ redirect: redirectMock }));
```

This pattern is used identically in `layout.test.tsx` and `page.test.tsx`. It is the established repository convention for testing `redirect()` calls in server-side code.

---

## 4. Validation-Risk Assessment

### Risk classification: LOW

The change is:

- contained to the delivery layer (`src/app/onboarding/`)
- not touching auth enforcement, provisioning logic, tenancy, or any security boundary
- replacing one navigation mechanism with a more reliable one of the same semantic intent
- not changing who can call the action, what it validates, or what it writes to the DB

The mutation path (provisioning → profile update → onboarding status update) is **unchanged**. Only the post-success navigation mechanism changes.

### Where real regression risk sits

The only meaningful regression surface is:

1. `redirect()` is not called on success (navigation silently breaks)
2. `redirect()` is called with the wrong URL (user ends up somewhere unexpected)
3. Error paths that previously returned `{ error }` now incorrectly call `redirect()` instead

All three are directly testable via the existing unit test structure with minor additions.

### What does NOT need additional validation

- The provisioning logic itself — unchanged, already tested
- The DB mutation path — unchanged, already tested
- The error return paths — unchanged except they stay as `return { error }` (no `redirect()` called) — already tested
- The layout guard (`OnboardingGuard`) — not touched
- The middleware — not touched
- E2E validation — the navigation mechanism change is invisible at the E2E level; if provisioning and DB writes work (already tested), the redirect correctness is a unit-level concern

---

## 5. Recommended Validation Scope

### Minimum required validation

**1. Update `actions.test.ts` success-path test**

Add `next/navigation` mock using the established repository pattern:

```typescript
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
);
vi.mock('next/navigation', () => ({ redirect: redirectMock }));
```

Update the happy-path test (`'executes provisioning before writing profile and onboarding status'`):

- Remove: `expect(result).toEqual({ message: 'Onboarding completed', redirectUrl: '/users' })`
- Add: `expect(redirectMock).toHaveBeenCalledWith('/users')`
- Retain: all DB call assertions and operation-order assertion (unchanged behavior)

**2. Add one new test: custom redirect_url is forwarded correctly**

The action reads `redirect_url` from `FormData` and sanitizes it. This is a meaningful path that previously returned the sanitized URL in the result object (allowing the client to assert it). Now it must be verified via the `redirectMock` call. Add:

```typescript
it('redirects to sanitized redirect_url from formData on success', async () => {
  const formData = new FormData();
  formData.set('displayName', 'Alice');
  formData.set('redirect_url', '/dashboard');
  // expect redirectMock called with '/dashboard' (or '/users' if sanitized away)
});
```

This protects the `sanitizeRedirectUrl` path that was previously validated through the return value.

**3. Add one new test: redirect is not called on error paths**

The error-return paths must NOT call `redirect()`. This is implicit now but should be explicit:

```typescript
it('does not redirect on provisioning failure', async () => {
  provisioningService.ensureProvisioned.mockRejectedValue(...);
  // ...
  expect(redirectMock).not.toHaveBeenCalled();
});
```

This can be combined with the existing provisioning-failure test by adding the `not.toHaveBeenCalled()` assertion.

**4. Run `pnpm test` targeting the onboarding actions file**

```bash
pnpm test src/app/onboarding/actions.test.ts
```

**5. Run typecheck**

```bash
pnpm typecheck
```

The `redirectUrl` prop removal from `OnboardingForm` and the prop pass removal from `OnboardingPage` must typecheck cleanly. TypeScript will catch any mismatched prop usage.

**6. Run lint**

```bash
pnpm lint
```

The `useRouter` import removal and dead-code cleanup must be lint-clean.

### Optional additional validation

**Full test suite** (`pnpm test`) — recommended before merging, not strictly required for this isolated change. The affected test file is fully isolated; nothing else imports from `src/app/onboarding/actions.ts` in a way that tests would break.

**`pnpm arch:lint`** — not required for this change (no module boundary changes), but cheap to run.

### Validation explicitly not required

- **E2E tests**: The navigation mechanism change from `router.push` to `redirect()` is not visible at the E2E layer in a way that would add signal beyond unit tests. The correctness of `redirect()` behavior in Next.js App Router is a framework guarantee; testing it through Playwright would test the framework, not this code.
- **Integration tests**: No new cross-module integration surface introduced. The action's DB interaction is unchanged.
- **`onboarding-form.tsx` client tests**: There are no existing unit tests for the client form component, and the changes to it (removing `router.push` and `redirectUrl` prop) are structural removals — verified by typecheck and lint, not by new test coverage.
- **`onboarding/layout.test.tsx`**: Not touched by this change.

---

## 6. Risks and Tradeoffs

### Risk of under-validating

If the `redirect()` call is added to the action but the `redirectMock` assertion is not added to the test, the test will pass even if `redirect()` is called with the wrong URL. This gap is exactly why the test update is required — not optional.

### Risk of over-validating

Adding E2E or integration coverage for this change would test Next.js's redirect handling, not the repository's logic. This adds cost without increasing confidence in the code under change.

### Mock fidelity note

The `redirectMock` throws `new Error('REDIRECT:/users')` following the repository convention. This means the test must call `expect(completeOnboarding(formData)).rejects.toThrow('REDIRECT:/users')` OR the mock must be configured not to throw for the success-path test. Check how `page.test.tsx` handles this — some tests configure `redirectMock` to not throw when testing the non-redirect path, and to throw when asserting the redirect path. Follow the same pattern.

---

## 7. Validation Commands

```bash
# Target run — fastest feedback loop
pnpm test src/app/onboarding/actions.test.ts

# Full type check — catches prop removal issues
pnpm typecheck

# Lint — catches unused imports (useRouter, router.push)
pnpm lint

# Full suite — before merging
pnpm test
```

---

## 8. Recommended Next Action

**VALIDATION PLAN IS SUFFICIENT**

Proceed to Implementation Agent with this validation plan. The implementation must:

1. Update `actions.test.ts`:
   - Add `next/navigation` mock with established `redirectMock` pattern
   - Update success-path assertion from return-value check to `redirectMock` call check
   - Add redirect_url forwarding test
   - Add assertion that `redirect` is not called on error paths (extend existing error test)

2. After implementation, run `pnpm test src/app/onboarding/actions.test.ts` first for fast feedback

3. Then `pnpm typecheck` and `pnpm lint`

4. Then `pnpm test` (full suite) before declaring done

No E2E, no integration test additions, no layout or middleware test changes required.

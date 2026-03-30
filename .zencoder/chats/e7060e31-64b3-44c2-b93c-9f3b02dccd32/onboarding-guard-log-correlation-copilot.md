# Onboarding Guard Log Correlation

**Session**: `e7060e31-64b3-44c2-b93c-9f3b02dccd32`  
**Date**: `2026-03-17`  
**Scope**: correlate one current failing `/users -> /onboarding` run using the new onboarding-local instrumentation only

---

## 1. Objective

Determine, for one failing run only:

- whether the new onboarding loading UI is what the user is seeing
- which onboarding-guard events appear, in order
- whether the guard completes and the route settles, or whether failure happens after guard success
- whether the remaining blocker is still server-entry-related or has moved to route settlement / client mount
- the minimum safe next fix target

---

## 2. Inputs Used

- `.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/onboarding-hardening-implementation-report.md`
- `.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/plan.md`
- `src/app/onboarding/loading.tsx`
- `src/app/onboarding/layout.tsx`
- `logs/server.log`

---

## 3. Selected Failing Run

I selected the latest complete onboarding-guard run visible in the current server log:

- `correlationId`: `9ce83463-8d6c-48ff-8280-61cef63b6286`
- `requestId`: `8b403d09-3a7b-443d-9700-9e13160a359e`
- source lines: `logs/server.log:347-350`

The immediately preceding `/users` decision that feeds this transition is:

- `correlationId`: `450f4721-8a7a-44ca-b64b-4ce53c869055`
- `requestId`: `f2bb4f86-ae5f-4030-b923-fb7d5c2818c4`
- event: `users_guard:decision`
- decision: `redirect:/onboarding`
- source line: `logs/server.log:335`

This is sufficient as a single-run slice because it contains a full onboarding-guard entry-to-decision sequence.

---

## 4. Observed Onboarding-Guard Event Order

For the selected run, the events appear in this exact order:

1. `onboarding_guard:entry`
2. Clerk `auth:identity_claims_resolved`
3. `onboarding_guard:identity_lookup` with `status: success`
4. `onboarding_guard:decision` with `status: onboarding_required` and `decision: render:onboarding`

Exact correlated lines:

- `logs/server.log:347` → `onboarding_guard:entry`
- `logs/server.log:348` → Clerk `auth:identity_claims_resolved`
- `logs/server.log:349` → `onboarding_guard:identity_lookup` `status=success`
- `logs/server.log:350` → `onboarding_guard:decision` `status=onboarding_required` `decision=render:onboarding`

### 4.1 Missing `user_lookup start/success` events

The current implementation in `src/app/onboarding/layout.tsx` does **not** emit:

- `onboarding_guard:user_lookup start`
- `onboarding_guard:user_lookup success`

It only emits `onboarding_guard:user_lookup` on:

- `status: error`
- `status: not_found`

So for this run:

- no `user_lookup:error` appears
- no `user_lookup:not_found` appears
- `onboarding_guard:decision render:onboarding` proves the user lookup completed successfully enough to produce a valid incomplete-onboarding user row

That means user lookup succeeded implicitly, even though a dedicated success log does not exist.

---

## 5. Whether The Onboarding Loading UI Actually Appears

### 5.1 What the code guarantees

`src/app/onboarding/loading.tsx` renders a skeleton card only. It contains no `Rendering...` text.

### 5.2 What can be concluded from the selected failing run

The selected guard run completes in roughly `12ms` from `entry` to `decision`.

That means:

- the loading segment may appear briefly during navigation
- but the current server evidence does not support it being the persistent visible blocked state the user is reporting

### 5.3 Most important conclusion about the visible `Rendering...`

Because:

- the onboarding loading UI is a skeleton, not text
- the user still reports seeing `Rendering...`
- the guard reaches `decision=render:onboarding`

the visible `Rendering...` is **not explained by** `src/app/onboarding/loading.tsx`.

So the onboarding loading UI is not the primary blocked surface in this failing run.

---

## 6. Exact Last Successful Onboarding-Guard Event

For the selected failing run, the **exact last successful onboarding-guard log event** is:

`onboarding_guard:decision`

with:

- `status: onboarding_required`
- `decision: render:onboarding`
- `correlationId: 9ce83463-8d6c-48ff-8280-61cef63b6286`
- `requestId: 8b403d09-3a7b-443d-9700-9e13160a359e`

This is the terminal success branch of the server guard.

---

## 7. Exact Point Where Progress Stops

Progress stops **after**:

`onboarding_guard:decision status=onboarding_required decision=render:onboarding`

There are no later onboarding-local server events in the selected run showing:

- a redirect away from onboarding
- a guard failure
- a bootstrap fallback
- an onboarding submit action

So the remaining unobserved boundary is:

1. App Router route settlement after the guard already succeeded
2. first visible commit / hydration of the onboarding UI
3. client-side runtime state after the server decided to render onboarding

---

## 8. Blocker Classification

### 8.1 What the new instrumentation rules out

The new onboarding-local logs rule out the prior hypothesis that the current failing run stalls inside server guard entry.

For the selected run:

- guard entry happens
- identity lookup succeeds
- user lookup succeeds implicitly
- guard decision succeeds and chooses render, not redirect

### 8.2 Current best classification

The blocker has moved **past** server entry.

Best current classification:

> `route settlement after guard success`, with possible client-mount or browser/runtime involvement

This is a stronger classification than `server-entry-related`.

### 8.3 Browser/runtime/third-party warnings

The additional warnings the user mentioned:

- CSP eval
- deprecated feature
- Quirks Mode

remain **unproven as the primary blocker** for this run.

Why:

- the guard completes successfully
- the visible `Rendering...` does not come from the onboarding loading UI
- there is no onboarding-local server evidence of a guard-side failure path

So these warnings remain better classified as possible post-guard runtime noise until tied to a concrete client-side failure after `render:onboarding`.

---

## 9. Minimum Safe Next Fix Target

**Minimum safe next fix target**:

the post-guard route-commit / client-mount boundary, not `OnboardingGuard`

Safest next target:

1. add explicit client-mount observability to `src/app/onboarding/onboarding-form.tsx`
2. add a minimal route-settlement breadcrumb just after the guard-success path reaches the client tree
3. identify the DOM/source of the literal `Rendering...` text, since it is not emitted by `loading.tsx`

What should **not** be targeted first anymore:

- `OnboardingGuard` server auth lookup
- `OnboardingGuard` user lookup
- onboarding loading skeleton

Those are no longer the first failing boundary in the current run.

---

## 10. Required Return

1. **Exact last successful onboarding-guard log event in the failing run**
   - `onboarding_guard:decision`
   - `status: onboarding_required`
   - `decision: render:onboarding`
   - `logs/server.log:350`

2. **Exact point where progress stops**
   - immediately after guard success, at the boundary between server `render:onboarding` and actual route settlement / visible onboarding client tree commit

3. **Whether the blocker is still server-entry-related or has moved**
   - it has moved
   - it is no longer primarily server-entry-related
   - it is now best classified as post-guard route settlement / client mount visibility

4. **Minimum safe next fix target**
   - instrument the post-guard client boundary in `src/app/onboarding/onboarding-form.tsx` and identify the source of the visible `Rendering...`
   - do not spend the next pass on `OnboardingGuard` itself unless new evidence contradicts this run

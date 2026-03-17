# Onboarding Guard Log Correlation

**Session ID**: `e7060e31-64b3-44c2-b93c-9f3b02dccd32`  
**Date**: `2026-03-17`  
**Scope**: Investigation only. No implementation.

## 1. Objective

Determine where one current failing `/users -> /onboarding` run stops after the onboarding hardening pass:

- confirm whether the new onboarding loading UI is what the user is seeing
- correlate the onboarding guard log sequence
- determine whether the stop is still at server guard entry or has moved past the guard
- identify the minimum safe next fix target

## 2. Current-State Findings

### Selected failing run

I used the latest complete `/onboarding` guard run in `logs/server.log`:

- `correlationId`: `9ce83463-8d6c-48ff-8280-61cef63b6286`
- `requestId`: `8b403d09-3a7b-443d-9700-9e13160a359e`
- source lines: `logs/server.log:347-350`

The immediately preceding `/users` decision that fed this transition was:

- `correlationId`: `450f4721-8a7a-44ca-b64b-4ce53c869055`
- `requestId`: `f2bb4f86-ae5f-4030-b923-fb7d5c2818c4`
- event: `users_guard:decision`
- decision: `redirect:/onboarding`
- source line: `logs/server.log:335`

### Observed onboarding-guard event order

Observed for the selected run:

1. `onboarding_guard:entry`
2. `onboarding_guard:identity_lookup` with `status: "success"`
3. `onboarding_guard:decision` with `status: "onboarding_required"` and `decision: "render:onboarding"`

Not observed for the selected run:

- `onboarding_guard:user_lookup start`
- `onboarding_guard:user_lookup success`
- `onboarding_guard:user_lookup failure`

That absence is explained by the current implementation in `src/app/onboarding/layout.tsx`:

- `onboarding_guard:user_lookup` is only logged on `error` or `not_found` at `src/app/onboarding/layout.tsx:119-145`
- there is no `user_lookup start` or `user_lookup success` log in the current code

Because `onboarding_guard:decision` executed at `src/app/onboarding/layout.tsx:164-174`, the user lookup must already have completed successfully enough to produce a valid `user` object and branch into `render:onboarding`.

## 3. Architectural Assessment

### Guard completion status

The selected failing run does **not** stop at server entry.

The exact last successful onboarding-guard log event is:

```json
{
  "level": 30,
  "time": 1773783338861,
  "env": "development",
  "type": "API",
  "category": "auth",
  "module": "onboarding-guard",
  "event": "onboarding_guard:decision",
  "status": "onboarding_required",
  "correlationId": "9ce83463-8d6c-48ff-8280-61cef63b6286",
  "requestId": "8b403d09-3a7b-443d-9700-9e13160a359e",
  "internalIdentityId": "7b33c578-4455-45fc-83d1-d1645624a7d3",
  "decision": "render:onboarding",
  "msg": "OnboardingGuard: onboarding required, rendering form"
}
```

This means the guard reached its terminal success branch and returned the onboarding container render path.

### Exact stop point

Progress stops **after** `onboarding_guard:decision` and **before any confirmed client-side mount/settled evidence**.

What is missing after that event:

- no later onboarding-guard error or redirect event
- no browser runtime error from Next.js MCP (`get_errors` returned `No errors detected in 1 browser session(s)`)
- no positive evidence that the onboarding page finished mounting on the client

So the current stop boundary is:

- `server guard success` completed
- `route settlement / client mount visibility` remains unconfirmed and is the most likely remaining failure boundary

## 4. Proposed Determination

### 4.1 Whether the onboarding loading UI actually appears

There is **no positive capture** in the failing run proving that `src/app/onboarding/loading.tsx` painted.

However, the reported user-visible text `"Rendering..."` is **not** the onboarding loading UI:

- `src/app/onboarding/loading.tsx:1-25` is a skeleton-only component with no text content
- repo/build search for `Rendering...` in `src` and `.next` returned no matches

So the best-supported conclusion is:

- the visible `"Rendering..."` is not coming from the new onboarding `loading.tsx`
- it is either an outer/browser/third-party placeholder or a separate route-settlement symptom

I also checked the Next.js `loading.js` convention documentation at `/docs/app/api-reference/file-conventions/loading`, which states that `loading.tsx` should provide an instant loading state while the segment streams. That behavior is available in principle, but this failing run does not give direct evidence that the skeleton became visible.

### 4.2 Whether the blocker is still server-entry-related

No. The blocker has moved.

The current evidence rules out the original suspicion that `/onboarding` is hanging at guard entry:

- `onboarding_guard:entry` fires
- identity resolves successfully
- the guard reaches `decision: render:onboarding`

The remaining blocker is now best classified as:

- `post-guard route settlement / client mount`

not:

- `server-side onboarding guard entry`

### 4.3 Browser/runtime/third-party warnings

The extra browser warnings (CSP eval, deprecated feature, Quirks Mode) are still **unproven as the blocker**.

Why they currently look like noise rather than the primary stop point:

- the guard completes successfully in the failing run
- Next.js MCP reported no browser runtime errors in the connected session
- the visible `"Rendering..."` string is not emitted by the onboarding route code

That does **not** prove the warnings are harmless in all contexts, only that they are not the first confirmed failure boundary in this run.

## 5. Risks and Tradeoffs

- There is an observability gap in the current guard instrumentation: no `user_lookup start/success` event exists, so that sub-step can only be inferred indirectly from the later `decision` log.
- There is also no client-side onboarding mount log yet, so the exact post-guard failure point cannot be narrowed beyond `after guard success, before confirmed client settle`.
- The connected Next.js browser session metadata was available, but it did not provide a direct `/onboarding` DOM capture for the selected failing run.

## 6. Implementation Notes

No code changes were made.

Relevant files reviewed:

- `src/app/onboarding/layout.tsx`
- `src/app/onboarding/loading.tsx`
- `src/app/onboarding/page.tsx`
- `src/app/onboarding/onboarding-form.tsx`
- `logs/server.log`
- `.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/onboarding-hardening-implementation-report.md`
- `.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/plan.md`

## 7. Validation / Verification

Evidence used:

- `logs/server.log:335-350`
- `src/app/onboarding/layout.tsx:46-174`
- `src/app/onboarding/loading.tsx:1-25`
- Next.js MCP `get_errors` on port `3000`: no browser runtime errors detected
- repo/build search for `Rendering...`: no matches in `src` or `.next`
- Next.js docs: `/docs/app/api-reference/file-conventions/loading`

## 8. Recommended Next Action

Minimum safe next fix target:

- add **client-side onboarding mount / route-settlement instrumentation**, not more server-guard changes

Most targeted place to instrument next:

- `src/app/onboarding/onboarding-form.tsx`
- optionally a tiny client probe adjacent to `src/app/onboarding/page.tsx`

What that next probe should distinguish:

1. server streamed and client mounted successfully
2. server streamed but client never mounted
3. client mounted but the user is seeing an outer placeholder/noise layer instead of the onboarding UI

## Required Return

1. **Exact last successful onboarding-guard log event**
   `onboarding_guard:decision` with `status: "onboarding_required"` and `decision: "render:onboarding"` at `logs/server.log:350`

2. **Exact point where progress stops**
   Immediately after the guard success decision, before any confirmed client mount / settled-route evidence

3. **Has the blocker moved?**
   Yes. It is no longer server-entry-related. It has moved to post-guard route settlement / client mount visibility.

4. **Minimum safe next fix target**
   Add client-side mount/settlement instrumentation on the onboarding page/form boundary; do not change guard logic yet.

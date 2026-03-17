# Onboarding Guard Log Correlation (Codex)

**Session ID**: `e7060e31-64b3-44c2-b93c-9f3b02dccd32`  
**Date**: `2026-03-17`  
**Scope**: Investigation only. No implementation.

## 1. Objective

Use the newly added onboarding-local instrumentation to determine where one current failing `/users -> /onboarding` run stops.

Inputs used:

- `onboarding-hardening-implementation-report.md`
- `plan.md`
- `logs/server.log`
- `src/app/onboarding/layout.tsx`
- `src/app/onboarding/loading.tsx`
- `.next/dev/logs/next-development.log`

## 2. Current-State Findings

### Selected failing run

I used the latest complete `/onboarding` guard run present in `logs/server.log`:

- preceding `/users` redirect decision: `logs/server.log:335`
- onboarding run lines: `logs/server.log:347-350`
- `correlationId`: `9ce83463-8d6c-48ff-8280-61cef63b6286`
- `requestId`: `8b403d09-3a7b-443d-9700-9e13160a359e`

### Observed onboarding-guard events, in order

For that single run, the observed onboarding-guard sequence is:

1. `onboarding_guard:entry`
2. `onboarding_guard:identity_lookup` with `status: "success"`
3. `onboarding_guard:decision` with `status: "onboarding_required"` and `decision: "render:onboarding"`

Exact evidence:

```json
{"level":20,"time":1773783338849,"env":"development","type":"API","category":"auth","module":"onboarding-guard","event":"onboarding_guard:entry","correlationId":"9ce83463-8d6c-48ff-8280-61cef63b6286","requestId":"8b403d09-3a7b-443d-9700-9e13160a359e","msg":"OnboardingGuard: identity lookup start"}
{"level":20,"time":1773783338858,"env":"development","type":"API","category":"auth","module":"onboarding-guard","event":"onboarding_guard:identity_lookup","status":"success","correlationId":"9ce83463-8d6c-48ff-8280-61cef63b6286","requestId":"8b403d09-3a7b-443d-9700-9e13160a359e","internalIdentityId":"7b33c578-4455-45fc-83d1-d1645624a7d3","msg":"OnboardingGuard: identity resolved, starting user lookup"}
{"level":30,"time":1773783338861,"env":"development","type":"API","category":"auth","module":"onboarding-guard","event":"onboarding_guard:decision","status":"onboarding_required","correlationId":"9ce83463-8d6c-48ff-8280-61cef63b6286","requestId":"8b403d09-3a7b-443d-9700-9e13160a359e","internalIdentityId":"7b33c578-4455-45fc-83d1-d1645624a7d3","decision":"render:onboarding","msg":"OnboardingGuard: onboarding required, rendering form"}
```

### Important instrumentation gap

The user asked to inspect:

- `onboarding_guard:identity_lookup start/success/failure`
- `onboarding_guard:user_lookup start/success/failure`

But the currently shipped instrumentation does **not** emit all of those variants.

What the code currently logs in `src/app/onboarding/layout.tsx`:

- `onboarding_guard:entry` before `getCurrentIdentity()` at lines `46-53`
- `onboarding_guard:identity_lookup` only for:
  - `status: "not_provisioned"` at lines `60-70`
  - `status: "error"` at lines `72-83`
  - `status: "no_identity"` at lines `87-97`
  - `status: "success"` at lines `100-109`
- `onboarding_guard:user_lookup` only for:
  - `status: "error"` at lines `119-131`
  - `status: "not_found"` at lines `135-146`
- `onboarding_guard:decision` at lines `150-174`

There is **no** `onboarding_guard:user_lookup start` log and **no** `onboarding_guard:user_lookup success` log in the current implementation.

## 3. Architectural Assessment

### Does the guard complete?

Yes.

The selected run reaches the terminal success branch:

- `onboarding_guard:decision`
- `status: "onboarding_required"`
- `decision: "render:onboarding"`

That means:

- server entry happened
- identity lookup succeeded
- user lookup completed well enough to produce a valid `user`
- the guard returned the render path instead of redirecting

Even though there is no explicit `user_lookup success` event, the later decision event proves the guard got past user lookup.

### Exact last successful onboarding-guard log event

The exact last successful onboarding-guard event in the failing run is:

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

## 4. Proposed Determination

### 4.1 Whether the onboarding loading UI actually appears

This is **not proven** by the persisted instrumentation.

What can be stated confidently:

- `src/app/onboarding/loading.tsx` exists and is a skeleton-only fallback
- it contains no `"Rendering..."` text
- a repo/build/log search for `"Rendering..."` returned no matches in `src`, `.next`, or `logs`

So the reported user-visible `"Rendering..."` is **not** coming from `src/app/onboarding/loading.tsx`.

Because the dev server is no longer running, I could not capture live browser DOM or live Next.js MCP page metadata for the failing run. So the correct conclusion is:

- the onboarding loading UI may exist in the transition path
- but for this failing run, its actual appearance is unconfirmed
- the observed `"Rendering..."` text points to a different layer than the onboarding loading skeleton

### 4.2 Exact point where progress stops

Progress stops **after guard success**.

More precisely:

- the run does **not** stop at `onboarding_guard:entry`
- it does **not** stop in a logged identity failure path
- it does **not** stop in a logged user lookup failure path
- it reaches `onboarding_guard:decision` with `decision: "render:onboarding"`

So the stop point is:

- after server-side guard completion
- before any confirmed evidence of settled route UI / mounted onboarding client UI

### 4.3 Has the blocker moved?

Yes.

The blocker is **no longer server-entry-related**.

Based on this run, the remaining blocker has moved to:

- route settlement after guard success
- or client mount / client visibility of onboarding UI

It is no longer best classified as:

- server-side onboarding guard entry

### 4.4 Are the extra browser warnings the blocker?

Not proven.

Persisted logs did not show:

- CSP eval warning text
- Quirks Mode warning text
- deprecated feature warning text

The only persisted browser warning I could still inspect in `.next/dev/logs/next-development.log` was the Clerk development-keys warning, which is unrelated to the onboarding stop boundary.

So the safest conclusion is:

- those warnings remain noise candidates
- they are not the first confirmed failure boundary in this run
- the first confirmed post-fix boundary is still after guard success

## 5. Risks and Tradeoffs

- The current onboarding-local instrumentation is enough to rule out server-entry failure, but not enough to pinpoint the exact post-guard client boundary.
- Because `user_lookup start/success` logs do not exist, part of the path must be inferred from the later `decision` event.
- Because the dev server is currently down, there is no live browser capture for this run; conclusions about DOM paint must remain conservative.

## 6. Implementation Notes

No code changes were made.

Key files reviewed:

- `src/app/onboarding/layout.tsx`
- `src/app/onboarding/loading.tsx`
- `.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/onboarding-hardening-implementation-report.md`
- `.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/plan.md`
- `logs/server.log`
- `.next/dev/logs/next-development.log`

## 7. Validation / Verification

Validated facts:

- latest selected `/onboarding` run reaches `onboarding_guard:decision` success branch
- no `Rendering...` string exists in route code, build output, or persisted logs
- onboarding loading UI file is skeleton-only and therefore not the source of the reported text
- live Next.js MCP/browser verification was unavailable because the dev server was not running during this investigation

## 8. Recommended Next Action

Minimum safe next fix target:

- add **client-side onboarding mount / route-settlement instrumentation**

Most targeted location:

- `src/app/onboarding/onboarding-form.tsx`
- optionally a tiny client probe at the page boundary near `src/app/onboarding/page.tsx`

That next probe should answer:

1. did the server-rendered onboarding page actually hydrate and mount?
2. did the route settle but some outer placeholder remain visible?
3. is the visible `"Rendering..."` coming from browser/runtime/third-party code outside the onboarding route itself?

## Required Return

1. **Exact last successful onboarding-guard log event in the failing run**
   `onboarding_guard:decision` with `status: "onboarding_required"` and `decision: "render:onboarding"` at `logs/server.log:350`

2. **Exact point where progress stops**
   After guard success, before any confirmed settled-route or client-mounted onboarding UI evidence

3. **Whether the blocker is still server-entry-related or has moved**
   It has moved. It is no longer server-entry-related; it is now in post-guard route settlement / client mount territory.

4. **Minimum safe next fix target**
   Add client-side onboarding mount/settlement instrumentation. Do not change guard logic yet.

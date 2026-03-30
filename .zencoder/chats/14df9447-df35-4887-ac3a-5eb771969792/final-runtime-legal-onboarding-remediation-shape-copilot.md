# Final Runtime-Legal Onboarding Remediation Shape

**Agent**: GitHub Copilot  
**Session**: `14df9447-df35-4887-ac3a-5eb771969792`  
**Date**: `2026-03-18`  
**Decision**: **APPROVED WITH ONE REQUIRED ARCHITECTURAL CORRECTION**

---

## 1. Objective

Decide the final, runtime-legal remediation shape for the `/users -> /onboarding` fix under real Next.js 16 and Clerk constraints, given the now-confirmed rule that cookie mutation is **not allowed during Server Component / page render**.

This review answers:

1. whether the cookie-bridge concept still makes sense
2. where the onboarding-pending signal can be written legally
3. whether a better design exists in this codebase right now
4. the exact target files
5. the forbidden patterns
6. the minimum safe implementation path

---

## 2. Current-State Findings

### 2.1 Root-cause context remains unchanged

The previously verified route-boundary diagnosis still stands:

- server-side `/users -> /onboarding` selection succeeds
- `OnboardingGuard` reaches `decision: render:onboarding`
- the client shell commits `/users` but never commits `/onboarding`
- the failure boundary is still the client route-commit boundary above the onboarding subtree

So the intent of the cookie-bridge remains valid: **avoid relying on the fragile `/users` server-layout redirect during the SSO/bootstrap handoff window by redirecting earlier in the request pipeline**.

### 2.2 `src/security/middleware/with-auth.ts` is already in the correct architectural location

The current edge-mode onboarding decision is already reading:

```ts
req.cookies.get('__onboarding_pending')?.value !== '1';
```

and already runs `redirectForIncompleteOnboarding(...)` in the shared auth middleware flow.

That is the correct place for the read.

Why:

- it already owns route classification and auth gating
- it already has `RouteContext`
- it avoids duplicating raw path logic in `src/proxy.ts`
- it keeps the signal in the security pipeline instead of leaking it into UI/layout code

### 2.3 `src/app/onboarding/actions.ts` is already using a legal mutation boundary

The current onboarding completion path deletes the cookie inside a `'use server'` action:

```ts
const cookieStore = await cookies();
cookieStore.delete('__onboarding_pending');
```

This is runtime-legal in Next.js 16. The cookies documentation explicitly allows `.set` / `.delete` in Server Functions / Server Actions and Route Handlers, and explicitly forbids mutation during Server Component render.

So the completion-side cleanup remains correct.

### 2.4 `src/app/auth/bootstrap/page.tsx` is currently invalid

The current bootstrap page still does:

```ts
const cookieStore = await cookies();
cookieStore.set('__onboarding_pending', '1', ...);
redirect(`/onboarding?redirect_url=${encodeURIComponent(safeTarget)}`);
```

inside the page render branch.

That is the exact pattern Next.js 16 forbids.

Per the official Next.js cookies documentation:

- reading cookies is supported in Server Components
- **setting cookies is not supported during Server Component rendering**
- `.set` / `.delete` must run in a **Server Function** or **Route Handler**
- HTTP does not allow setting cookies after streaming starts, which is why mutation is constrained to those response-producing boundaries

This means the current bootstrap write location is not salvageable.

### 2.5 A route handler cannot replace the page at the same segment without a broader refactor

Next.js route-handler docs are explicit:

- there cannot be a `route.ts` at the same segment level as an existing `page.tsx`

So while a pure `/auth/bootstrap/route.ts` would be a legal cookie-writing boundary, it is **not compatible with the current route shape** unless the existing `src/app/auth/bootstrap/page.tsx` is removed or fundamentally restructured.

That matters because the bootstrap route currently also renders failure UI:

- `BootstrapErrorUI`
- `BootstrapOrgRequired`

Converting the whole route into a handler would therefore be a larger architectural change than necessary.

---

## 3. Architectural Assessment

### 3.1 Does the cookie-bridge concept still make sense?

**Yes.**

The concept remains sound because the cookie is still only a **routing hint**, not an authorization source.

That distinction is critical.

The cookie does **not** decide whether a user is actually allowed into the app. Real truth still lives server-side in the provisioned user record and onboarding state.

The actual safety rails remain:

- `src/app/users/layout.tsx` via DB-backed access resolution
- `src/app/onboarding/layout.tsx` via DB-backed onboarding guard

So:

- if a user removes the cookie, server guards still enforce onboarding
- if a user forges the cookie, they may be routed to `/onboarding`, but `OnboardingGuard` still validates the real state

That is an acceptable use of a transient cookie.

### 3.2 Is there a better design than the cookie bridge right now?

**Not as the minimum safe remediation in this repository.**

The only materially cleaner long-term alternative is to drive onboarding from a provider-side session claim that middleware can trust directly, similar to Clerk’s public-metadata/session-claims onboarding pattern.

I do **not** recommend switching to that for this fix.

Reasons:

1. this codebase is already DB-backed and provisioning-aware; the app’s authoritative onboarding state is not owned solely by Clerk
2. rolling the decision into Clerk claims requires dashboard/token configuration outside the repo
3. session-claim freshness during the exact bootstrap/auth handoff is another moving part, not a simplification
4. it is a larger cross-boundary change than needed to fix the current failure mode

So the better answer is:

- **short term / minimum safe**: keep the cookie bridge, fix the write boundary
- **long term / optional redesign**: consider provider claim enforcement only if the architecture intentionally moves onboarding truth toward provider-session state

### 3.3 Should the cookie be written in UI/layout code instead?

**No. Explicitly reject this.**

Rejected locations:

- `src/app/users/layout.tsx`
- `src/app/onboarding/layout.tsx`
- `src/app/layout.tsx`
- any Server Component page/layout render branch

Reasons:

1. Next.js 16 forbids cookie mutation there
2. these layers should not own proxy-routing hint state
3. coupling the signal to page/layout rendering would recreate the same category of fragility we are trying to bypass

---

## 4. Final Recommendation

### 4.1 Final approved shape

Keep the cookie-bridge design, but move the **write** into a **dedicated nested route handler** under the bootstrap route.

**Recommended flow:**

1. `src/app/auth/bootstrap/page.tsx`
   - continues to do identity resolution, provisioning, DB lookup, and error rendering
   - when onboarding is incomplete, it does **not** set a cookie
   - instead it redirects to an internal handoff route

2. `src/app/auth/bootstrap/handoff/route.ts`
   - becomes the legal response-producing boundary for the pending-onboarding signal
   - sets `__onboarding_pending=1` on the response
   - redirects to `/onboarding?redirect_url=...`

3. `src/security/middleware/with-auth.ts`
   - keeps reading `__onboarding_pending` in edge mode
   - keeps enforcing the redirect through the existing `redirectForIncompleteOnboarding(...)`

4. `src/app/onboarding/actions.ts`
   - keeps deleting `__onboarding_pending` after successful onboarding completion

5. `src/app/users/layout.tsx`
   - stays unchanged as the DB-backed safety net

### 4.2 Why the nested handoff route is the right answer

It is the smallest change that satisfies all of these constraints at once:

- legal cookie mutation boundary under Next.js 16
- no auth/business logic moved into the client
- no duplicate path matching in `src/proxy.ts`
- no need to dismantle the existing bootstrap error UI route
- no forced redesign of the provisioning flow

It also respects the official route-handler rule that a `route.ts` cannot coexist at the same route segment as the existing page.

### 4.3 Why I am not recommending a full `/auth/bootstrap` route-handler conversion

That option is valid in isolation, but not as the minimum safe remediation.

It would force one of these broader changes:

- remove the page route entirely and replace all error rendering with redirects or serialized responses
- move bootstrap failure UI to a different segment and rewire the current flow around it

That is broader than this fix requires.

---

## 5. Exact Target Files

### Required changes

| File                                           | Decision   | Purpose                                                                                                                |
| ---------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/app/auth/bootstrap/page.tsx`              | **CHANGE** | Remove illegal cookie mutation; redirect incomplete users to internal handoff route instead of writing cookie directly |
| `src/app/auth/bootstrap/handoff/route.ts`      | **ADD**    | Legal cookie-write boundary; set `__onboarding_pending` and redirect to `/onboarding`                                  |
| `src/app/auth/bootstrap/page.test.tsx`         | **CHANGE** | Stop asserting cookie write in page render; assert redirect to handoff route                                           |
| `src/app/auth/bootstrap/handoff/route.test.ts` | **ADD**    | Verify `Set-Cookie` + redirect response behavior                                                                       |

### Keep as-is conceptually

| File                                   | Decision | Reason                                            |
| -------------------------------------- | -------- | ------------------------------------------------- |
| `src/security/middleware/with-auth.ts` | **KEEP** | Read location is already correct                  |
| `src/app/onboarding/actions.ts`        | **KEEP** | Delete location is already legal and correct      |
| `src/app/users/layout.tsx`             | **KEEP** | DB-backed safety net; should not own cookie logic |
| `src/proxy.ts`                         | **KEEP** | No raw cookie/path branching should be added here |

### Optional hardening only if stale-cookie loops prove real

| File                            | Decision           | Purpose                                                                                                                                                        |
| ------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/onboarding/layout.tsx` | **OPTIONAL LATER** | If stale cookies become a real issue, redirect already-complete users through a cleanup route handler that clears the cookie before returning them to `/users` |

This is **not** part of the minimum safe change unless that stale-cookie scenario is actually observed.

---

## 6. Implementation Notes

### 6.1 Bootstrap page change

Replace this invalid shape:

```ts
const cookieStore = await cookies();
cookieStore.set('__onboarding_pending', '1', ...);
redirect(`/onboarding?redirect_url=${encodeURIComponent(safeTarget)}`);
```

with:

```ts
redirect(
  `/auth/bootstrap/handoff?redirect_url=${encodeURIComponent(safeTarget)}`,
);
```

The page should remain responsible for:

- provisioning
- user lookup
- bootstrap logging
- deciding whether onboarding is still incomplete
- rendering error UI when provisioning or lookup fails

The page should **not** be responsible for emitting `Set-Cookie` headers.

### 6.2 Handoff route-handler responsibilities

The new `src/app/auth/bootstrap/handoff/route.ts` should:

1. accept the sanitized target via `redirect_url`
2. re-sanitize the value server-side before using it
3. optionally re-check that an authenticated identity exists before issuing the cookie
4. create a redirect response using `NextResponse.redirect(...)`
5. set the `__onboarding_pending` cookie on that response
6. return the response

Recommended cookie semantics remain:

- name: `__onboarding_pending`
- value: `'1'`
- `httpOnly: true`
- `sameSite: 'lax'`
- `secure: env.NODE_ENV === 'production'`
- `path: '/'`
- bounded `maxAge`

This is aligned with the Next.js `NextResponse.cookies.set(...)` API and route-handler semantics.

### 6.3 Do not duplicate provisioning in the handoff route

This is important.

The handoff route exists only to:

- emit the cookie legally
- redirect to onboarding

It should **not** call:

- `ensureProvisioned(...)`
- user-repository updates
- onboarding-completion logic

Provisioning must remain in `src/app/auth/bootstrap/page.tsx`.

### 6.4 Why the extra redirect is acceptable

Yes, this introduces one extra redirect hop:

`/auth/bootstrap` -> `/auth/bootstrap/handoff` -> `/onboarding`

That is acceptable for this fix because:

- it keeps the change runtime-legal
- it preserves the existing bootstrap page responsibilities
- it avoids a broader route refactor
- it still moves the critical routing hint into the request pipeline before future `/users` requests are evaluated by edge auth middleware

If this additional hop later proves materially harmful, then the next step would be a dedicated refactor of the bootstrap route itself, not another shortcut.

---

## 7. Forbidden Patterns

The following patterns should be treated as explicitly forbidden for this remediation:

1. **No cookie mutation in Server Component render paths**

   Forbidden examples:
   - `src/app/auth/bootstrap/page.tsx`
   - `src/app/users/layout.tsx`
   - `src/app/onboarding/layout.tsx`
   - `src/app/layout.tsx`

2. **No raw onboarding-cookie handling in `src/proxy.ts` before the security pipeline**

   Do not add bespoke path checks or ad hoc `pathname === '/users'` branches there.

3. **Do not make the cookie an authorization source**

   The cookie is only a routing hint. DB-backed guards remain authoritative.

4. **Do not move the onboarding redirect into client-side router code as the primary fix**

   That would move enforcement into the wrong layer and reintroduce client timing sensitivity.

5. **Do not add a `route.ts` beside `src/app/auth/bootstrap/page.tsx` at the same segment**

   Next.js route resolution explicitly forbids that coexistence.

6. **Do not trust `redirect_url` without re-sanitizing in the handoff route**

   The nested route is directly addressable and must treat query input as untrusted.

7. **Do not duplicate provisioning logic inside the handoff route**

   The route handler is for cookie emission and redirect only.

---

## 8. Risks And Tradeoffs

### 8.1 Tradeoff: one additional redirect

This is the main cost of the minimum-safe fix.

I accept that tradeoff because it buys:

- legal cookie mutation
- lower blast radius
- preserved bootstrap UI/error handling

### 8.2 Residual risk: stale cookie if onboarding state changes out-of-band

The current happy path clears the cookie in `completeOnboarding`, which is good.

Residual edge case:

- onboarding becomes complete outside the normal action path
- cookie remains `1`
- edge middleware keeps redirecting `/users` to `/onboarding`

That can become a loop if the app later redirects completed users back to `/users` while the stale cookie is still present.

For this repository today, I would classify that as a **known residual risk**, not a blocker, because the normal state transition already clears the cookie in the same server action.

If the app later adds other onboarding-completion paths, add a dedicated cleanup route handler and route already-complete onboarding exits through it.

### 8.3 Important scope boundary

This remediation is designed to **bypass** the fragile `/users -> /onboarding` route-settlement boundary during bootstrap, not to prove that the shared layout/provider boundary is fully healthy.

So:

- if the hang disappears after this change, the remediation is sufficient
- if the hang still reproduces, the next target remains `src/app/layout.tsx` and the shared provider boundary

Do not combine those two changes in the same patch unless the cookie-handoff fix fails first.

---

## 9. Validation / Verification

Minimum validation set:

1. **Unit tests**
   - `src/app/auth/bootstrap/page.test.tsx`
     - incomplete onboarding redirects to `/auth/bootstrap/handoff?...`
     - page no longer asserts `cookies().set(...)`
   - `src/app/auth/bootstrap/handoff/route.test.ts`
     - sets `__onboarding_pending`
     - redirects to `/onboarding?redirect_url=...`
     - sanitizes hostile `redirect_url` input

2. **Existing middleware tests**
   - confirm edge-mode cookie redirect tests continue to pass in `src/security/middleware/with-auth.test.ts`

3. **Onboarding action tests**
   - retain cookie delete assertion in `src/app/onboarding/actions.test.ts`

4. **Focused end-to-end verification**
   - repeat the failing SSO/bootstrap transition
   - confirm the browser reaches `/onboarding`
   - confirm edge middleware intercepts `/users` while cookie is present
   - confirm cookie is removed after successful onboarding submission

---

## 10. Recommended Next Action

Implement the minimum-safe runtime-legal version of the cookie bridge with this exact scope:

1. remove the illegal cookie write from `src/app/auth/bootstrap/page.tsx`
2. add `src/app/auth/bootstrap/handoff/route.ts`
3. keep `src/security/middleware/with-auth.ts` as the edge read point
4. keep `src/app/onboarding/actions.ts` as the delete point
5. update the bootstrap tests and add route-handler tests

That is the correct final remediation shape under real Next.js 16 constraints.

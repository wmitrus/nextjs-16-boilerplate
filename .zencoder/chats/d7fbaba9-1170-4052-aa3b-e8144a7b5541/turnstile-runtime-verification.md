# Turnstile Runtime Verification

## 1. Objective

Verify the exact remaining Clerk sign-up failure boundary after the redirect normalization fix, with special focus on whether the current blocker is now the Turnstile challenge runtime rather than any repository-owned auth or redirect path.

Inputs used:

- `.zencoder/chats/d7fbaba9-1170-4052-aa3b-e8144a7b5541/remaining-browser-errors-classification.md`
- `.zencoder/chats/d7fbaba9-1170-4052-aa3b-e8144a7b5541/remaining-browser-errors-classification-copilot.md`
- current repository auth, Clerk, CSP, logging, and Sentry code
- a fresh local Next.js dev-server session started during this verification
- Next.js MCP runtime diagnostics

Constraint:

- investigation only
- no repository implementation changes

## 2. Verified Evidence

### 2.1 Verified development-side blocker signal

The strongest post-fix development evidence remains the preserved browser runtime log captured in the copilot note:

- `Turnstile Widget seem to have hung: nfcib`
- `[Cloudflare Turnstile] Error: 300030.`

Evidence:

- `.zencoder/chats/d7fbaba9-1170-4052-aa3b-e8144a7b5541/remaining-browser-errors-classification-copilot.md:21-30`
- `.zencoder/chats/d7fbaba9-1170-4052-aa3b-e8144a7b5541/remaining-browser-errors-classification-copilot.md:120-137`

What that proves:

- in development, under the post-fix codebase, the active failure signal is no longer Clerk `Invalid URL`
- the live repeated failure is now a Turnstile widget hang plus Cloudflare `300030`
- the current runtime blocker occurs at the challenge step, before any repository-owned post-auth redirect/provisioning path is shown to be failing

### 2.2 Repository code still does not own Turnstile execution

Dedicated sign-up page:

- `src/app/sign-up/[[...sign-up]]/sign-up-client.tsx:8-21`
- this mounts Clerk directly as `<SignUp path="/sign-up" />`

Modal sign-up entry:

- `src/modules/auth/ui/HeaderAuthControls.tsx:47-71`
- this uses Clerk's `<SignUpButton mode="modal" />`

Provider-level shared Clerk wiring:

- `src/app/layout.tsx:73-85`

Cloudflare-specific repository behavior:

- `src/security/middleware/with-headers.ts:62-116`
- the repository allowlists `https://challenges.cloudflare.com` in `script-src`, `connect-src`, and `frame-src`

What that proves:

- both dedicated and modal flows terminate in Clerk-owned sign-up surfaces
- the repository does not instantiate or validate a first-party Turnstile widget
- the repository's meaningful control is limited to hosting Clerk, passing redirect props, and not blocking Cloudflare origins

### 2.3 Fresh dev-server diagnostics do not point to a new app-owned blocker

During this verification, a fresh `pnpm dev` session was started successfully and Next.js MCP discovered the server on port `3000`.

Runtime check:

- `nextjs_call(get_errors)` returned no active Next.js/browser runtime errors attributable to the application itself during the fresh dev session

What that proves:

- there is no new verified Next.js build/runtime failure replacing the old Clerk redirect issue
- the strongest known failure remains the previously captured Turnstile/Cloudflare error class

## 3. Verification Limits

### 3.1 Clean-browser automation could not be completed on this host

I attempted a fresh browser-context verification in this session. It was blocked by host-level browser dependency issues, not by repository code:

- Playwright Chromium launch failed because `libnspr4.so` is missing
- Playwright Firefox launch failed because the host is missing `libasound2t64`
- `pnpm exec playwright install-deps` could not complete because this host requires an interactive `sudo` password

What that means:

- I could not complete a true clean-profile browser pass in this environment
- I could not collect a fresh iframe source URL, Ray ID, or real-time console trace from a new local browser session
- I could not perform an authoritative dev-versus-production browser comparison on this host

### 3.2 Consequence for evidence quality

Because of that host limitation, the verification below is strongest on:

- failure ownership boundary
- development-side runtime classification
- repository control analysis

It is weaker on:

- dedicated-page versus modal runtime comparison
- production reproduction
- clean-profile/browser-environment isolation

## 4. Requested Focus Areas

## 4.1 Does sign-up stall specifically because Turnstile never completes?

### Verified answer

In development, the preserved runtime evidence says yes at the challenge boundary:

- the repeated runtime failure is a Turnstile widget hang
- the corresponding Cloudflare code is `300030`
- no post-fix evidence in this pass points to a repository redirect or server-owned auth error replacing it

Most precise statement:

- the currently verified stall boundary is the Turnstile challenge step itself, not the earlier Clerk redirect path

### Important precision

I could not freshly submit the sign-up form in a clean local browser during this session because the host could not launch browsers. So the strictest possible claim is:

- the verified development-side blocker signal is the Turnstile widget failing to reach a healthy completed state
- that is the strongest known explanation for sign-up stalling

## 4.2 Dedicated `/sign-up` page versus modal `SignUpButton` flow

### Runtime verification status

Not fully verified in a fresh browser session on this host.

### What is still verified

The repository no longer has a meaningful app-owned divergence between the two entry points that would explain the blocker:

- the dedicated page mounts Clerk `SignUp`
- the modal flow uses Clerk `SignUpButton mode="modal"`
- both share the same `ClerkProvider` wrapper and normalized redirect configuration
- both ultimately depend on Clerk's embedded challenge runtime

### Conclusion

No repository-owned modal-versus-page defect is currently evidenced.

Current best assessment:

- both surfaces likely converge on the same third-party Turnstile boundary
- a surface-specific repository mitigation is not currently justified

## 4.3 Clean browser context: fresh profile, no extensions, default locale

### Runtime verification status

Not completed on this host.

Reason:

- browser launch was blocked by missing host libraries and unavailable interactive privilege escalation

### What follows from that

I cannot verify from this host whether the current blocker is:

- profile/extension-specific
- locale-specific
- privacy-tooling-specific

That remains the highest-value manual follow-up check outside this environment.

## 4.4 Development versus production

### Development

Verified from preserved runtime evidence:

- Turnstile hang + `300030` reproduces in development
- widget identifier observed: `nfcib`

Evidence:

- `.zencoder/chats/d7fbaba9-1170-4052-aa3b-e8144a7b5541/remaining-browser-errors-classification-copilot.md:25-30`

### Production

Not verified in a real browser on this host.

### What is still architecturally relevant

There is no newly identified repository-owned code path that would obviously make Turnstile fail only on one auth surface. From the repository side:

- Cloudflare allowlisting is present in the current CSP
- Clerk is still the owner of the sign-up UI
- Turnstile execution still sits outside repository control

So:

- development failure is verified
- production failure is unverified here
- "both" cannot be claimed from this session alone

## 4.5 Exact challenge/runtime context captured

### Verified

- widget identifier: `nfcib`
- repeated error class: `300030`
- challenge symptom: `Turnstile Widget seem to have hung`

### Not captured in this session

- Ray ID
- iframe source URL from a fresh browser pass
- per-attempt challenge token metadata

### Best current context statement

The verified failing runtime context is:

- Clerk-rendered sign-up surface
- external Turnstile widget instance `nfcib`
- repeated Cloudflare challenge failure code `300030`

That is enough to place the failure at the Clerk/Cloudflare challenge boundary, but not enough to distinguish the exact internal failing line between Clerk wrapper logic and Cloudflare iframe internals.

## 5. Exact Verified Failure Boundary

The exact failure boundary verified from current evidence is:

**After Clerk sign-up UI is mounted, the external Turnstile challenge widget reaches a hung state and emits Cloudflare `300030`, with no new evidence that repository-owned redirect, bootstrap, or provisioning code is the active blocker.**

More precise ownership language:

- verified app boundary: repository code successfully reaches Clerk sign-up surfaces
- verified failing boundary: Clerk/Cloudflare challenge runtime
- not verified as failing: repository redirect normalization, post-auth routing, server provisioning path

## 6. Is The Blocker Definitely Turnstile-Owned?

### Best verified answer

It is definitely outside the repository-owned auth/redirect path.

Most accurate phrasing:

- the blocker is definitively Turnstile-boundary-owned from the repository's perspective
- it is not yet possible from this session alone to say whether the immediate failing instruction is in Cloudflare iframe code or in Clerk's wrapper around that challenge
- both of those candidate locations are third-party/runtime-owned, not repository-owned

So the strongest safe conclusion is:

- **yes, the blocker is effectively third-party Turnstile-boundary-owned**
- **no, the repository is not currently the primary owner of the failing logic**

## 7. Does Any Repository-Owned Mitigation Still Look Justified?

### Direct fix

No repository-owned direct fix is currently justified.

Why:

- the strongest verified failure is outside repository-controlled logic
- there is no current evidence that changing redirect logic, CSP structure, or server auth flow would resolve a hung Turnstile widget
- dedicated and modal surfaces both route into Clerk-owned sign-up UI

### Narrow mitigations that may still be justified later

Only after a clean real-browser reproduction confirms the same boundary:

- better challenge-failure observability
- clearer user-facing fallback messaging when the challenge never resolves
- support/operational escalation artifacts

Those are mitigations around the boundary, not a fix for the boundary itself.

## 8. Minimum Safe Next Step

The minimum safe next step is a manual clean-browser verification outside this host, not a repository change.

That verification should do exactly this:

1. Open the current app in a normal supported browser profile with no extensions.
2. Test both:
   - dedicated `/sign-up`
   - modal `SignUpButton`
3. Repeat in:
   - local development
   - deployed production or a production-like environment
4. Capture:
   - `Turnstile Widget seem to have hung`
   - `300030`
   - widget ID
   - iframe URL
   - any Ray ID or support identifier exposed by Cloudflare/Clerk
5. If reproduced in a clean real browser, escalate to Clerk/Cloudflare with the captured challenge metadata.

## 9. Should Implementation Proceed Or Is Escalation More Appropriate?

Escalation is more appropriate than implementation at this point.

Reason:

- the verified failing boundary is third-party/runtime-owned
- the remaining unverified items are environmental and operational, not architectural code design questions
- implementing another repository change first would have low confidence and high risk of chasing the wrong layer

Recommended decision:

- do not implement yet
- run the clean real-browser confirmation outside this host
- escalate to Clerk/Cloudflare if the same Turnstile hang + `300030` reproduces there

## 10. Direct Answers Requested

### 1. Exact verified failure boundary

- after Clerk sign-up UI mounts, the Turnstile widget reaches a hung state and emits `300030`
- the currently verified failure boundary is the Clerk/Cloudflare challenge runtime, not repository redirect/provisioning code

### 2. Whether the blocker is definitely Turnstile-owned

- definitely Turnstile-boundary-owned from the repository's perspective
- not precise enough yet to separate Cloudflare iframe internals from Clerk's wrapper, but both are third-party-owned

### 3. Whether any repository-owned mitigation remains justified

- no direct repository fix is currently justified
- only later mitigations around observability or fallback UX may be justified

### 4. Minimum safe next step

- manual clean-browser verification in dev and production, capturing widget ID, iframe URL, and any Ray/support IDs

### 5. Whether implementation should proceed or escalation is more appropriate

- escalation is more appropriate once the clean real-browser check reproduces the same Turnstile failure

## 11. Sources

- Cloudflare Turnstile client-side errors:
  - https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/
- Cloudflare Turnstile error codes:
  - https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/
- Cloudflare challenge solve issues:
  - https://developers.cloudflare.com/turnstile/troubleshooting/challenge-solve-issues/
- Cloudflare supported browser/runtime caveats:
  - https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/

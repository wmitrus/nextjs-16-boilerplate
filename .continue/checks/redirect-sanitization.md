---
name: Redirect Sanitization
description: Review auth and onboarding redirect changes for unsanitized redirect_url forwarding
---

If the PR does not change any redirect construction, redirect parameter forwarding, or request/form reads of `redirect_url`-style inputs, no action is needed.

Focus on changed lines in areas such as:

- `src/security/middleware/with-auth.ts`
- `src/app/auth/**`
- `src/app/onboarding/**`
- auth-related route handlers or server actions
- components or helpers that read `redirect_url` from `searchParams`, `nextUrl`, `FormData`, or auth-provider callback inputs

Do not review unrelated redirects with fixed literal destinations only.

This repository has a specific rule for forwarded redirect params: they must be sanitized at the point they are read from request-controlled input.

Review the changed files against these sources before deciding pass or fail:

- `docs/ai/general/SECURITY_CODING_PATTERNS.md` (especially `SEC-03`)
- `.continue/rules/security-coding-patterns.md`
- `src/shared/lib/routing/safe-redirect.ts`
- `src/security/middleware/with-auth.ts`
- `src/app/auth/bootstrap/start/route.ts`

Look for these issues and fail only if they are introduced by the changed lines:

## 1. Unsanitized Request-Controlled Redirect Input

- a changed line reads `redirect_url` or a similar post-auth redirect parameter from `req.nextUrl.searchParams`, `request.nextUrl.searchParams`, `searchParams`, `FormData`, cookies, headers, or provider callback input and forwards it without `sanitizeRedirectUrl()`
- a changed line builds a redirect target from request-controlled input and uses it directly in `redirect(...)`, `NextResponse.redirect(...)`, or query-param forwarding without sanitization first

## 2. Broken Sanitization Placement

- the change sanitizes too late, after the unsafe value has already been forwarded deeper into the redirect chain
- the change relies on downstream code to sanitize a request-controlled redirect param instead of sanitizing it at the read site
- the change replaces an existing sanitized variable with the raw request value

## 3. Misleading Safe-Looking Chains

- a changed line forwards a raw `redirect_url` into a safe literal route like `/auth/bootstrap` or `/sign-in` and assumes that is sufficient
- a changed line renames or wraps the raw request value in another variable but still bypasses `sanitizeRedirectUrl()`

Accept as safe when the changed code clearly does one of these before forwarding or redirecting:

- calls `sanitizeRedirectUrl(rawRedirectUrl, fallback)` directly at the request/form read site
- forwards a value that is already clearly derived from `sanitizeRedirectUrl(...)` in the same flow
- uses only a fixed literal redirect target with no request-controlled redirect input involved

When reviewing, identify which changed line is the trust-boundary read site for the redirect input.

Passing result expectations:

- every new or modified request-controlled redirect input is sanitized at the point it is read
- changed redirect chains preserve the local `SEC-03` pattern instead of pushing trust downstream
- the review distinguishes raw request values from already-sanitized values

Do not fail only because a file contains `redirect_url`. Fail when the changed code itself introduces or preserves an unsanitized request-controlled redirect flow.

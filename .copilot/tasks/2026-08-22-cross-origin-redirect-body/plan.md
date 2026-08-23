# Task Plan — Cross-Origin Redirect Body Forwarding (SEC-40)

## Status

**✅ REMEDIATION IMPLEMENTED.** Tenth case in the series; same branch as
Cases 1–9.

## Leantime (mandatory protocol)

**BLOCKED — same session/environment limitation as Cases 1–9.**

## Finding, Confirmed In Code

`prepareNextHop` stripped credential headers cross-origin and then followed
the hop. `requestInitForRedirect` returns the init unchanged for 307/308 —
correct HTTP semantics — so method and body were preserved and handed to the
new origin.

The report's framing is right and worth keeping: the header was the smaller
half. The deeper issue is the implied trust model. The hop was permitted
because both hosts were on the global `SECURITY_ALLOWED_OUTBOUND_HOSTS`
allowlist, but that list means _this application may call these services_ —
not _any of these services may redirect a request, with its body, to any
other_. A flat allowlist was doing duty as a mesh of mutual trust.

## The Fix

Redirects are same-origin by default; crossing an origin requires
`allowedRedirectOrigins` on the call.

Two properties that took deliberate choosing:

- **The grant covers the hop, not the credentials.** Naming an origin does
  not re-attach `Authorization` — stripping still applies to every
  cross-origin hop. Collapsing the two would turn a routing permission into
  a credential grant, which is a much larger thing to hand out by accident.
- **The option is stripped before `fetch` sees it.** `SecureFetchInit`
  extends `RequestInit` so callers pass one object (matching the shape the
  report sketched), but `splitSecureFetchInit` removes our keys so no
  non-standard property reaches the wire or the redirect replay.

Origin matching normalises through `URL`, so a trailing slash, an explicit
default port or a case difference cannot make an intended grant silently
fail to match.

## An Ordering Consequence

A protocol downgrade is also an origin change — an origin is scheme + host +
port. So `https://x → 307 → http://x` is now caught by this gate _before_
SEC-39's HTTPS check, and the SEC-39 redirect test had to stop asserting its
specific message.

Rather than weaken that test, the composition is proven directly: explicitly
allowing `http://x` as a redirect origin **still** fails the HTTPS gate.
Permission to reach a host is never permission to reach it in cleartext.

## Tests Updated, And Why That Matters

Three existing tests followed cross-origin redirects as a matter of course
and now need the grant to reach what they were testing — including the
network-level pinning test, whose assertions would otherwise never run.
Each was given the grant with a comment saying why, rather than being
relaxed.

One of my own new assertions was wrong on the first pass: I asserted the
secret string appeared nowhere in the recorded calls, but it legitimately
appears in the **first** hop — the one the caller addressed. The meaningful
assertion is that no second hop exists. Corrected.

## Validation

- Cross-origin redirect between two allowlisted hosts refused by default.
- A 307 with a body refused cross-origin, with the body proven to have
  reached only the addressed origin.
- With the grant: 307 body and method survive.
- Credentials still stripped on a granted cross-origin hop.
- Origin matching tolerates trailing slash/path; a different host is refused.
- The option never appears in the init handed to `fetch`.

## Quality Gates

| Gate            | Command                 | Result                                |
| --------------- | ----------------------- | ------------------------------------- |
| Typecheck       | `pnpm typecheck`        | ✅ pass                               |
| Lint (with fix) | `pnpm lint --fix`       | ✅ 0 errors, 12 pre-existing warnings |
| Unit tests      | `pnpm test`             | ✅ 229 files / 1716 tests             |
| DB integration  | `pnpm test:db`          | ✅ 167 tests                          |
| Circular deps   | `pnpm skott:check:only` | ✅ none                               |
| Unused deps     | `pnpm depcheck`         | ✅ none                               |

## Residual Risk / Follow-Ups

- **This is a breaking change for any caller relying on cross-origin
  redirects.** Only the SSRF showcase route calls `secureFetch` today, and it
  does not, so nothing in-repo breaks — but a consumer of this boilerplate
  upgrading would need the grant. Recorded here rather than softened, since
  the safe default is the point.

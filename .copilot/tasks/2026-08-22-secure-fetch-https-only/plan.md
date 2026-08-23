# Task Plan — secureFetch HTTPS-Only (SEC-39)

## Status

**✅ REMEDIATION IMPLEMENTED.** Ninth case in the multi-case security-audit
remediation series; same branch as Cases 1–8.

## Leantime (mandatory protocol)

**BLOCKED — same session/environment limitation as Cases 1–8.**

## Finding, Confirmed In Code

`secure-fetch.ts` contains no reference to `url.protocol` anywhere. The
report is accurate, and the framing is worth keeping: every existing control
in that file (allowlist, DNS pinning, address classification, per-hop
redirect revalidation, header stripping) answers _who am I talking to_. None
answers _can anyone else read it_.

Two exposures followed: a direct `http://` call to an allowlisted host, and
— the sharper one — `https://trusted → 307 → http://trusted`, where the
caller asked for HTTPS, the allowlist was satisfied at both hops, and the
request still went out in clear.

## The Fix

`assertHttpsProtocol()` called from `resolveAndValidateHost()`. Three
placement decisions carry the weight:

- **`resolveAndValidateHost` already runs for every hop**, so putting the
  check there closes the redirect downgrade for free. A check at the entry
  point alone would have fixed the direct case and left the more interesting
  one open.
- **Checked first**, before the allowlist and before any DNS work — it is
  the one rule that holds regardless of who the host is.
- **The dev escape hatch is inert in production.**
  `SECURITY_OUTBOUND_ALLOW_INSECURE_HTTP` is ignored when
  `NODE_ENV === 'production'` and the block is logged with
  `insecureFlagSetButIgnored: true`. A flag production _honours_ is exactly
  the accident the requirement exists to prevent; making the wrong value
  harmless is stronger than discouraging it.

## A Trap Worth Recording

21 existing test URLs across two files used `http://` as a convenience while
actually testing private/reserved address classification. With the protocol
gate checked first they **still failed, so the suite stayed green** — but
they now failed for the wrong reason and no longer exercised what they were
named for. One (`outbound.test.ts`) surfaced this by asserting on the error
message; the other 17 would have drifted silently.

All were rewritten to `https://`, with a comment in the integration test
explaining why the scheme is deliberate. **A green suite after adding an
early-exit check is not evidence the older assertions still mean anything** —
that generalises beyond this case and is recorded in SEC-39.

## Validation

- Direct `http://` to an allowlisted host rejected, `fetch` never called.
- Rejection happens **before DNS** — asserted via the `lookup` mock, which is
  what proves the ordering rather than just the outcome.
- `307 → http://` on the same host rejected, with only the first hop having
  reached the network.
- `ftp:`, `file:`, `gopher:` refused.
- The dev flag permits plaintext outside production **and is ignored inside
  it**, with the ignored-flag log asserted.

## Quality Gates

| Gate            | Command                 | Result                                |
| --------------- | ----------------------- | ------------------------------------- |
| Typecheck       | `pnpm typecheck`        | ✅ pass                               |
| Lint (with fix) | `pnpm lint --fix`       | ✅ 0 errors, 12 pre-existing warnings |
| Unit tests      | `pnpm test`             | ✅ 229 files / 1708 tests             |
| DB integration  | `pnpm test:db`          | ✅ 167 tests                          |
| Circular deps   | `pnpm skott:check:only` | ✅ none                               |
| Unused deps     | `pnpm depcheck`         | ✅ none                               |
| Env consistency | `pnpm env:check`        | ✅ in sync                            |

## Residual Risk / Follow-Ups

- The gate applies to `secureFetch` only. Any code path that calls `fetch`
  directly bypasses it — as it already bypassed the allowlist and pinning,
  so this widens no existing gap, but a guard test in the spirit of SEC-23's
  and SEC-38's would make that boundary enforced rather than assumed.
  Logged as `PE-13`.
- `SECURITY_OUTBOUND_ALLOW_INSECURE_HTTP` has no current consumer; it exists
  for a local plaintext endpoint. Note that private and loopback addresses
  are already blocked outright, so it only ever applies to an allowlisted
  public host.

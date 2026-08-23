# Intake — Explicit Client-IP Trust Model (SEC-43)

## Reported Issue (repo owner, Case 13)

> `getIP()` powinien mieć jawny trust model. Dzisiaj: `x-forwarded-for` →
> `x-real-ip` → `cf-connecting-ip` → `127.0.0.1`. Dla uniwersalnego
> boilerplate'a powinieneś zdefiniować `DEPLOYMENT_PROXY = vercel | cloudflare
| trusted-proxy | none` i dopiero wtedy wybierać trusted header. Ponadto:
> walidacja przez `net.isIP()` / `ipaddr.js`; limit długości; invalid header →
> odrzucić/regenerate; nie traktować wszystkich nieznanych klientów jako
> `127.0.0.1`.
>
> Nie twierdzę, że Vercel daje tu aktualnie spoofable XFF — chodzi o
> poprawność boilerplate'a przenoszonego na inne ingressy.

## Verified Current State

`src/shared/lib/network/get-ip.ts` returned `Promise<string>`, reading the
first header present from `x-forwarded-for`, `x-real-ip`, `cf-connecting-ip`,
falling back to the literal `'127.0.0.1'`. No validation, no length limit, no
notion of which ingress is in front.

Nine call sites, all security-relevant after Cases 3 and 12: the rate-limit
key for sign-in, sign-up, password reset, verification, waitlist and log
ingest; the generic per-client API window in the Edge proxy; and
`audit_log.ip`.

## Findings Beyond The Report

1. **Header order was wrong even on a supported ingress.** `cf-connecting-ip`
   was checked _last_. Behind Cloudflare, `x-forwarded-for` is appended to
   whatever the client sent, so its leftmost entry is attacker-supplied;
   `cf-connecting-ip` is the one Cloudflare sets and overwrites. The old order
   preferred the weaker header.

2. **`with-auth.ts` fed an ABAC authorization decision from raw headers.**
   Found by the guard written for this case, before it was committed:

   ```ts
   environment: {
     ip: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined,
   ```

   `ConditionEvaluator.isFromAllowedIp` reads that value, so any caller could
   send `x-forwarded-for: 10.0.0.1` and satisfy an IP allow-list policy. This
   is worse than the reported issue: a rate-limit bypass versus an
   authorization bypass.

3. **`with-internal-api-guard.ts`** logged `req.headers.get('x-forwarded-for')
|| 'unknown'` into a security-audit line — unvalidated, and `'unknown'`
   reads as a fact.

4. **A dormant block-list bypass, activated by this very fix.**
   `isNotFromBlockedIp` returned `true` when `environment.ip` was absent, and
   a test asserted that, calling it a "safe default". It was safe only because
   the branch was unreachable: `getIP()` always produced a string. Making
   "unknown client" a real state would have turned that into a block-list
   bypass for anyone arriving without a trustworthy header.

5. **`ipaddr.js` is looser than expected.** `ipaddr.isValid('1.2.3')` is true
   and parses to `1.2.0.3`. Caught by a test written from intent rather than
   from the library's behaviour.

## Hard Constraint Found

**Next.js does not expose the socket peer.** `NextRequest` in 16.3.2 has no
`ip` and no socket access (`request.ip` was removed in Next 15), in either
runtime. Express anchors `trust proxy` at `remoteAddress` and only then walks
`X-Forwarded-For`; that anchor is unavailable here.

`trusted-proxy` is therefore implemented as a **topology-anchored** model: the
right-to-left CIDR walk is correct, but its soundness rests on the operator's
network isolation rather than on anything this code can verify. Stated
explicitly in the resolver's doc comment, in `.env.example` and in SEC-43,
rather than papered over.

## Decision Record (repo owner)

| #   | Question                   | Decision                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Unknown client             | **Typed result.** `getIP` replaced by a provider-aware resolver returning `trusted \| untrusted`; validate and canonicalise via `ipaddr.js`; never return a fictional `127.0.0.1`; rate limiter uses one **stable** fallback bucket plus a WARN; audit log records `null`. Headers may be trusted only per an explicitly configured deployment trust model, never because the header is present. |
| 2   | `DEPLOYMENT_PROXY` default | **Required — but only for a real deployment.** Production must declare it explicitly; development and test default to `none`. `VERCEL_ENV` may improve the error message but must **never** select a trust model silently.                                                                                                                                                                       |
| 3   | `trusted-proxy` shape      | **Right-to-left XFF walk against a CIDR list.** `TRUSTED_PROXY_CIDRS` required only for that mode, validated at startup. Malformed hop → untrusted; hop-count and length caps; canonicalise before the rate limiter and audit log; never store a raw header as an identifier.                                                                                                                    |

## Correction Accepted

The owner corrected a claim made while presenting option 3: **RFC 7239 does
not define an algorithm for `X-Forwarded-For`.** It standardises the
`Forwarded` header, and its relevant point is the general one — forwarding
data is meaningful only once trust in the proxy is established. The
right-to-left walk is the approach Express takes for `trust proxy`. Corrected
in the code comment and in SEC-43.

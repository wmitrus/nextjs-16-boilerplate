# Security Coding Patterns

Use the local security catalogue, not generic scanner folklore.

## Primary Reference

- `docs/ai/general/SECURITY_CODING_PATTERNS.md`

Quote local SEC IDs where relevant.

## High-Value Local Patterns

- `SEC-03`: never forward `redirect_url` without `sanitizeRedirectUrl()`.
- `SEC-15`: do not use `key in plainObject` as the only guard for user-controlled lookups.
- `SEC-17`: always pass `meta.path` to `checkRateLimit()`.
- `SEC-04`: prefer explicit `Record<AllowedKeys, fn>` dispatch maps over `obj[dynamicKey]()`.
- `SEC-16`: reusable `fs` helpers must validate and confine dynamic paths at the sink.

## Important False-Positive Knowledge

- `new URL('/literal-path', req.url)` is safe in this repo and maps to `SEC-02`.
- not every scanner warning should become a review finding if the repository already documents it as a false positive with a correct pattern.

## Review Rules

- Prefer narrow, evidence-backed findings over generic "security" concerns.
- Distinguish latent risk, real risk, and documented false positives.
- Do not flag a pattern as dangerous if the local catalogue explicitly marks it safe and the code matches the safe pattern.

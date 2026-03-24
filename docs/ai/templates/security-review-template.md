# Security Review

## Task

Short description of the security-sensitive change, incident, or investigation.

## Security Surface Classification

Classify the security surface involved.

Possible categories:

- authentication
- authorization
- tenant / organization context
- membership / role enforcement
- provider isolation
- trust boundary
- sensitive data handling
- server action enforcement
- route handler enforcement
- middleware / proxy behavior
- session / token handling
- unknown / requires investigation

Explain reasoning.

## Auth / Identity Surface

Check how identity is established for this change.

Questions:

- where is identity established (middleware, proxy, route handler, server action)?
- are identity claims trustworthy at this layer?
- is the session verified server-side before any action is taken?
- could a client-side identity claim be used without server-side verification?

Possible outcomes:

- Safe
- Risky
- Blocked

Explain findings.

## Authorization Surface

Check how authorization decisions are enforced.

Questions:

- where is authorization enforced for this change?
- are authorization checks placed server-side?
- are role or permission checks scattered or centralized?
- is authorization logic inside a UI component (forbidden)?
- does the change add new access paths without authorization checks?

Possible outcomes:

- Safe
- Risky
- Blocked

Explain findings.

## Tenant / Organization Surface

Check whether tenant or organization context is handled correctly.

Questions:

- does this change touch tenant/organization context?
- where is tenant context derived — is it trustworthy?
- is tenant context enforced in data access and business logic?
- could a user access another tenant's data through this change?
- would adding multi-tenancy later require significant rework of this change?

Possible outcomes:

- Safe
- Risky
- Blocked

Explain findings. If not applicable, state: Not applicable.

## Provider Isolation Check

Verify that provider SDK usage (Clerk, Sentry, Upstash, etc.) is correctly isolated.

Check that providers do not leak into:

- core contracts
- shared utilities
- domain modules
- feature business logic

Explain findings.

## Trust Boundaries

Identify trust boundary crossings in this change.

Check for:

- client-provided input trusted without validation
- middleware assumed as the only authorization gate
- server actions that skip permission checks
- route handlers that rely on client-passed user/tenant IDs
- redirects that can be controlled by untrusted input (open redirect risk)

Explain findings.

## Sensitive Data Handling

Check whether sensitive data is handled correctly.

Check for:

- PII, tokens, secrets, or credentials logged or exposed in errors
- sensitive data returned in API responses beyond what is needed
- sensitive env vars exposed to the client bundle
- telemetry or Sentry captures that may include sensitive data

Explain findings.

## Server Action / Route Handler Enforcement

If this change introduces or modifies server actions or route handlers, verify:

- server-side authentication is checked at the handler level
- authorization is enforced before any mutation or sensitive read
- input is validated and sanitized before use
- response does not expose more data than required

Possible outcomes:

- Safe
- Risky
- Blocked

Explain findings. If not applicable, state: Not applicable.

## Security Constraints

List constraints that implementation must respect for this change.

Examples:

- authorization must be enforced server-side before any mutation
- do not trust client-provided user or tenant identifiers
- do not expose session tokens or secrets in logs or telemetry
- provider SDK must not leak into domain contracts
- do not place authorization checks only inside client components

## Recommendation

Final decision:

- Safe to implement
- Safe with constraints
- Blocked pending security redesign

Explain reasoning and list any follow-up actions required.

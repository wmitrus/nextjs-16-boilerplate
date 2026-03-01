# Extending App Safely - Edge vs Node Authorization

## Audience

Developers adding new features, routes, middleware behavior, or security checks.

Use this as an implementation playbook. For architecture rationale, see:

- `docs/architecture/15 - Edge vs Node Composition Root Boundary.md`

## Quick decision tree

Before coding, classify the change:

1. Does it need DB-backed policy/role/tenant attribute evaluation?
   - Yes -> implement in Node flow (server action or route handler).
   - No -> continue.
2. Is it only request gate logic (auth gate, redirects, headers, rate limit, internal key)?
   - Yes -> middleware/Edge is valid.
   - No/unclear -> default to Node.

## Where to place code

### Edge (middleware-safe)

- `src/proxy.ts`
- `src/security/middleware/*`

Allowed examples:

- unauthenticated redirect to sign-in
- onboarding redirect checks via user profile lookup
- API key guard for internal routes
- rate-limit response and security headers

Not allowed in Edge:

- resolving `AUTHORIZATION.SERVICE`
- calling DB-backed policy checks
- using `getAppContainer()`

### Node (authorization-safe)

- server actions (`createSecureAction` flows)
- route handlers and server-side orchestration

Required for:

- RBAC/ABAC resource-level checks
- policy engine decisions
- tenant attribute-based authorization

## Composition APIs to use

- Edge: `getEdgeContainer()`
- Node: `getAppContainer()`

If you need to choose one and are unsure, choose `getAppContainer()` in Node context and keep middleware minimal.

## withAuth usage contract

- Edge middleware must call `withAuth(..., { enforceResourceAuthorization: false })`.
- Node flows keep resource authorization enabled by default.

## Minimal implementation examples

### Add middleware gate (Edge-safe)

1. Add route classification or guard in `src/security/middleware/*`.
2. Wire into `src/proxy.ts` pipeline.
3. Do not resolve authorization service.

### Add protected business action (Node-safe)

1. Build dependencies from `getAppContainer()`.
2. Use `createSecureAction`.
3. Keep policy enforcement in node/server path.

## Tests to add when extending

- Middleware behavior:
  - extend `src/proxy.test.ts`
  - extend `src/testing/integration/proxy-runtime.integration.test.ts`
- Authorization behavior (Node path):
  - extend server-action or route-handler integration tests
- Boundary regression guard:
  - keep `src/proxy.edge-composition.test.ts` green

## PR checklist for contributors

- [ ] I chose runtime placement using the decision tree.
- [ ] Middleware code does not resolve DB-backed authorization.
- [ ] Node path contains resource-level authorization.
- [ ] `getEdgeContainer()` is used only for Edge middleware composition.
- [ ] `getAppContainer()` is used only in Node/server flows.
- [ ] Relevant proxy/middleware/integration tests were updated.

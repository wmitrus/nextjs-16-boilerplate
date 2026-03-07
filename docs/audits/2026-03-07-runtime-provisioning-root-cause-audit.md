# Runtime Provisioning Audit (Remediation Record)

Date: 2026-03-07
Owner: Architecture/Security
Status: IN_PROGRESS (hardening patch set applied, full matrix validation pending)

## 1. Root Cause Summary

### RC-1 (Expected behavior)

Clerk session cookies are external auth state. DB reset does not invalidate Clerk session.

### RC-2 (Critical architectural gap, now remediated)

Edge middleware authenticated session presence, but onboarding/provisioning truth lives in Node+DB. This allowed "authenticated externally, missing internal user" runtime drift.

### RC-3 (False runtime probe)

`/api/users` previously returned static payload without internal provisioning gate, so it was not a valid provisioning health signal.

### RC-4 (Config drift risk)

`TENANCY_MODE=single` can point to a valid UUID that does not exist in DB, causing runtime confusion if unchecked.

## 2. Implemented Remediation

### R-1 Node-authoritative provisioning gate

- [x] Added shared Node gate utility that resolves internal identity, user onboarding state, tenant context, and tenant membership.
- [x] Standardized gate outcomes:
  - `UNAUTHENTICATED`
  - `ONBOARDING_REQUIRED`
  - `TENANT_CONTEXT_REQUIRED`
  - `TENANT_MEMBERSHIP_REQUIRED`
  - `FORBIDDEN`
- [x] Mapped domain errors (`UserNotProvisionedError`, `TenantNotProvisionedError`, `MissingTenantContextError`, `TenantMembershipRequiredError`) into controlled outcomes.

### R-2 Protected API enforcement

- [x] Added Node API wrapper `withNodeProvisioning(...)` for controlled 401/403/409 responses.
- [x] `/api/users` is now Node-gated before response.
- [x] Added authoritative probe endpoint: `/api/me/provisioning-status`.

### R-3 Protected page enforcement

- [x] Added server guard for `/users` (Node runtime) with deterministic redirect mapping.
- [x] Onboarding remains accessible to externally authenticated but internally unprovisioned users.

### R-4 Single-tenant fail-fast

- [x] Node gate checks default tenant existence in `TENANCY_MODE=single` and returns controlled denial (`DEFAULT_TENANT_NOT_FOUND`).
- [x] DB integration covers missing default-tenant failure path in provisioning service.

### R-5 DI and boundary cleanup

- [x] Read-path auth adapters import `ExternalAuthProvider` from core contracts, not legacy mapper interface.
- [x] Read-only lookup remains `InternalIdentityLookup`; write-path remains `ProvisioningService.ensureProvisioned()`.

## 3. Validation Gates

### Required quality gates

- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm test:integration`
- [ ] `pnpm test:db`
- [ ] targeted e2e provisioning runtime suite

### Required runtime matrix gates

- [ ] Scenario A (`single`): positive path + probe endpoint
- [ ] Scenario B (`personal`): positive path + probe endpoint
- [ ] Scenario C (`org/provider`): missing org context (409) + positive path
- [ ] Scenario D (`org/db`): missing active tenant (409), non-member (403), member success (200)
- [ ] DB reset + active Clerk session: still denied until onboarding/provisioning complete

## 4. Production Readiness Criteria

Release candidate is considered ready only when:

1. All quality gates and matrix gates above are green.
2. No path can access protected page/API with external session only and missing internal provisioning.
3. `/api/me/provisioning-status` returns deterministic controlled outcomes (never silent success on missing internal state).
4. Docs (`architecture`, `runbooks`, `testing`) stay aligned with Node-authoritative provisioning model.

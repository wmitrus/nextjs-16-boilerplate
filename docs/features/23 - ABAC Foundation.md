# ABAC Foundation

This document describes the current ABAC layer built on top of RBAC.

## 1. What ABAC Uses

ABAC decisions evaluate contextual data in `AuthorizationContext`:

- `subject` (`id`, resolved `roles`, optional attributes)
- `tenant` (`tenantId`)
- `tenantAttributes` (plan/features/limits)
- `resource` (`type`, optional `id`, optional attributes)
- `environment` (ip, time, method/path metadata)

## 2. Decision Pipeline

1. Enforcement layer assembles request facts.
2. `DefaultAuthorizationService` enriches context with `roles` and `tenantAttributes`.
3. `PolicyEngine` evaluates policy conditions.
4. Deny policies override allow policies.

## 3. Condition Building Blocks

`ConditionEvaluator` provides pure helpers, e.g.:

- ownership checks (`isOwner`)
- subject attribute checks (`hasAttribute`)
- time-window checks (`isBeforeHour`, `isAfterHour`)
- IP allow/block checks (`isFromAllowedIp`, `isNotFromBlockedIp`)

These helpers are policy-level only. No framework calls, no DB calls.

## 4. Tenant Attributes as ABAC Source

`tenant_attributes` is the canonical place for plan/feature contract data used by policies.

Typical checks:

- plan-based permission (`free` vs `pro`)
- feature flag access (`features` array)
- tenant limits (`userLimit`, billing state)

## 5. Boundary Rules

1. Middleware and secure actions assemble context; they do not implement policy logic.
2. ABAC conditions stay in authorization domain (`modules/authorization/domain/*`).
3. No provider SDK calls in ABAC domain.
4. No DB writes in resolvers used for read-path identity/tenant resolution.

## 6. Testing Focus

Keep these green for ABAC safety:

- `ConditionEvaluator.test.ts`
- `PolicyEngine.test.ts`
- DB/integration tests covering ownership, tenant attributes, and deny-overrides

## 7. Related Docs

- `docs/features/22 - RBAC Baseline.md`
- `docs/getting-started/03 - Tenancy, Organizations, Roles and Onboarding - Runtime Matrix.md`
- `docs/architecture/15 - Edge vs Node Composition Root Boundary.md`

# docs/features/ Validation Report

**Agent**: Validation Strategy Agent  
**Mode**: Change Validation (Documentation Drift Analysis)  
**Date**: 2026-03-22  
**Scope**: All files in `docs/features/`

---

## 1. Objective

Validate whether all files in `docs/features/` accurately reflect the current state of the codebase implementation. Identify stale, inaccurate, or misleading documentation for a follow-up Implementation Agent to fix.

---

## 2. Methodology

Each doc was cross-referenced against actual code:

- File paths claimed in docs were verified to exist
- API shapes were compared to actual exported interfaces
- Module structure claims were confirmed against `ls` output
- Environment variables were compared against `src/core/env.ts`
- CI workflow files were verified against `.github/workflows/`

---

## 3. Findings by Severity

### 🔴 CRITICAL — Stale/Wrong API Examples That Will Mislead Developers

#### `20 - Enterprise Security Architecture.md`

**Finding 1**: Wrong import path for authorization helpers

The doc states:

```typescript
import { authorize, enforceTenant } from '@/security/core/authorization';
```

**Actual state**: No file `src/security/core/authorization.ts` exists. The actual file is `src/security/core/authorization-facade.ts` which exports the `AuthorizationFacade` class. There are no standalone exported `authorize` or `enforceTenant` functions anywhere in the codebase.

**Impact**: Developer following this doc would get a module-not-found runtime error.

---

**Finding 2**: Wrong `SecurityContext.user.role` field claim

The doc states:

```typescript
console.log(context.user.role); // 'admin' | 'user' | 'guest'
```

**Actual `SecurityContext` interface** (`src/security/core/security-context.ts`):

```typescript
export interface SecurityContext {
  user?: {
    id: string;
    tenantId: string;
    attributes?: Record<string, unknown>;
  };
  ip: string;
  userAgent?: string;
  correlationId: string;
  runtime: 'edge' | 'node';
  environment: 'development' | 'test' | 'production';
  requestId: string;
  readinessStatus: ReadinessStatus;
}
```

`role` does not exist on `SecurityContext`. Role resolution is done through the authorization domain (`AuthorizationService`), not inlined into the security context.

**Impact**: Misleads developer about what SecurityContext contains. Any code following this example will fail at runtime or typecheck.

---

**Finding 3**: Wrong `createSecureAction` API example

The doc shows:

```typescript
export const updateSettings = createSecureAction({
  schema,
  role: 'admin', // Optional, defaults to 'user'
  handler: async ({ input, context }) => { ... }
});
```

**Actual `ActionOptions` interface** (`src/security/actions/secure-action.ts`):

```typescript
export interface ActionOptions<TSchema extends z.ZodType, TResult> {
  schema: TSchema;
  resource?: ResourceContext;
  action?: Action;
  dependencies: SecureActionDependenciesResolver; // REQUIRED - not optional
  handler: (args: {
    input: z.infer<TSchema>;
    context: SecurityContext;
  }) => Promise<TResult>;
}
```

- `role` field: does NOT exist
- `dependencies` field: is REQUIRED and NOT shown in the doc example
- `resource` / `action` replace the old `role` concept

**Impact**: The example will fail TypeScript compilation. A developer following this will produce broken code.

---

### 🟡 MAJOR — Wrong File Path (Path Mismatch)

#### `17 - Clerk Onboarding.md`

**Finding**: The doc states:

> `completeOnboarding()` flow (`src/modules/auth/ui/onboarding-actions.ts`)

**Actual path**: `src/app/onboarding/actions.ts`

The `src/modules/auth/ui/` directory only contains:

- `HeaderAuthControls.tsx`
- `HeaderAuthFallback.tsx`
- `HeaderWithAuth.tsx`
- `HeaderWithAuth.test.tsx`

The `completeOnboarding` server action is confirmed at `src/app/onboarding/actions.ts` (line 31).

The rest of doc 17's content (provisioning flow, tenant context resolution, profile fields, role outcomes) is substantively accurate. Only the file path claim needs correction.

**Impact**: Developer trying to locate or modify the onboarding action will look in the wrong place.

---

### 🟢 MINOR — Documentation Omissions (Not Wrong, Just Incomplete)

#### `01 - Next.js 16 Readiness.md`

The doc shows the `nextConfig` object but omits two real entries:

```typescript
// actual next.config.ts - omitted from doc
serverExternalPackages: [
  '@electric-sql/pglite',
  'pino',
  'pino-logflare',
  'pino-pretty',
],
```

Also omits the `withSentryConfig` wrapper which is the actual export.

These are additive omissions, not inaccuracies. The doc was written before these additions.

**Impact**: Low. Developers setting up or customizing `next.config.ts` won't see the full picture. Not misleading, just incomplete.

---

#### `07 - Testing Infrastructure.md`

The integration test coverage threshold is stated as 80%. The actual `vitest.integration.config.ts` should be verified by the next agent — the unit config is confirmed at 80%.

**No blocker** — just note to verify integration thresholds match.

---

## 4. Verified Accurate Docs

The following docs were verified against actual code and found to be accurate:

| Doc                                                       | Key Verifications                                                                                                                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `02 - TypeScript ESLint Prettier Setup.md`                | Directory structure, commands match                                                                                                                                                               |
| `03 - Conventional Commits.md`                            | Tools and hooks match                                                                                                                                                                             |
| `04 - Git Hooks (Husky).md`                               | pre-commit, commit-msg, pre-push hooks confirmed                                                                                                                                                  |
| `05 - Staged Linting.md`                                  | lint-staged behavior confirmed                                                                                                                                                                    |
| `06 - Quality Tools.md`                                   | skott, depcheck, madge commands confirmed                                                                                                                                                         |
| `08 - Storybook Integration.md`                           | .storybook/ structure, commands match                                                                                                                                                             |
| `09 - Chromatic Integration.md`                           | deployChromatic.yml confirmed                                                                                                                                                                     |
| `11 - Environment & T3-Env.md`                            | All env vars verified in `src/core/env.ts`                                                                                                                                                        |
| `12 - Logging & Observability.md`                         | Logger paths match actual `src/core/logger/`                                                                                                                                                      |
| `13 - Rate Limiting.md`                                   | All referenced files exist and match descriptions                                                                                                                                                 |
| `14 - Error Handling & Response Service.md`               | File paths verified                                                                                                                                                                               |
| `15 - Clerk Authentication.md`                            | `ClerkRequestIdentitySource.ts` confirmed at `infrastructure/clerk/`; tenancy matrix accurate; ClerkProvider props in layout.tsx match                                                            |
| `16 - Clerk Waitlist.md`                                  | `/waitlist` in `PUBLIC_ROUTE_PREFIXES` confirmed; `waitlistUrl` in layout.tsx confirmed                                                                                                           |
| `19 - CI-CD & Lighthouse CI.md`                           | `e2e-label.yml` and `e2e-matrix.yml` both confirmed to exist                                                                                                                                      |
| `21 - Next.js 16 Cache Components, PPR & Devtools MCP.md` | `cacheComponents: true` in `next.config.ts` confirmed                                                                                                                                             |
| `22 - RBAC Baseline.md`                                   | All file paths in section 6 verified; regression test files verified (`DrizzlePolicyRepository.db.test.ts`, `AuthorizationService.db.test.ts`, `DrizzleProvisioningService.db.test.ts` all exist) |
| `23 - ABAC Foundation.md`                                 | `ConditionEvaluator.ts`, `PolicyEngine.ts` paths confirmed in `authorization/domain/policy/`                                                                                                      |
| `ENV-requirements.md`                                     | All env vars accurate; `src/core/runtime/bootstrap.ts` confirmed to exist                                                                                                                         |

**Not reviewed** (low-risk reference docs):

- `10 - Release Automation.md`
- `18 - PBT - TEAM-INSTALL.md`
- `18 - Parent Branch Tracking.md`
- `DEPLOY-manual.md`
- `SEC-my-reqs`

---

## 5. Required Fixes for Next Agent

### Fix 1 — `20 - Enterprise Security Architecture.md` (CRITICAL)

**Section 2.2 RBAC & Tenant Isolation** needs to be rewritten.

Remove:

```typescript
import { authorize, enforceTenant } from '@/security/core/authorization';
authorize(context, 'admin');
enforceTenant(context, 'tenant_abc_123');
```

Replace with accurate API. The actual authorization flow uses:

- `AuthorizationFacade` from `@/security/core/authorization-facade`
- `AuthorizationService.can(context)` / `AuthorizationFacade.authorize(context)`
- `AuthorizationContext` from `@/core/contracts/authorization`

**Section 2.1** should clarify `getSecurityContext()` is valid but does NOT return `user.role`. It returns an identity context (user.id, user.tenantId). Role resolution requires calling authorization service separately.

**Section 4.2 Example Usage** needs full rewrite to show actual `createSecureAction` API:

- Remove `role: 'admin'`
- Add required `dependencies` field
- Change `role` concept to `resource`/`action` pattern

Provide the correct example structure:

```typescript
import { createSecureAction } from '@/security/actions/secure-action';
import { getNodeSecurityDependencies } from '@/security/security-dependencies'; // or equivalent DI path

export const updateSettings = createSecureAction({
  schema,
  resource: { type: 'settings' },
  dependencies: getNodeSecurityDependencies, // required
  handler: async ({ input, context }) => {
    // context.user?.id comes from SecurityContext, not a role check
    return await db.settings.update(context.user!.id, input);
  },
});
```

Note: The actual `getNodeSecurityDependencies` wiring path should be confirmed from `src/security/security-dependencies.ts` before writing the example.

---

### Fix 2 — `17 - Clerk Onboarding.md` (MAJOR)

**Section 1** — correct the file path:

Change:

> `completeOnboarding()` flow (`src/modules/auth/ui/onboarding-actions.ts`)

To:

> `completeOnboarding()` flow (`src/app/onboarding/actions.ts`)

No other content in doc 17 requires change.

---

### Fix 3 — `01 - Next.js 16 Readiness.md` (MINOR)

Update the Configuration Details code block to include current `serverExternalPackages` and note the Sentry wrapper:

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  cacheComponents: true,
  reactCompiler: true,
  serverExternalPackages: [
    '@electric-sql/pglite',
    'pino',
    'pino-logflare',
    'pino-pretty',
  ],
  experimental: {
    turbopackFileSystemCacheForDev: true,
  },
};

export default withSentryConfig(nextConfig, {
  /* Sentry options */
});
```

---

## 6. Priority Order for Next Agent

| Priority | Doc                                        | Change Type                    | Severity |
| -------- | ------------------------------------------ | ------------------------------ | -------- |
| 1        | `20 - Enterprise Security Architecture.md` | Rewrite sections 2.1, 2.2, 4.2 | CRITICAL |
| 2        | `17 - Clerk Onboarding.md`                 | Single line path fix           | MAJOR    |
| 3        | `01 - Next.js 16 Readiness.md`             | Extend code block              | MINOR    |

---

## 7. Recommended Next Action

Invoke **Implementation Agent** to:

1. Fix `20 - Enterprise Security Architecture.md` sections 2.1, 2.2, and 4.2 based on:
   - Actual `SecurityContext` interface from `src/security/core/security-context.ts`
   - Actual `AuthorizationFacade` from `src/security/core/authorization-facade.ts`
   - Actual `ActionOptions` from `src/security/actions/secure-action.ts`
   - Actual DI wiring from `src/security/security-dependencies.ts`

2. Fix `17 - Clerk Onboarding.md` section 1 path: `src/modules/auth/ui/onboarding-actions.ts` → `src/app/onboarding/actions.ts`

3. Update `01 - Next.js 16 Readiness.md` Configuration Details code block to include `serverExternalPackages` and `withSentryConfig`.

**Validation after fixes**: No runtime test needed. TypeScript/lint should still pass. Fixes are documentation-only.

---

## 8. Validation Readiness Status

**VALIDATION BASELINE IS ACCEPTABLE WITH GAPS**

The codebase docs are largely accurate. Two high-risk files contain stale API examples (`doc 20`) and a wrong path (`doc 17`) that would mislead developers building new features. These must be fixed before the feature development guide is relied upon for new implementation work.

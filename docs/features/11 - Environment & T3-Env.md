# Environment & T3-Env

This project uses `@t3-oss/env-nextjs` + `zod` in `src/core/env.ts`.

## 1. Quick Start

```bash
pnpm env:init
pnpm env:check
```

## 2. Schema Structure

`src/core/env.ts` defines:

- `server`: server-only variables
- `client`: browser-exposed vars (`NEXT_PUBLIC_*`)
- `runtimeEnv`: explicit mapping from `process.env`

## 3. Important Refactor Additions

### 3.1 Auth provider axis

- `AUTH_PROVIDER=clerk|authjs|supabase`

Cross-field validation:

- when `AUTH_PROVIDER=clerk`, both Clerk keys are required

### 3.2 Tenancy axis

- `TENANCY_MODE=single|personal|org`
- `TENANT_CONTEXT_SOURCE=provider|db` (required when `TENANCY_MODE=org`)
- `DEFAULT_TENANT_ID` (required when `TENANCY_MODE=single`)
- `TENANT_CONTEXT_HEADER` / `TENANT_CONTEXT_COOKIE`

### 3.3 Provisioning policy axis

- `FREE_TIER_MAX_USERS`
- `CROSS_PROVIDER_EMAIL_LINKING=disabled|verified-only`

## 4. Validation Functions

Defined in `src/core/env.ts`:

1. `validateTenancyConfigValues(...)`
2. `validateAuthProviderConfigValues(...)`

These are called at bootstrap to fail fast for invalid runtime combinations.

## 5. Update Rules

When adding a new env var:

1. Add it to `src/core/env.ts` schema.
2. Add it to `.env.example`.
3. Add tests in `src/core/env.test.ts`.
4. Update relevant docs in `docs/features/ENV-requirements.md`.

## 6. References

- `docs/features/ENV-requirements.md`
- `src/core/env.ts`
- `src/core/env.test.ts`

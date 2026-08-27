# Consolidated Remediation Constraints

## Security/Auth

- Treat the incident as a confirmed CRITICAL resource-scope authorization bypass.
- Identity remains established by `withNodeProvisioning` for routes and the existing admin layout/provisioning flow for pages.
- Action authorization remains server-side.
- Do not treat `allowed: true` as proof of platform-wide or sibling-organization authority.
- Derive the organization scope only from verified server access plus `isEnvBasedPlatformAdmin`.
- Use organization scope for every non-platform administrator.
- Use active-tenant scope only for an explicit platform administrator.
- Keep authorized scope in the Drizzle predicate that resolves or mutates the organization.
- Preserve non-disclosing not-found behavior for inaccessible valid UUIDs.
- Preserve UUID validation, step-up/MFA, auditing, and shared response contracts.

## Runtime

- Keep enforcement in server-only route handlers, Server Components, and Drizzle services.
- Do not rely on the admin layout, client UI, or `src/proxy.ts` as the resource authorization boundary.
- Preserve `connection()` and current request-time behavior.
- Do not add route-segment config, cache directives, revalidation, or provider-specific runtime behavior.

## Architecture

- Own the scope contract in the authorization module, not `shared` or UI code.
- Use a discriminated union so every service call must choose organization or active-tenant scope.
- Keep delivery responsible for establishing actor authority and infrastructure responsible for enforcing the supplied trusted scope in SQL.
- Do not introduce the future tenant-role model or canonical context during containment.
- Do not duplicate SQL-scope policy across every route.

## Forbidden Shortcuts

- UI-only hiding
- a bare boolean such as `isAdmin` passed as scope
- checking only that two organizations share a tenant for non-platform actors
- trusting path, cookie, body, or provider organization IDs as authority
- unscoped platform behavior without an explicit platform-admin result
- data cleanup, reparenting, schema migration, or provider redesign

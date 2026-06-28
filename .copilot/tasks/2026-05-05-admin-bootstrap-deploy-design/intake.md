# Intake

## Request

Review the production readiness of the current admin bootstrap design. Assess whether first-admin bootstrap should use GitHub secrets, Vercel environment variables, or seed logic, then provide a production-ready implementation plan after security/auth and validation review.

## Starting Evidence

- `scripts/bootstrap-admin.ts` creates the first admin account and bypasses public registration.
- `preview-deploy.yml` and `prod-deploy.yml` inject `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, and `DEFAULT_TENANT_ID` from GitHub secrets.
- `.env.example` says bootstrap credentials should be environment variables and should be removed after successful bootstrap.
- `DEFAULT_TENANT_ID` is also core single-tenant runtime configuration.

## Key Design Questions

- Should first-admin bootstrap stay a dedicated script or move into seeds?
- Who should own bootstrap inputs: GitHub Actions or Vercel environment config?
- Is automatic bootstrap during deploy acceptable for preview and production?
- What is the minimum safe production-ready rollout plan?

## Readiness Checklist

- [x] Current code path identified
- [x] Workflow ownership path identified
- [x] Docs-vs-code drift identified
- [x] Architecture review completed
- [x] Security/auth review completed
- [x] Validation review completed
- [x] Implementation-ready decision set produced

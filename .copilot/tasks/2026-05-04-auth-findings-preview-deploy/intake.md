# Intake

## Request

User asked to verify the listed findings first, fix only the ones still needed, and then fix the preview deploy failure.

## Verified So Far

- Still valid in current code: `src/app/dashboard/tools-inventory.ts`, `src/core/env.ts`, `src/app/dashboard/layout.tsx`, `src/app/auth/signin/page.tsx`, `src/app/auth/signin/sign-in-client.tsx`, `src/app/auth/post-auth-redirect.ts`, `src/app/auth/bootstrap/start/route.ts`, `src/app/onboarding/actions.ts`, `src/app/onboarding/layout.tsx`, `src/app/users/layout.tsx`, `src/modules/auth/index.ts`, `src/modules/auth/ui/authjs/HeaderAuthControlsAuthjs.test.tsx`, `src/modules/auth/ui/authjs/UserAvatarMenu.tsx`, `src/security/middleware/route-policy.ts`, `src/security/middleware/with-auth.test.ts`
- Already stale in current workspace: `/auth/signup` 404 comment, missing `/auth/invite/[token]` route comment
- Preview deploy failure initially reproduced as a Clerk package export mismatch during `pnpm build`; after fixing the dependency graph, the next real blocker was an AuthJS root-layout/invite-page runtime issue under Next.js 16 build

## Constraints

- Fix only verified live findings
- Prefer low-blast-radius edits
- Keep security and auth-flow sanitization patterns consistent with repository rules

## Completion Notes

- Auth/dashboard findings were fixed with minimal local patches and focused Vitest coverage
- Preview deploy root cause included an invalid Clerk override policy (`>=`) that allowed incompatible major upgrades in the lockfile
- Final build passed after pinning Clerk overrides to compatible majors and adding the missing Suspense/`connection()` runtime fixes for the invite flow

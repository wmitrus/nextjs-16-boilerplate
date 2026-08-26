# AuthJS Login Incident Intake

## Leantime Lifecycle

- Milestone ID: `99` - AuthJS login connection-closed incident.
- Task ID: `100` - Resolve AuthJS login connection-closed incident.
- Status: `Zrobione` (`0`) as of 2026-08-15.

## User-Reported Symptom

Preview and Production show an unhandled promise rejection during login:

```text
Error: Unhandled Promise Rejection: Connection closed.
```

## Initial Runtime Evidence

- The hosted HAR shows successful New Relic telemetry responses but does not contain the original rejected promise payload.
- The active route in captured browser telemetry is `/auth/signin`, which is the repository AuthJS sign-in route.
- `GlobalErrorHandlers` receives and reports `unhandledrejection`; it is an observation boundary, not proof of the origin.

## Readiness Checklist

- [done] Incident classified as AuthJS/runtime behavior affecting Preview and Production.
- [done] Mandatory auth-flow anti-patterns and verification matrix reviewed.
- [done] Exact rejection source and upstream hosted failure boundary confirmed.
- [done] Auth/security and runtime review completed.
- [done] Minimal correction implemented and locally tested.
- [done] Preview and Production hosted smoke (`/auth/signin` renders,
  `/api/auth/session` returns JSON) passed. Full sign-in/bootstrap-admin/
  protected-admin flows were **not** exercised by CI (Auth Matrix E2E is
  label-gated and was never triggered here) — see
  [OZI-50](https://linear.app/oziniusz/issue/OZI-50) for a live admin
  regression this gap let through.

## Acceptance Criteria

- The sign-in flow no longer produces the unhandled `Connection closed` rejection after hosted deployment verification.
- Invalid credentials, verified-user sign-in, and post-auth redirect behavior remain explicit and safe.
- The correction does not hide arbitrary unhandled rejections or weaken Sentry/New Relic error visibility.
- Focused AuthJS browser evidence covers the affected scenario in a repository-supported execution profile.
- A public hosted sign-in request never leaves a blank PPR shell when its dynamic continuation is delayed or unavailable.

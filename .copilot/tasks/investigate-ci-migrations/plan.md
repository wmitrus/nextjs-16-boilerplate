# Plan

- Task ID: investigate-ci-migrations
- Objective: Determine whether database migrations are executed automatically anywhere in CI beyond the explicit preview and production deploy workflow steps, and separate deploy-time migrations from test-only database setup.
- Status: In progress

## Checklist

- [x] Read required repository and workflow guidance
- [x] Inspect deploy workflows for explicit migration steps
- [x] Inspect package scripts for install/build hooks and migration entrypoints
- [x] Inspect CI workflows that may run migrations indirectly through tests or E2E helpers
- [ ] Correlate findings into confirmed execution paths and likely sources of observed CI logs
- [ ] Deliver evidence-backed conclusion and recommendation

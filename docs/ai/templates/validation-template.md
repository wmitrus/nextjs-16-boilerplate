# Validation Review

## Task

Short description of the repository validation review or change validation request.

## Mode

Choose one:

- Repository Baseline Validation
- Change Validation

State the active mode explicitly.

## Validation Objective

Explain what is being validated.

Examples:

- repository-wide validation strategy
- test coverage for a feature
- validation scope for a fix
- validation scope for a refactor

## Current Validation Surfaces

List the relevant validation surfaces that exist today.

Examples:

- unit tests
- integration tests
- e2e tests
- Storybook/Vitest tests
- lint
- typecheck
- architecture lint
- dependency checks
- CI workflows

Confirm what exists in code/config, not just in docs.

## Risk Areas

Identify the risk areas relevant to this review.

Examples:

- auth flows
- authorization
- tenancy / organization logic
- provisioning / synchronization
- route handlers
- server actions
- middleware
- cache-sensitive flows
- env-driven behavior
- architecture-sensitive boundaries

## Validation-Risk Assessment

Explain whether current validation is:

- strong enough
- too weak
- too shallow
- too expensive for the signal it gives
- giving false confidence

Call out:

- under-validation
- over-validation
- over-mocking
- blind spots

## Minimum Required Validation

List the minimum validation that must exist.

Examples:

- specific unit tests
- integration tests for assembled flows
- e2e for browser/runtime behavior
- architecture lint
- typecheck
- regression tests for incident path

## Optional Additional Validation

List validation that would improve confidence but is not strictly required.

## Validation Not Required

Explicitly state what validation is not needed and why.

This is important to avoid waste.

## Commands / Checks

List the concrete commands or checks to run.

Examples:

- pnpm typecheck
- pnpm lint
- pnpm arch:lint
- pnpm test
- pnpm test:integration
- pnpm e2e

Only include checks that make sense for the task.

## Validation Gaps

List missing or weak validation areas.

Examples:

- no integration coverage for provisioning flow
- no cache-sensitive validation
- route handlers tested only with mocks
- auth flow lacks runtime-sensitive validation

## Recommendation

Final decision:

- Validation baseline is strong
- Validation baseline is acceptable with gaps
- Validation baseline is risky
- Validation baseline is not sufficient

or for change-level analysis:

- Validation plan is sufficient
- Validation plan is minimal but acceptable
- Validation plan is risky
- Blocked pending specialist decision

Explain reasoning.

## Recommended Next Action

State the next safest step.

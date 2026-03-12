# Architecture Review

## Task

Short description of the task or refactor.

## Architecture Fit

Does the proposed change align with the repository architecture?

Possible outcomes:

- Safe
- Risky
- Blocked

Explain reasoning.

## Affected Layers

List affected layers:

- app
- features
- modules
- security
- shared
- core

Explain what changes in each layer.

## Affected Modules

List modules or features impacted by this change.

Example:

- modules/auth
- modules/authorization
- features/user-management

## Boundary Impact

Does this change affect:

- module boundaries
- dependency direction
- composition root
- DI container
- contracts

Explain impact.

## Dependency Direction Check

Verify dependency rules:

- app → features/modules/security/shared/core
- features → modules/security/shared/core
- modules → shared/core
- security → shared/core
- shared → core
- core must not depend on upper layers

Report violations or confirm compliance.

## Provider Isolation Check

Verify that provider SDK usage remains isolated.

Examples:

- Clerk
- Sentry
- Upstash

Check that providers do not leak into:

- core
- shared
- domain modules

## Structural Risks

Identify potential risks such as:

- boundary erosion
- coupling increase
- DI misuse
- service locator patterns
- hidden cross-module dependencies

## Documentation Drift

Check whether documentation differs from the code.

If drift exists:

- describe it
- state whether code or docs are correct

## Architecture Constraints

List constraints that must be respected by implementation.

Example:

- do not introduce new cross-module imports
- preserve provider isolation
- do not move domain logic into shared

## Recommendation

Final recommendation:

- Safe to implement
- Safe with constraints
- Blocked pending redesign

Explain reasoning.

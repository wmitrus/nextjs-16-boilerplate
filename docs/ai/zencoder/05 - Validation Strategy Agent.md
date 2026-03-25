> **THIS FILE IS A DESCRIPTION GUIDE — NOT THE AGENT PROMPT.**
> The real Zencoder prompt source that controls actual behavior is:
> **`docs/ai/general/05 - Validation Strategy Agent.md`**
> All rule changes, security rules, and behavioral updates MUST be applied to that file.
> Content added here does NOT affect how the Zencoder agent behaves.

## What it does

Prompt source used by Zencoder: [**`docs/ai/general/05 - Validation Strategy Agent.md`**](../general/05%20-%20Validation%20Strategy%20Agent.md)

Zencoder keeps its agent registration outside the repository. This guide points to the repo-hosted prompt source that backs the role.

- Defines `05 - Validation Strategy` as the specialist for repository-wide validation posture and minimum safe validation planning
- Focuses on test quality, over-mocking, false confidence, and choosing the right level between unit, integration, e2e, contract-style, and CI validation
- Produces the validation plan or validation posture assessment that guides later execution

## When to use it

- When you need the minimum safe validation scope for a change
- When you want a repository-wide validation posture review
- When the main question is validation level, over-mocking, or false confidence rather than design or implementation
- When broad new tests are being considered and need risk-based justification

## Auth-Flow Note

For any auth/bootstrap/onboarding change:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md` first
- review `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` as the mandatory verification checklist for affected scenarios

## Example use cases

- "What is the minimum safe validation plan for this feature change?"
- "Is the current test suite sufficient to protect this module, or are there coverage blind spots?"
- "Should I add integration tests or is a focused unit test enough here?"
- "Review this proposed broad test expansion — is it justified or wasteful?"
- "Audit the repository validation posture: are the CI quality gates production-grade?"

## Related ZenFlow workflows

- [feature-development.md](../../../.zenflow/workflows/feature-development.md)
- [safe-refactor.md](../../../.zenflow/workflows/safe-refactor.md)
- [security-incident-workflow.md](../../../.zenflow/workflows/security-incident-workflow.md)

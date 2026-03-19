## What it does

Real agent file: [validation-strategy.agent.md](../../../.github/agents/validation-strategy.agent.md)

- Defines `05 - Validation Strategy` as a read-only specialist for:
  - repository-wide validation posture reviews
  - minimum safe validation planning for a specific change
  - spotting over-mocking, brittle tests, and false confidence
  - choosing the right level between unit, integration, e2e, contract-style, and CI checks
- Anchors the agent to the repository’s governance files:
  - `00 - Agent Interaction Protocol.md`
  - `REPOSITORY_AI_CONTEXT.md`
  - `05 - Validation Strategy Agent.md`
- Keeps the same review-oriented posture as the other specialist agents

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

## Example prompts to try

- "Run Validation Strategy in Repository Baseline Validation mode for this repo."
- "Use Validation Strategy to decide the minimum safe validation scope for this auth bootstrap fix."
- "Review whether our current Playwright, Vitest, and CI checks are enough for provisioning and onboarding flows."
- "Identify where our tests are over-mocked and creating false confidence."
- "Determine whether this route-handler change needs unit, integration, or e2e validation."

## Available slash prompts

Real prompt files:

- [change-validation.prompt.md](../../../.github/prompts/change-validation.prompt.md)
- [repository-baseline-validation.prompt.md](../../../.github/prompts/repository-baseline-validation.prompt.md)

```bash
/Change Validation
```

```bash
/Repository Baseline Validation
```

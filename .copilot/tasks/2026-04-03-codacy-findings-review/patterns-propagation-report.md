# Patterns Propagation Report

## Objective

- Record the durable security-pattern updates confirmed during the Codacy findings review.
- Capture which repository instruction files were updated and why.
- Make the propagation step explicit in the task dossier rather than leaving it implicit in the working tree.

## Propagated Rules

- `SEC-15`: never guard a user-controlled lookup with `key in plainObject` before reading `plainObject[key]`; use `Object.hasOwn`, a null-prototype record, or `Map` instead.
- `SEC-16`: reusable `fs.*` helpers must resolve and confine path arguments at the helper sink; caller assumptions are insufficient.

## Pattern Catalogue Updates

- `docs/ai/general/SECURITY_CODING_PATTERNS.md`
  - added `SEC-15` with rationale, dangerous pattern, safe alternatives, and relationship to `SEC-04`
  - added `SEC-16` with sink-confinement rationale, dangerous helper pattern, safe helper pattern, and relationship to `SEC-05` / `SEC-12`

## Instruction Files Updated

- `AGENTS.md`
  - added `SEC-15` and `SEC-16` to the repository rule table
  - added hard-rule guidance for user-controlled record lookups and reusable helper path guards
- `docs/ai/general/02 - Security & Auth Agent.md`
  - added `SEC-15` as a forbidden security pattern
  - clarified that `SEC-16` applies to reusable helpers at the sink
- `.github/agents/security-auth.agent.md`
  - mirrored the `SEC-15` and `SEC-16` guidance for Copilot Security & Auth runs
- `docs/ai/general/04 - Implementation Agents.md`
  - added implementation guardrails for `SEC-15` and `SEC-16`
- `.github/agents/implementation-agent.agent.md`
  - mirrored the `SEC-15` and `SEC-16` guidance for Copilot implementation runs

## Intentionally Not Updated

- `docs/ai/general/Workflow 11 - Codacy Findings Review Workflow.md`
  - not updated because the workflow already requires durable pattern propagation; the newly confirmed rules affect coding guidance, not workflow sequencing
- `.zenflow/workflows/codacy-findings-review.md`
  - not updated for the same reason; no step ordering or artifact contract changed
- non-security and non-implementation agent prompts
  - not updated because the new rules apply directly to security review and implementation behavior, while `AGENTS.md` remains the primary always-applied context for all agents

## Code Change Scope

- Production code changes made as part of propagation: none
- Test code changes made as part of propagation: none
- Documentation and instruction changes only: yes

## Residual Follow-Up

- Targeted code remediation is still deferred for:
  - `src/app/auth/bootstrap/page.tsx` line 44
  - `src/core/logger/utils.ts` lines 18 and 21
- Codacy scope tuning remains a repository follow-up, not part of this review artifact pass.

## Outcome

- Durable rule propagation completed for the two confirmed guidance gaps.
- The repository instructions now reflect the review outcome instead of relying on one-off chat context.

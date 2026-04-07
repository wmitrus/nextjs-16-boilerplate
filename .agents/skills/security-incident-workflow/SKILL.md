---
name: security-incident-workflow
description: Security-incident workflow for this repository. Use whenever the task is a vulnerability fix, auth bug, authorization gap, tenant or trust-boundary issue, cache leak, provider isolation breach, or other security-sensitive remediation that requires structured specialist sequencing, even if the user does not explicitly ask for a "workflow."
---

# Security Incident Workflow

This is the Codex-native counterpart to:

- `docs/ai/general/Workflow 03 - Security Incident Workflow.md`
- `.github/prompts/security-incident.prompt.md`
- `.zenflow/workflows/security-incident-workflow.md`

Use this skill for security-sensitive investigation and remediation that must preserve
trust boundaries and low blast radius.

## Startup

1. Read `AGENTS.md`.
2. Read `docs/ai/general/MODE_MANIFEST.md`.
3. Read `docs/ai/general/00 - Agent Interaction Protocol.md`.
4. Read `docs/ai/general/REPOSITORY_AI_CONTEXT.md`.
5. Read `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
6. Read `docs/ai/general/Workflow 03 - Security Incident Workflow.md`.

For auth/bootstrap/onboarding incidents:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- read `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`

## Mission

Safely investigate and remediate security incidents, vulnerabilities, auth bugs,
trust-boundary issues, data exposure risks, and cache leaks.

## Working Sequence

1. Incident intake and risk classification
2. Security/Auth review first
3. Conditional Next.js Runtime review
4. Conditional Architecture Guard review
5. Constraint summary
6. Implementation
7. Validation

## Codex Note

When running this in Codex, `08 - Workflow Orchestrator` may coordinate the sequence,
but security authority still belongs to `02 - Security & Auth`.

## Compatibility Notes

- `docs/ai/general/Workflow 03 - Security Incident Workflow.md` remains the shared,
  neutral workflow source
- `.github/prompts/security-incident.prompt.md` remains the Copilot workflow entrypoint
- `.zenflow/workflows/security-incident-workflow.md` remains the ZenFlow execution
  layer
- this skill is the Codex-native runtime surface for the same workflow intent

## Leantime Integration

**This skill participates in the mandatory Leantime workflow.**

At task open and close, the Workflow Orchestrator invokes
`10 - Leantime Integration Agent` (Codex: `leantime-integration` skill).

Reference: `docs/ai/general/LEANTIME_AUTOMATION.md`

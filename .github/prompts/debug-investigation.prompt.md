---
description: 'Gather logs, changed files, and runtime context for an ambiguous bug and route the investigation to 06 - Debug Investigation.'
name: 'Debug Investigation'
argument-hint: 'Bug symptoms, repro notes, suspected area, or logs to emphasize'
agent: '06 - Debug Investigation'
---

> **Leantime Integration Required**
> At task open and close, invoke the `10 - Leantime Integration Agent`.
> Reference: `docs/ai/general/LEANTIME_AUTOMATION.md`

Run `06 - Debug Investigation` for the current issue.

For any auth/bootstrap/onboarding issue:

- read `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md` first
- review `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- use `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` as the mandatory verification checklist for affected scenarios

Workflow:

- First gather the changed file set from the current working tree and, when relevant, the current branch diff against the default branch.
- Gather the most relevant runtime context available in the repository, including logs, diagnostics artifacts, failing tests, or recent debug outputs.
- If I provided bug symptoms, repro notes, environment details, or suspected files, treat them as priority context but still verify the live repository evidence.
- Trace the execution path from the user-visible symptom to the most likely failure boundaries.
- Distinguish confirmed evidence from likely hypotheses and missing evidence.
- Recommend the next best specialist review or diagnostic step instead of jumping directly to implementation unless the root cause is sufficiently clear.

Investigation priorities:

- changed files related to the suspected flow
- relevant logs under `logs/*` when present
- relevant test failures or failing validation commands when present
- runtime entrypoints such as `src/proxy.ts`, route handlers, server actions, layouts, and provider integrations when relevant
- env-driven branching or configuration mismatches when relevant

Required output:

1. Objective
2. Symptom Summary
3. Changed Files Considered
4. Confirmed Evidence
5. Execution Path
6. Source-of-Truth Analysis
7. Likely Failure Points
8. Hypotheses
9. Missing Evidence / Uncertainty
10. Recommended Next Action

Use evidence labels such as:

- Confirmed
- Likely
- Unclear
- Needs verification

If the investigation is blocked, say what evidence is missing and what would reduce uncertainty fastest.

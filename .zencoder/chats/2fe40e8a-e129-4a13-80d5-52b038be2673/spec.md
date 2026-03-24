# Technical Specification — Workflow & Agent Prompt System Audit + Completion

## 1. Technical Context

**Language**: Markdown (`.md`) — no TypeScript or application code changes  
**Runtime**: None — all changes are to documentation and AI governance files  
**Tools affected**: Zencoder (ZenFlow), GitHub Copilot (`.github/agents`, `.github/prompts`)  
**Build impact**: None  
**Test impact**: None (no code tests exist for AI governance files; validation is manual consistency review)

### File ownership map

| Layer                    | Files                   | Tool                                         |
| ------------------------ | ----------------------- | -------------------------------------------- |
| Shared prompt sources    | `docs/ai/general/`      | Both                                         |
| Shared templates         | `docs/ai/templates/`    | Both                                         |
| Zencoder execution layer | `.zenflow/workflows/`   | Zencoder only                                |
| Zencoder thin guides     | `docs/ai/zencoder/`     | Zencoder only                                |
| Copilot agent files      | `.github/agents/`       | Copilot only — DO NOT TOUCH in primary scope |
| Copilot prompts          | `.github/prompts/`      | Copilot only — DO NOT TOUCH in primary scope |
| Copilot instructions     | `.github/instructions/` | Copilot only — DO NOT TOUCH in primary scope |
| Copilot thin guides      | `docs/ai/copilot/`      | Copilot only — DO NOT TOUCH in primary scope |

---

## 2. Implementation Approach

### 2.1 No-regression constraint (applies to every change)

Before committing any change to `docs/ai/general/` or `docs/ai/templates/`, the implementer must verify:

1. No `.github/agents/*.agent.md` file references a path that was renamed or removed
2. No `.github/instructions/*.instructions.md` file references a path that was renamed or removed
3. No `.github/prompts/*.prompt.md` file references a path that was renamed or removed
4. The `.copilot/tasks/{task_id}/` path convention in Copilot files is untouched
5. The MODE_MANIFEST authority order and specialist responsibility boundaries are unchanged

This is a **hard gate** — do not proceed with a change if any of these checks would fail.

### 2.2 Reference model for new content

New files must follow the existing style and conventions:

| New file                                                           | Model to follow                                                                                      |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `docs/ai/templates/security-review-template.md`                    | `docs/ai/templates/architecture-review-template.md` + `docs/ai/templates/runtime-review-template.md` |
| `docs/ai/general/Workflow 04 - Incident Investigation Workflow.md` | `docs/ai/general/Workflow 01 - Safe Feature Workflow.md`                                             |
| MODE_MANIFEST new modes                                            | Existing mode entries (e.g., `security-incident-workflow` mode)                                      |
| `.zenflow/workflows/incident-investigation.md` fixes               | Other ZenFlow workflows (e.g., `feature-development.md`)                                             |

---

## 3. Changes — Detailed Specification

### Task A: Fill `security-review-template.md`

**File**: `docs/ai/templates/security-review-template.md`  
**Type**: New content (file exists but is empty)  
**Affects**: Both tools  
**⚠️ Copilot safety**: Adding content to an empty file cannot break Copilot. Safe.

**Content model**: Follow the same section-heading pattern as `architecture-review-template.md` and `runtime-review-template.md`.

Required sections:

```
# Security Review

## Task
## Security Surface Classification
## Auth / Identity Surface
## Authorization Surface
## Tenant / Organization Surface
## Provider Isolation Check
## Trust Boundaries
## Sensitive Data Handling
## Server Action / Route Handler Enforcement
## Security Constraints
## Recommendation
```

Each section must include:

- a brief description of what the agent should evaluate
- possible outcomes where binary decisions are needed (Safe / Risky / Blocked)
- examples of what to check

---

### Task B: Add `incident-investigation` mode to MODE_MANIFEST

**File**: `docs/ai/general/MODE_MANIFEST.md`  
**Type**: Additive — insert new mode section  
**Affects**: Both tools (shared file)  
**⚠️ Copilot safety**: Adding a new mode section is additive and non-breaking. Copilot `.github/agents/` and `.github/prompts/` do not reference MODE_MANIFEST mode IDs by name, so this addition does not affect them.

**Placement**: Insert before the `## Mode selection rules` section (after the last existing mode entry), consistent with all other mode entries.

**Mode ID**: `incident-investigation`

Required fields (match existing mode structure):

- Purpose
- Use when
- Primary workflow file: `docs/ai/general/Workflow 04 - Incident Investigation Workflow.md`
- Required governing files (including `06 - Debug Investigation Agent.md`)
- Specialist sequence
- Required outputs

**Specialist sequence for this mode**:

1. Debug Investigation Agent first (evidence gathering)
2. Next.js Runtime Agent (if runtime behavior is involved)
3. Architecture Guard Agent (if proposed fix risks architectural regression)
4. Implementation Agent (after remediation is scoped)

---

### Task C: Add `debug-investigation` mode to MODE_MANIFEST

**File**: `docs/ai/general/MODE_MANIFEST.md`  
**Type**: Additive — insert new mode section  
**Affects**: Both tools (shared file)  
**⚠️ Copilot safety**: Same reasoning as Task B — additive, non-breaking.

**Placement**: Insert before `incident-investigation` mode (logically: debug is a pre-investigation mode, investigation is a full workflow).

**Mode ID**: `debug-investigation`

Required fields:

- Purpose: standalone evidence-gathering and ambiguity-reduction run (not a full incident workflow)
- Use when: investigation is needed before any specialist can decide
- Primary authority: Debug Investigation Agent
- Required governing files (including `06 - Debug Investigation Agent.md`)
- Required outputs (evidence, execution path, hypotheses, recommended next action)

Note: This mode does NOT produce a full implementation. Its output feeds other modes.

---

### Task D: Update `workflow-task` mode in MODE_MANIFEST — tool-agnostic path note

**File**: `docs/ai/general/MODE_MANIFEST.md`  
**Type**: Minor additive clarification — no structural changes  
**Affects**: Both tools (shared file)  
**⚠️ Copilot safety**: The `.copilot/tasks/{task_id}/` reference must be preserved. The change only adds a clarifying note that the path is tool-specific. Copilot behavior is unchanged.

**Change**: In the `workflow-task` mode section, where `.copilot/tasks/{task_id}/` is mentioned, add a parenthetical note:

```
artifacts should live under `.copilot/tasks/{task_id}/` (for GitHub Copilot) or `.zenflow/tasks/{task_id}/` (for Zencoder) depending on the active tool
```

---

### Task E: Create `Workflow 04 - Incident Investigation Workflow.md`

**File**: `docs/ai/general/Workflow 04 - Incident Investigation Workflow.md`  
**Type**: New file  
**Affects**: Zencoder primarily; portable across tools  
**⚠️ Copilot safety**: New file in `docs/ai/general/`. Does not remove or rename any file referenced by `.github/` files. Safe.

**Model**: Follow the structure of `docs/ai/general/Workflow 01 - Safe Feature Workflow.md`.

Required sections:

- Workflow Name, Purpose, Mode ID, Available agents
- Before running: governing files to read
- Workflow Goal
- Workflow Principles
- When to use / When NOT to use
- Expected user input
- Fast path (if applicable — likely skip for incident investigation)
- Ordered Workflow Steps
- Decision / Branching Rules
- Outputs produced
- Failure / Block conditions
- Execution Style
- Success Criteria

**Ordered workflow steps** (derived from `.zenflow/workflows/incident-investigation.md` and expanded):

1. **Incident Intake** — collect symptom, environment, reproduction steps, logs, affected areas
2. **Debug Investigation** — trace execution path, gather evidence, reduce ambiguity
3. **Runtime Behavior Review** _(conditional)_ — analyze App Router, proxy, caching, server/client if the failure involves runtime behavior
4. **Architecture Impact Review** _(conditional)_ — verify proposed fix does not violate module boundaries or DI
5. **Remediation Plan** — define the smallest safe fix scope with explicit change scope, affected files, risks
6. **Implementation** — apply the fix, update tests
7. **Validation** — run typecheck, lint, test, and architecture lint

**Key branching rules**:

- Debug Investigation always runs first — never skip it for ambiguous bugs
- Runtime Review is conditional on symptoms involving routing, caching, server/client behavior
- Architecture Review is conditional on the proposed fix touching boundaries or DI
- Implementation never starts without a remediation plan

---

### Task F: Fix `.zenflow/workflows/incident-investigation.md` — artifacts path

**File**: `.zenflow/workflows/incident-investigation.md`  
**Type**: Fix — change artifacts path  
**Affects**: Zencoder only  
**⚠️ Copilot safety**: `.zenflow/` files are not referenced by any `.github/` file. Fully isolated. Safe.

**Change**: Replace all occurrences of `docs/workflows/{task_id}` with `.zenflow/tasks/{task_id}`.

Current (wrong):

```
- **Artifacts Path**: {@artifacts_path} → `docs/workflows/{task_id}`
```

Correct:

```
- **Artifacts Path**: {@artifacts_path} → `.zenflow/tasks/{task_id}`
```

Also update all `{@artifacts_path}` output file references accordingly if they contain hardcoded paths.

---

### Task G: Fix `.zenflow/workflows/incident-investigation.md` — Artifact Execution Rule placement

**File**: `.zenflow/workflows/incident-investigation.md`  
**Type**: Structural fix — move section  
**Affects**: Zencoder only  
**⚠️ Copilot safety**: Same as Task F. Safe.

**Change**: Move the "Artifact Execution Rule" block from its current mid-file position (between Step 1 and Step 2) to immediately after the `## Configuration` section and before the first `## Workflow Steps` step.

Target structure after fix:

```
## Configuration
...

## Artifact Execution Rule
...

## Workflow Steps

### [ ] Step: Incident Intake
...
```

---

### Task H: Update `docs/ai/zencoder/README.md`

**File**: `docs/ai/zencoder/README.md`  
**Type**: Documentation update  
**Affects**: Zencoder only  
**⚠️ Copilot safety**: `docs/ai/zencoder/` is not referenced by any `.github/` file. Safe.

**Changes**:

1. Add `Workflow 04 - Incident Investigation Workflow.md` to the "Neutral Workflow Spec" list
2. Update the count from "3 neutral workflow specs" to "4 neutral workflow specs" where mentioned
3. Add `Workflow 04` to the "Available ZenFlow Workflows" section with the appropriate link

---

### Task I (Optional): Create `.github/prompts/incident-investigation.prompt.md`

**File**: `.github/prompts/incident-investigation.prompt.md`  
**Type**: New Copilot prompt file  
**Affects**: Copilot only  
**⚠️ Copilot safety**: Additive. Does not remove or modify existing prompts. Does not affect Zencoder.

**Model**: Follow the structure of `.github/prompts/workflow-task.prompt.md` but scoped to incident investigation.

The prompt should:

- Route to `08 - Workflow Orchestrator`
- Direct it to run the incident investigation specialist sequence
- Accept symptom, logs, repro notes, or affected areas as input
- Reference `docs/ai/general/Workflow 04 - Incident Investigation Workflow.md` as the workflow
- Include auth-flow note for incident-investigation work touching Clerk/auth

---

### Task J (Optional): Update `docs/ai/copilot/README.md`

**File**: `docs/ai/copilot/README.md`  
**Type**: Documentation update  
**Affects**: Copilot only  
**Dependency**: Task I must be done first  
**⚠️ Copilot safety**: Additive. Safe.

**Changes**:

1. Add `/Incident Investigation` to the "Available Slash Prompts" list
2. Add a starting-point recommendation: "general incident debugging → Incident Investigation"

---

## 4. Source Code Structure Changes

No application source files change.

Files created or modified:

| #   | Action                | File                                                               |
| --- | --------------------- | ------------------------------------------------------------------ |
| A   | Modify (fill content) | `docs/ai/templates/security-review-template.md`                    |
| B   | Modify (add mode)     | `docs/ai/general/MODE_MANIFEST.md`                                 |
| C   | Modify (add mode)     | `docs/ai/general/MODE_MANIFEST.md`                                 |
| D   | Modify (add note)     | `docs/ai/general/MODE_MANIFEST.md`                                 |
| E   | Create                | `docs/ai/general/Workflow 04 - Incident Investigation Workflow.md` |
| F   | Modify (fix path)     | `.zenflow/workflows/incident-investigation.md`                     |
| G   | Modify (move section) | `.zenflow/workflows/incident-investigation.md`                     |
| H   | Modify (doc update)   | `docs/ai/zencoder/README.md`                                       |
| I   | Create (optional)     | `.github/prompts/incident-investigation.prompt.md`                 |
| J   | Modify (optional)     | `docs/ai/copilot/README.md`                                        |

---

## 5. Delivery Phases

### Phase 1: Templates and shared governance (Tasks A, B, C, D)

Fix the shared files that affect both tools. These are highest priority.

- Fill `security-review-template.md`
- Add `incident-investigation` mode to MODE_MANIFEST
- Add `debug-investigation` mode to MODE_MANIFEST
- Add tool-path note to `workflow-task` mode

**Verification**: After Phase 1, manually scan `.github/agents/`, `.github/prompts/`, `.github/instructions/` to confirm no referenced paths were broken.

### Phase 2: New neutral workflow spec (Task E)

Create `Workflow 04 - Incident Investigation Workflow.md`.

**Verification**: Cross-check that the new workflow spec references the same governing files as Workflows 01–03. Confirm MODE_MANIFEST entry (from Phase 1) points to this file correctly.

### Phase 3: ZenFlow-only fixes (Tasks F, G, H)

Fix and clean up the `incident-investigation.md` ZenFlow workflow. Update the Zencoder README.

**Verification**: Confirm all ZenFlow workflows consistently use `.zenflow/tasks/{task_id}/`. Confirm Artifact Execution Rule is in the correct position. Confirm `docs/ai/zencoder/README.md` references Workflow 04.

### Phase 4 (Optional): Copilot improvements (Tasks I, J)

Add the incident investigation prompt for Copilot. Update `docs/ai/copilot/README.md`.

**Verification**: Confirm the new prompt follows the same frontmatter format as other `.github/prompts/` files. Confirm `docs/ai/copilot/README.md` links are correct.

---

## 6. Verification Approach

Since there are no code tests for AI governance files, verification is manual and consistency-based:

### Cross-reference checks (must pass after every task)

1. **Path integrity**: Every file path mentioned in any changed file must actually exist in the repository
2. **Copilot isolation**: Run a search for any `.copilot/tasks/` reference in `.zenflow/` files — must be zero
3. **ZenFlow isolation**: Run a search for any `.zenflow/tasks/` reference in `.github/` files — must be zero
4. **MODE_MANIFEST completeness**: All four ZenFlow workflows must have a corresponding named mode in MODE_MANIFEST after Phase 1+2
5. **Template consistency**: The new `security-review-template.md` must follow the same structural pattern as `architecture-review-template.md` and `runtime-review-template.md`
6. **Workflow 04 consistency**: Compare Workflow 04 section headings against Workflow 01 to confirm structural parity

### Authority model integrity check

After all phases:

- MODE_MANIFEST authority order (Architecture Guard → Security/Auth → Runtime → Validation → Implementation) must be unchanged
- The `debug-investigation` mode must clearly state it does NOT replace specialist authority — it feeds it
- The `incident-investigation` mode must clearly route Debug Investigation first

### Final Copilot safety check

After all primary phases, verify:

- `git diff --name-only` shows no changes in `.github/agents/`, `.github/instructions/`, `.github/prompts/` (for primary scope)
- No `.github/` file references were added or removed from any shared file

---

---

# Phase 2 — Full Workflow Set Expansion: Technical Specification

_Added after Phase 1 completion._

---

## P2.1 Technical Context

**Files affected**: Markdown only — no TypeScript or application source changes  
**Tools affected**: Both (shared general spec files); Zencoder only (ZenFlow files)  
**Build impact**: None  
**Test impact**: None

### New file reference model

All new files must follow the pattern of an existing peer in the same directory:

| New file                                               | Model file                                               |
| ------------------------------------------------------ | -------------------------------------------------------- |
| `docs/ai/general/Workflow 05–09`                       | `docs/ai/general/Workflow 01 - Safe Feature Workflow.md` |
| `.zenflow/workflows/auth-flow-change-review.md`        | `.zenflow/workflows/security-incident-workflow.md`       |
| `.zenflow/workflows/playwright-e2e-validation.md`      | `.zenflow/workflows/feature-development.md`              |
| `.zenflow/workflows/change-validation.md`              | `.zenflow/workflows/feature-development.md`              |
| `.zenflow/workflows/repository-baseline-validation.md` | `.zenflow/workflows/feature-development.md`              |
| `.zenflow/workflows/architecture-lint.md`              | `.zenflow/workflows/feature-development.md`              |

---

## P2.2 Fixes to Existing ZenFlow Workflows

### P2-TaskA: Add preamble to all 4 existing ZenFlow workflows

**Files**:

- `.zenflow/workflows/feature-development.md`
- `.zenflow/workflows/safe-refactor.md`
- `.zenflow/workflows/security-incident-workflow.md`
- `.zenflow/workflows/incident-investigation.md`

**Change**: After the `## Configuration` block and before `## Workflow Steps` (or `## Artifact Execution Rule`), add:

```markdown
## Before Running

Before starting this workflow, read:

- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`

Repository note:
In Next.js 16, `src/proxy.ts` is the valid middleware-equivalent file.
Analyze `src/proxy.ts` directly for request interception, redirect, auth pre-processing, and security header behavior.
Do not treat the absence of `middleware.ts` as a finding.
```

**⚠️ Copilot safety**: `.zenflow/` files not referenced by `.github/`. Safe.

### P2-TaskB: Add Validation Strategy step to `incident-investigation.md`

**File**: `.zenflow/workflows/incident-investigation.md`

**Change**: Add a new step between `Remediation Plan` and `Implementation`:

```markdown
### [ ] Step: Validation Strategy

Run **Validation Strategy Agent** to determine the minimum safe validation scope for the remediation.

Output:
{@artifacts_path}/validation-strategy.md

Include:

- change risk classification
- minimum required validation
- optional additional validation
- validation not required
- validation commands or checks
```

**⚠️ Copilot safety**: Safe (ZenFlow only).

---

## P2.3 New General Workflow Specs (shared, both tools)

All new specs must include these standard sections matching Workflow 01–04:

- Workflow Name, Purpose, Mode ID, Available agents
- Before running: 3 standard governing files
- Repository Note about `src/proxy.ts`
- Workflow Goal
- Workflow Principles
- When to use / When NOT to use
- Expected user input
- Ordered workflow steps with conditional branching
- Outputs produced
- Success criteria

### P2-TaskC: `Workflow 05 - Auth Flow Change Review Workflow.md`

**Mode ID**: `auth-flow-change-review`

**Available agents**: Security/Auth Agent, Architecture Guard Agent, Next.js Runtime Agent, Playwright E2E Agent

**Additional "Before running" files** (beyond the standard 3):

- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`

**Ordered workflow steps**:

1. **Change Intake** — collect changed file set, symptoms, risks, affected auth/bootstrap/onboarding paths
2. **Auth Surface Analysis** — Security/Auth Agent maps the change to matrix scenarios; identifies trust-boundary, redirect-flow, runtime-sensitive risks
3. **Runtime Behavior Review** _(conditional)_ — Next.js Runtime Agent when routing, server/client placement, or caching is involved in the auth path
4. **Architecture Impact Review** _(conditional)_ — Architecture Guard when the change touches module boundaries, DI, or composition
5. **Matrix Verification Sign-Off** — explicitly check each affected matrix scenario; state Verified / Deferred / Blocked per scenario
6. **Playwright E2E Verification** _(conditional)_ — run browser verification against affected matrix scenarios when evidence is required

**Key constraint**: Do not mark complete unless all affected matrix scenarios are either verified or explicitly deferred/blocked.

### P2-TaskD: `Workflow 06 - Playwright E2E Validation Workflow.md`

**Mode ID**: `playwright-e2e-validation`

**Available agents**: Playwright E2E Agent

**Ordered workflow steps**:

1. **Verification Intake** — collect task context, scenario checklist, affected paths, environment notes; read task artifacts from active chat workspace
2. **Scenario Scope Definition** — identify the smallest Playwright scope that covers the risk; explicitly list scenarios to test, defer, or skip
3. **Precondition Check** — confirm environment is ready (dev server, auth credentials, test user state)
4. **Playwright Execution** — run the identified scenarios; capture commands, URLs, logs, reports, traces, screenshots
5. **Evidence Collection** — produce structured evidence: scenario status mapping (Pass/Fail/Blocked), commands run, and artifact links
6. **Gap Report** — explicitly state scenarios deferred or blocked with reason

**Key constraint**: Do not mark verified unless required scenarios are actually checked or explicitly deferred/blocked.

### P2-TaskE: `Workflow 07 - Change Validation Workflow.md`

**Mode ID**: `change-validation`

**Available agents**: Validation Strategy Agent

**Ordered workflow steps**:

1. **Change Intake** — determine changed file set from working tree; collect any user-provided risk notes or context
2. **Validation Risk Assessment** — Validation Strategy Agent classifies the change risk and identifies affected test layers
3. **Scope Definition** — produce minimum required, optional, and not-required validation lists
4. **Validation Execution** — run the minimum required validation commands; capture output
5. **Result Report** — state pass/fail/blocked per validation check; list any gaps

**Key constraint**: If validation scope depends on unresolved architecture or security decisions, state the block explicitly before execution.

### P2-TaskF: `Workflow 08 - Repository Baseline Validation Workflow.md`

**Mode ID**: `repository-baseline-validation`

**Available agents**: Validation Strategy Agent, Architecture Guard Agent

**Ordered workflow steps**:

1. **Baseline Intake** — collect scope: full repo audit vs targeted modules; any known concerns or prior issues
2. **Validation Posture Audit** — Validation Strategy Agent reviews the full validation stack: test layers, CI checks, coverage, and command inventory
3. **Architecture Boundary Audit** — Architecture Guard Agent performs a boundary lint pass to identify gaps that validation should cover
4. **Risk and Gap Assessment** — combine validation and architecture findings into a prioritized gap list
5. **Recommendations** — produce actionable recommendations: validation improvements, CI enhancements, coverage gaps
6. **Output Report** — validation posture summary, risk assessment, recommendations, and next action

### P2-TaskG: `Workflow 09 - Architecture Lint Workflow.md`

**Mode ID**: `architecture-lint`

**Available agents**: Architecture Guard Agent

**Ordered workflow steps**:

1. **Lint Intake** — define lint scope: full repo, specific modules, or post-change boundary check; collect any prior findings
2. **Structure Inspection** — Architecture Guard inspects module boundaries, dependency direction, import patterns, and DI/composition discipline
3. **Contract and Provider Audit** — inspect core contracts, composition root, auth provider isolation, and security placement
4. **Findings Classification** — classify all findings as CRITICAL / MAJOR / MINOR / INFORMATIONAL
5. **Docs vs Code Drift Check** — compare documentation claims against live code
6. **Output Report** — lint results, confirmed violations, suspicious patterns, acceptable exceptions, recommended next action

**Key constraint**: This is a read-only lint mode. Implementation of fixes is NOT part of this workflow.

---

## P2.4 New ZenFlow Execution Files

Each ZenFlow file must follow this structure:

```
## Configuration
- Artifacts Path: {@artifacts_path} → `.zencoder/chats/{chat_id}`

## Before Running
[standard preamble + any workflow-specific files]

## Artifact Execution Rule
[standard artifact writing requirement]

## Workflow Steps
[step checkboxes with Output: and Include: per step]
```

### P2-TaskH: `.zenflow/workflows/auth-flow-change-review.md`

This is the most critical new ZenFlow workflow. It mirrors Workflow 05 with Zencoder-specific execution format.

**Additional preamble files** (beyond standard 3):

```
- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`
```

**Steps and their output files**:

1. Change Intake → `{@artifacts_path}/auth-change-intake.md`
2. Auth Surface Analysis → `{@artifacts_path}/auth-surface-analysis.md`
3. Runtime Behavior Review _(conditional)_ → `{@artifacts_path}/runtime-review.md`
4. Architecture Impact Review _(conditional)_ → `{@artifacts_path}/architecture-review.md`
5. Matrix Verification Sign-Off → `{@artifacts_path}/matrix-verification.md`
6. Playwright E2E Verification _(conditional)_ → `{@artifacts_path}/playwright-verification.md`

### P2-TaskI: `.zenflow/workflows/playwright-e2e-validation.md`

**Steps and their output files**:

1. Verification Intake → `{@artifacts_path}/verification-intake.md`
2. Scenario Scope Definition → `{@artifacts_path}/scenario-scope.md`
3. Precondition Check → `{@artifacts_path}/preconditions.md`
4. Playwright Execution → `{@artifacts_path}/playwright-execution.md`
5. Evidence Collection → `{@artifacts_path}/evidence-report.md`
6. Gap Report → `{@artifacts_path}/gap-report.md`

### P2-TaskJ: `.zenflow/workflows/change-validation.md`

**Steps and their output files**:

1. Change Intake → `{@artifacts_path}/change-intake.md`
2. Validation Risk Assessment → `{@artifacts_path}/validation-risk.md`
3. Scope Definition → `{@artifacts_path}/validation-scope.md`
4. Validation Execution → `{@artifacts_path}/validation-execution.md`
5. Result Report → `{@artifacts_path}/validation-report.md`

### P2-TaskK: `.zenflow/workflows/repository-baseline-validation.md`

**Steps and their output files**:

1. Baseline Intake → `{@artifacts_path}/baseline-intake.md`
2. Validation Posture Audit → `{@artifacts_path}/validation-posture.md`
3. Architecture Boundary Audit → `{@artifacts_path}/architecture-audit.md`
4. Risk and Gap Assessment → `{@artifacts_path}/risk-assessment.md`
5. Recommendations → `{@artifacts_path}/recommendations.md`
6. Output Report → `{@artifacts_path}/baseline-report.md`

### P2-TaskL: `.zenflow/workflows/architecture-lint.md`

**Steps and their output files**:

1. Lint Intake → `{@artifacts_path}/lint-intake.md`
2. Structure Inspection → `{@artifacts_path}/structure-inspection.md`
3. Contract and Provider Audit → `{@artifacts_path}/contract-audit.md`
4. Findings Classification → `{@artifacts_path}/findings.md`
5. Docs vs Code Drift Check → `{@artifacts_path}/drift-report.md`
6. Output Report → `{@artifacts_path}/architecture-lint-report.md`

---

## P2.5 MODE_MANIFEST Addition

### P2-TaskM: Add `auth-flow-change-review` mode

**File**: `docs/ai/general/MODE_MANIFEST.md`

**Placement**: Insert between `playwright-e2e-validation` mode and `workflow-task` mode.

**Content** (following existing mode structure):

```
### Mode: `auth-flow-change-review`

Purpose:
- review auth/bootstrap/onboarding changes against anti-patterns and the verification matrix before implementation or sign-off

Use when:
- a change touches Clerk auth, bootstrap routing, onboarding redirects, auth middleware, root auth layout boundaries, or /users access control
- auth-routing behavior may change
- trust-boundary or redirect-flow risks are present in the changed path
- the matrix sign-off is required before the change is considered safe

Primary authority:
- Security/Auth Agent

Required governing files:
- docs/ai/general/MODE_MANIFEST.md
- docs/ai/general/00 - Agent Interaction Protocol.md
- docs/ai/general/REPOSITORY_AI_CONTEXT.md
- docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md
- docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md
- docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md
- docs/ai/general/02 - Security & Auth Agent.md
- docs/ai/general/Workflow 05 - Auth Flow Change Review Workflow.md

Specialist sequence:
- Security/Auth Agent first — map the change to matrix scenarios and identify trust-boundary risks
- Next.js Runtime Agent when routing, server/client placement, or caching is involved
- Architecture Guard Agent when the change touches module boundaries or DI
- Playwright E2E Agent when browser-level verification evidence is required

Required outputs:
- changed files considered
- trust-boundary assessment
- affected matrix scenarios (with scenario IDs)
- required verification before sign-off
- conditional runtime and architecture summaries
- matrix verification sign-off (Verified / Deferred / Blocked per scenario)
- risks
- recommended next action
```

**Also update Mode selection rules**: Insert `auth-flow-change-review` as rule #1 (before `security-incident-workflow`):

```
1. If the task is a change to Clerk auth, bootstrap routing, onboarding, auth middleware, root auth layout, or /users access control, use `auth-flow-change-review`.
```

Renumber existing rules 1–10 to 2–11.

---

## P2.6 Documentation Updates

### P2-TaskN: Update `docs/ai/zencoder/README.md`

Add 5 new workflow entries to the ZenFlow Workflows section:

- auth-flow change review → `auth-flow-change-review.md`
- playwright E2E validation → `playwright-e2e-validation.md`
- change validation → `change-validation.md`
- repository baseline validation → `repository-baseline-validation.md`
- architecture lint → `architecture-lint.md`

Add 5 new neutral spec entries to the Neutral Workflow Spec section (Workflows 05–09).

Update the Recommended Universal Flow to mention `auth-flow-change-review` for Clerk/auth changes.

---

## P2.7 Verification Approach

### Cross-reference checks (run after all P2 tasks)

1. All 9 ZenFlow files use `{@artifacts_path} → .zencoder/chats/{chat_id}`
2. All 9 general spec files exist in `docs/ai/general/`
3. MODE_MANIFEST has `auth-flow-change-review` mode with correct position in selection rules
4. MODE_MANIFEST selection rules count is 11 (10 existing → +1 auth-flow-change-review as rule #1)
5. No `.github/` file references added to shared files
6. No `.github/agents/`, `.github/instructions/`, `.github/prompts/` files modified
7. `docs/ai/zencoder/README.md` lists all 9 workflows correctly

### Quality checks

- Each new general spec has the standard proxy note and 3 governing files in Before Running
- Auth Flow Change Review (Workflow 05 + ZenFlow) explicitly references all 3 auth-flow docs
- Architecture Lint workflow explicitly forbids implementation
- Playwright E2E workflow explicitly requires evidence capture

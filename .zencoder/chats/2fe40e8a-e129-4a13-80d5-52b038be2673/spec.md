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

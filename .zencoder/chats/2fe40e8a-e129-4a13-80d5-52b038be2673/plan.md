# AI Agent System — Audit, Parity & Completion Plan

## Context

- **Requirements**: `.zencoder/chats/2fe40e8a-e129-4a13-80d5-52b038be2673/requirements.md`
- **Technical Spec**: `.zencoder/chats/2fe40e8a-e129-4a13-80d5-52b038be2673/spec.md`

## Workflow Steps

### [x] Step: Requirements

Create a Product Requirements Document (PRD) based on the feature description.

Saved to `.zencoder/chats/2fe40e8a-e129-4a13-80d5-52b038be2673/requirements.md`.

### [x] Step: Technical Specification

Create a technical specification based on the PRD.

Saved to `.zencoder/chats/2fe40e8a-e129-4a13-80d5-52b038be2673/spec.md`.

### [x] Step: Planning

Create a detailed implementation plan. Documented below.

---

## Implementation Tasks

> ⚠️ **Dual-tool safety reminder**: Tasks marked `[SHARED]` touch `docs/ai/general/` or `docs/ai/templates/` which affect BOTH Copilot and Zencoder. Before and after each shared-file task, verify that no path referenced in `.github/agents/`, `.github/instructions/`, or `.github/prompts/` was altered.

---

### Group 1 — Shared File Fixes (Both Tools)

#### [x] Task 1.1 — Fill `security-review-template.md` `[SHARED]`

**File**: `docs/ai/templates/security-review-template.md`  
**Action**: Add full template content (currently empty/0 bytes)  
**Model**: Follow structure of `architecture-review-template.md` and `runtime-review-template.md`  
**Required sections**: Task, Security Surface Classification, Auth/Identity Surface, Authorization Surface, Tenant/Organization Surface, Provider Isolation Check, Trust Boundaries, Sensitive Data Handling, Server Action / Route Handler Enforcement, Security Constraints, Recommendation  
**⚠️ Copilot safety**: Additive to empty file — cannot break Copilot  
**Verification**: File is non-empty; sections follow the template pattern of sibling files

---

#### [x] Task 1.2 — Fix `ARTIFACTS_GUIDE.md` — tool-agnostic title and path `[SHARED]`

**File**: `docs/ai/general/ARTIFACTS_GUIDE.md`  
**Action**: Update title from "ZenFlow Artifacts Guide" to "Task Artifacts Guide"; update default location section to clearly document both `.copilot/tasks/{task_id}/` (Copilot) and `.zenflow/tasks/{task_id}/` (Zencoder)  
**⚠️ Copilot safety**: Content update only; no paths are removed. Copilot agents that read this file will now see both tool paths clearly stated.  
**Verification**: Title is tool-agnostic; both artifact paths are documented; no existing content is removed

---

#### [x] Task 1.3 — Add modes to `MODE_MANIFEST.md` `[SHARED]`

**File**: `docs/ai/general/MODE_MANIFEST.md`  
**Action**: Three additive changes in a single task:

1. Add `debug-investigation` mode entry (before `incident-investigation`)
2. Add `incident-investigation` mode entry (references `Workflow 04`)
3. Update `workflow-task` mode — add note that artifact path is tool-specific

**Placement**: Insert both new modes before `## Mode selection rules`; update `workflow-task` inline  
**⚠️ Copilot safety**: All changes are additive. Mode IDs are not referenced by `.github/agents/` or `.github/prompts/` frontmatter. Authority order is preserved.  
**Verification**: MODE_MANIFEST now has all 4 ZenFlow workflows registered as named modes; `workflow-task` mode clearly states both tool paths; authority order is unchanged

---

#### [x] Task 1.4 — Create `Workflow 04 - Incident Investigation Workflow.md` `[SHARED]`

**File**: `docs/ai/general/Workflow 04 - Incident Investigation Workflow.md`  
**Action**: Create new neutral platform-agnostic workflow spec  
**Model**: Follow structure of `Workflow 01 - Safe Feature Workflow.md`  
**Mode ID**: `incident-investigation`  
**Specialist sequence**: Debug Investigation (always first) → Next.js Runtime (conditional) → Architecture Guard (conditional) → Implementation  
**Key principle**: Debug Investigation is mandatory — never skip for ambiguous bugs  
**⚠️ Copilot safety**: New file only; no existing files are modified  
**Verification**: File structure matches Workflow 01–03; MODE_MANIFEST entry from Task 1.3 points to this file correctly

---

### Group 2 — Zencoder-Only Fixes

#### [x] Task 2.1 — Fix `incident-investigation.md` — path + structure `[ZENCODER ONLY]`

**File**: `.zenflow/workflows/incident-investigation.md`  
**Action**: Two fixes in one task:

1. Change artifacts path from `docs/workflows/{task_id}` → `.zenflow/tasks/{task_id}`
2. Move "Artifact Execution Rule" section to before Step 1 (currently mid-file)

**⚠️ Copilot safety**: `.zenflow/` files are not referenced by any `.github/` file. Fully isolated.  
**Verification**: All 4 ZenFlow workflows consistently use `.zenflow/tasks/{task_id}/`; Artifact Execution Rule appears before first step

---

#### [x] Task 2.2 — Add three new `.zencoder/rules/` files `[ZENCODER ONLY]`

**Files**:

- `.zencoder/rules/agent-delegation.md`
- `.zencoder/rules/agent-artifacts.md`
- `.zencoder/rules/implementation-validation.md`

**Action**: Create three new always-on rule files that give every Zencoder session the same structural workflow discipline that Copilot's `.github/instructions/` files provide

**Design constraints**:

- Each file must have frontmatter with `alwaysApply: true` and a `description`
- `agent-delegation.md`: Adapt from `agent-delegation.instructions.md` — same delegation rules, but reference `.zenflow/tasks/` and ZenFlow workflows, NOT `.copilot/tasks/`
- `agent-artifacts.md`: Adapt from `agent-artifacts.instructions.md` — same artifact discipline, but use `.zenflow/tasks/{task_id}/` path
- `implementation-validation.md`: Adapt from `implementation-validation.instructions.md` — can be nearly identical since it references shared governance files

**⚠️ Copilot safety**: `.zencoder/rules/` is not referenced by any `.github/` file. Fully isolated.  
**Verification**: Each file has `alwaysApply: true`; no file references `.copilot/tasks/`; content is consistent with `docs/ai/general/00 - Agent Interaction Protocol.md`

---

#### [x] Task 2.3 — Update `.zencoder/rules/repo.md` title `[ZENCODER ONLY]`

**File**: `.zencoder/rules/repo.md`  
**Action**: Update the `# temp-nextjs-scaffold Information` title to reflect the actual production boilerplate identity (e.g., `# Next.js 16 Modular Monolith Boilerplate`)  
**⚠️ Copilot safety**: `.zencoder/rules/` not referenced by Copilot. Safe.  
**Verification**: Title accurately reflects the production project identity

---

#### [x] Task 2.4 — Update `docs/ai/zencoder/README.md` `[ZENCODER ONLY]`

**File**: `docs/ai/zencoder/README.md`  
**Action**:

1. Add `Workflow 04 - Incident Investigation Workflow.md` to the "Neutral Workflow Spec" list
2. Update the neutral spec count from 3 to 4
3. Add the `incident-investigation` workflow to the "Available ZenFlow Workflows" section with link

**⚠️ Copilot safety**: `docs/ai/zencoder/` is not referenced by any `.github/` file. Safe.  
**Verification**: README accurately reflects all 4 neutral specs and all 4 ZenFlow workflows

---

### Group 3 — Optional A: Copilot Prompt Parity

#### [x] Task 3.1 — Create `safe-refactor.prompt.md` `[COPILOT ONLY]`

**File**: `.github/prompts/safe-refactor.prompt.md`  
**Action**: Create new Copilot slash prompt for safe refactor tasks  
**Routes to**: `08 - Workflow Orchestrator`  
**Model**: Follow structure of `workflow-task.prompt.md` but scoped to behavior-preserving refactor work  
**Frontmatter**: `name: 'Safe Refactor'`, `argument-hint: 'Refactor description, affected modules, expected invariants, or risks'`, `agent: '08 - Workflow Orchestrator'`  
**Key behavior**: Direct orchestrator to run the safe-refactor sequence; protect invariants; implementation only after constraints clear  
**⚠️ Zencoder safety**: `.github/prompts/` not referenced by Zencoder. Safe.  
**Verification**: Frontmatter format matches existing prompts; agent binding is correct

---

#### [x] Task 3.2 — Create `security-incident.prompt.md` `[COPILOT ONLY]`

**File**: `.github/prompts/security-incident.prompt.md`  
**Action**: Create new Copilot slash prompt for security incident remediation  
**Routes to**: `08 - Workflow Orchestrator`  
**Model**: Follow structure of `workflow-task.prompt.md` but scoped to security incident flow  
**Frontmatter**: `name: 'Security Incident'`, `argument-hint: 'Incident description, affected surface, severity, symptoms, or constraints'`, `agent: '08 - Workflow Orchestrator'`  
**Key behavior**: Security/Auth first; escalate to Architecture Guard for remediation risk; Implementation only after remediation is scoped  
**⚠️ Zencoder safety**: Safe.  
**Verification**: Frontmatter format matches existing prompts; workflow sequence matches `security-incident-workflow.md` intent

---

#### [x] Task 3.3 — Create `incident-investigation.prompt.md` `[COPILOT ONLY]`

**File**: `.github/prompts/incident-investigation.prompt.md`  
**Action**: Create new Copilot slash prompt for general incident investigation  
**Routes to**: `08 - Workflow Orchestrator`  
**Model**: Complement `debug-investigation.prompt.md` (evidence gathering) with a full orchestrated incident investigation flow  
**Frontmatter**: `name: 'Incident Investigation'`, `argument-hint: 'Incident symptoms, logs, repro notes, affected areas, or environment context'`, `agent: '08 - Workflow Orchestrator'`  
**Key behavior**: Debug Investigation always first; conditional Runtime and Architecture reviews; ends with Implementation and Validation  
**⚠️ Zencoder safety**: Safe.  
**Verification**: Frontmatter format matches existing prompts; distinguishable from `debug-investigation.prompt.md` (which is standalone evidence gathering, not full orchestration)

---

#### [x] Task 3.4 — Update `docs/ai/copilot/README.md` `[COPILOT ONLY]`

**File**: `docs/ai/copilot/README.md`  
**Action**: Add the three new prompts to the "Available Slash Prompts" section with descriptions and links  
**⚠️ Zencoder safety**: `docs/ai/copilot/` not referenced by Zencoder. Safe.  
**Verification**: README lists all new prompts correctly; links are valid

---

### Group 4 — Optional B: Thin Guide Enrichment

#### [x] Task 4.1 — Add "Example use cases" to `docs/ai/zencoder/01–09` `[ZENCODER ONLY]`

**Files**: `docs/ai/zencoder/01 - Architecture Guard Agent.md` through `09 - Task Brief Authoring.md`  
**Action**: Add a short "Example use cases" section to each file with 3–5 concrete bullet examples of when to use that agent  
**Model**: Follow the "Example prompts to try" section style from `docs/ai/copilot/01 - Architecture Guard Agent.md`  
**⚠️ Copilot safety**: `docs/ai/zencoder/` not referenced by Copilot. Safe.  
**Verification**: Each of the 9 files has a new "Example use cases" section; examples are specific to the agent's authority domain

---

## Execution Order

Tasks within the same group can run in parallel. Groups must be sequential:

```
Group 1 (Shared fixes) → Group 2 (Zencoder-only) → Group 3 (Optional A) → Group 4 (Optional B)
```

Within Group 1:

- Task 1.1 and 1.2 can run in parallel
- Task 1.3 and 1.4 can run in parallel (but 1.3 must complete before 1.4 verification)

Within Group 2:

- Tasks 2.1, 2.2, 2.3 can run in parallel
- Task 2.4 depends on Task 1.4 (must reference Workflow 04)

Within Group 3:

- Tasks 3.1, 3.2, 3.3 can run in parallel
- Task 3.4 depends on 3.1, 3.2, 3.3

Within Group 4:

- Task 4.1 is a single task covering all 9 files

---

## Post-Implementation Verification

After all groups complete:

1. Run cross-reference check: no broken paths in any changed file
2. Run Copilot isolation check: no `.zencoder/chats/` references in `.github/` files
3. Run Zencoder isolation check: no `.copilot/tasks/` references in `.zencoder/` or `.zenflow/` files
4. Confirm MODE_MANIFEST has 4 named workflow modes (safe-feature, safe-refactor, security-incident, incident-investigation)
5. Confirm all 4 ZenFlow workflows use `.zencoder/chats/{chat_id}/` (Zencoder native path, auto-resolved)
6. Confirm all 3 Zencoder rule files exist with `alwaysApply: true`
7. Confirm `ARTIFACTS_GUIDE.md` documents both tool paths correctly
8. Confirm `security-review-template.md` is non-empty

## Path Correction Log

**Post-completion correction applied**: All references to `.zenflow/tasks/{task_id}` in Zencoder-specific files were incorrect.

Zencoder's native artifact path is `.zencoder/chats/{chat_id}/` — resolved automatically from the active chat session.

Files corrected:

- `.zenflow/workflows/feature-development.md`
- `.zenflow/workflows/safe-refactor.md`
- `.zenflow/workflows/security-incident-workflow.md`
- `.zenflow/workflows/incident-investigation.md`
- `.zencoder/rules/agent-artifacts.md`
- `.zencoder/rules/agent-delegation.md`
- `docs/ai/general/ARTIFACTS_GUIDE.md`
- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/zencoder/README.md`

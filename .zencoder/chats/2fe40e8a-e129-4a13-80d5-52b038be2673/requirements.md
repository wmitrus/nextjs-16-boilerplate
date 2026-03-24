# PRD — AI Agent System Audit, Parity, and Completion

## 1. Objective

Perform a deep comparative audit of the Zencoder and GitHub Copilot AI agent setups in this repository. Both setups must be logically equivalent — covering the same governance, specialist roles, workflows, and behavioral guidance — while being designed specifically for their respective AI extension. Fix all identified gaps in both setups. Bring each to full production quality.

---

## 2. Dual-Tool Architecture Overview

This repository ships AI governance for **two tools simultaneously**:

### GitHub Copilot

| Layer                  | Location                                 | Purpose                                                |
| ---------------------- | ---------------------------------------- | ------------------------------------------------------ |
| Agent prompts          | `.github/agents/*.agent.md`              | Full standalone embedded prompts with YAML frontmatter |
| Slash commands         | `.github/prompts/*.prompt.md`            | Reusable entry points that bind directly to an agent   |
| Always-on instructions | `.github/instructions/*.instructions.md` | Applied to every Copilot session via `applyTo: '**'`   |
| Thin guides            | `docs/ai/copilot/01–09 + README`         | Human-readable "how to use" guides                     |
| Task artifacts         | `.copilot/tasks/{task_id}/`              | Per-task artifact workspace                            |

### Zencoder

| Layer                  | Location                                     | Purpose                                             |
| ---------------------- | -------------------------------------------- | --------------------------------------------------- |
| Agent prompt sources   | `docs/ai/general/01–09`                      | Full prompt content, injected via `<role>` tags     |
| Always-on rules        | `.zencoder/rules/*.md` (`alwaysApply: true`) | Applied to every Zencoder session automatically     |
| Structured workflows   | `.zenflow/workflows/*.md`                    | Step-by-step execution with artifact creation rules |
| Neutral workflow specs | `docs/ai/general/Workflow 01–03`             | Platform-agnostic workflow designs                  |
| Thin guides            | `docs/ai/zencoder/01–09 + README`            | Human-readable "how to use" guides                  |
| Task artifacts         | `.zenflow/tasks/{task_id}/`                  | Per-task artifact workspace                         |

### Shared Files (affect both tools)

| Location             | Contents                                                              |
| -------------------- | --------------------------------------------------------------------- |
| `docs/ai/general/`   | Agent prompts (01–09), MODE_MANIFEST, governance docs, workflow specs |
| `docs/ai/templates/` | Output templates for all agents                                       |

> ⚠️ **CRITICAL DUAL-USE RULE**: Any change to `docs/ai/general/` or `docs/ai/templates/` must not break either tool. The task path split (`.copilot/tasks/` for Copilot, `.zenflow/tasks/` for Zencoder) is INTENTIONAL and must be preserved in all files.

---

## 3. Comparative Analysis: Feature Parity Assessment

### 3.1 Always-On Behavioral Guidance

This is the most significant asymmetry. Copilot has modular always-on instructions that shape EVERY session:

| Copilot Always-On Instruction               | Purpose                                           | Zencoder Equivalent                     |
| ------------------------------------------- | ------------------------------------------------- | --------------------------------------- |
| `agent-delegation.instructions.md`          | When and how to delegate to specialist agents     | **MISSING** — not in `.zencoder/rules/` |
| `agent-artifacts.instructions.md`           | How to create and maintain task artifacts         | **MISSING** — not in `.zencoder/rules/` |
| `implementation-validation.instructions.md` | Validation focus discipline during implementation | **MISSING** — not in `.zencoder/rules/` |

Zencoder has `AGENTS.md` (huge always-on behavioral file) and `.zencoder/rules/repo.md` (repo context), but neither covers delegation rules, artifact creation, or validation focus in the modular, dedicated way Copilot does.

**Impact**: Zencoder sessions have architectural and domain behavioral guidance, but they lack the structural workflow discipline that Copilot sessions get automatically. An agent spawned in Zencoder without a `<role>` tag gets AGENTS.md behavior but no artifact or delegation guidance.

### 3.2 Entry Points (Prompts vs Workflows)

| Copilot Slash Prompt                                           | ZenFlow Equivalent                                 | Gap                   |
| -------------------------------------------------------------- | -------------------------------------------------- | --------------------- |
| `/Auth Flow Change Review` → `02 - Security & Auth`            | No dedicated ZenFlow workflow                      | **Zencoder Missing**  |
| `/Change Validation` → `05 - Validation Strategy`              | No dedicated ZenFlow workflow                      | **Zencoder Missing**  |
| `/Repository Baseline Validation` → `05 - Validation Strategy` | No dedicated ZenFlow workflow                      | **Zencoder Missing**  |
| `/Playwright E2E Validation` → `07 - Playwright E2E`           | No dedicated ZenFlow workflow                      | **Zencoder Missing**  |
| `/Debug Investigation` → `06 - Debug Investigation`            | Covered by `incident-investigation.md` (partially) | Partial               |
| `/Workflow Task` → `08 - Workflow Orchestrator`                | `feature-development.md`, others                   | ZenFlow more detailed |

| ZenFlow Workflow                           | Copilot Equivalent               | Gap                                        |
| ------------------------------------------ | -------------------------------- | ------------------------------------------ |
| `feature-development.md` (detailed 9-step) | `/Workflow Task` (simpler)       | Copilot less structured                    |
| `safe-refactor.md` (detailed 9-step)       | **No dedicated Copilot prompt**  | **Copilot Missing**                        |
| `security-incident-workflow.md` (detailed) | **No dedicated Copilot prompt**  | **Copilot Missing**                        |
| `incident-investigation.md`                | `/Debug Investigation` (partial) | **Copilot Missing** full incident workflow |

### 3.3 Tool Capabilities (Non-Addressable by Config)

| Capability                           | Copilot                                 | Zencoder                                          |
| ------------------------------------ | --------------------------------------- | ------------------------------------------------- |
| Sub-agent spawning from orchestrator | ✅ `agents: [...]` in frontmatter       | ❌ Not supported — sequential `<role>` injection  |
| Tool permissions per agent           | ✅ `tools: [read, search, edit, ...]`   | ❌ Not supported                                  |
| Slash command binding to agent       | ✅ `agent:` field in prompt frontmatter | ❌ Not supported — ZenFlow workflows are separate |
| Direct agent invocation              | ✅ User selects agent from UI           | ✅ User sets `<role>` in chat                     |
| Always-on guidance                   | ✅ `applyTo: '**'` instructions         | ✅ `alwaysApply: true` rules                      |

These tool capability differences are NOT fixable by configuration — they are platform-level. However, the behavioral guidance can be designed to work within each tool's model.

### 3.4 Thin Human-Readable Guides

| Feature                      | Copilot (`docs/ai/copilot/`) | Zencoder (`docs/ai/zencoder/`) |
| ---------------------------- | ---------------------------- | ------------------------------ |
| What it does                 | ✅                           | ✅                             |
| When to use it               | ✅                           | ✅                             |
| Auth-Flow Note               | ✅                           | ✅                             |
| Related workflows/prompts    | ✅                           | ✅                             |
| Example prompts to try       | ✅ (at least Agent 01)       | ❌ Missing                     |
| Relationship to other agents | Partial                      | Partial                        |

### 3.5 Shared File Issues Affecting Both Tools

| File                                            | Issue                                                                                                                                         |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/ai/general/ARTIFACTS_GUIDE.md`            | Title says "ZenFlow Artifacts Guide" but default path references `.copilot/tasks/{task_id}/` — contradictory and confusing for both tools     |
| `docs/ai/templates/security-review-template.md` | Empty (0 bytes) — blocks both tools                                                                                                           |
| `docs/ai/general/MODE_MANIFEST.md`              | Missing `incident-investigation` mode, missing `debug-investigation` mode, `workflow-task` mode path is Copilot-specific but in a shared file |

### 3.6 Zencoder-Only Issues

| File                                           | Issue                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| `.zenflow/workflows/incident-investigation.md` | Wrong artifacts path (`docs/workflows/` instead of `.zenflow/tasks/`)   |
| `.zenflow/workflows/incident-investigation.md` | Artifact Execution Rule is mid-file                                     |
| `.zencoder/rules/repo.md`                      | Title says "temp-nextjs-scaffold Information" — stale project name      |
| `docs/ai/general/`                             | Missing `Workflow 04 - Incident Investigation Workflow.md` neutral spec |
| `docs/ai/zencoder/README.md`                   | References 3 neutral workflow specs; 4th missing                        |
| `docs/ai/zencoder/01–09`                       | No "Example use cases" to help with onboarding                          |

### 3.7 Copilot-Only Issues (Optional Improvements)

| File                    | Issue                                                                 |
| ----------------------- | --------------------------------------------------------------------- |
| `.github/prompts/`      | Missing `safe-refactor.prompt.md`                                     |
| `.github/prompts/`      | Missing `security-incident.prompt.md`                                 |
| `.github/prompts/`      | Missing `incident-investigation.prompt.md`                            |
| `docs/ai/copilot/02–09` | Most guides missing "Example prompts to try" section (only 01 has it) |

---

## 4. Scope

### Primary: Fix shared files (affects both tools)

1. Fill `docs/ai/templates/security-review-template.md` (empty)
2. Add `incident-investigation` mode to `MODE_MANIFEST.md`
3. Add `debug-investigation` mode to `MODE_MANIFEST.md`
4. Update `workflow-task` mode in `MODE_MANIFEST.md` — note tool-specific paths
5. Create `docs/ai/general/Workflow 04 - Incident Investigation Workflow.md`
6. Fix `ARTIFACTS_GUIDE.md` — make title and default path tool-agnostic

### Secondary: Zencoder improvements (Zencoder-only)

7. Add `.zencoder/rules/agent-delegation.md` — always-on delegation rules
8. Add `.zencoder/rules/agent-artifacts.md` — always-on artifact creation rules (with `.zenflow/tasks/` path)
9. Add `.zencoder/rules/implementation-validation.md` — always-on validation focus rules
10. Fix `.zenflow/workflows/incident-investigation.md` — artifacts path + structure
11. Update `docs/ai/zencoder/README.md` — reference Workflow 04 + 4 neutral specs
12. Update `.zencoder/rules/repo.md` — fix stale "temp-nextjs-scaffold" title

### Optional A: Copilot prompt parity (Copilot-only, additive)

13. Create `.github/prompts/safe-refactor.prompt.md`
14. Create `.github/prompts/security-incident.prompt.md`
15. Create `.github/prompts/incident-investigation.prompt.md`
16. Update `docs/ai/copilot/README.md` to reference new prompts

### Optional B: Thin guide enrichment (Zencoder-only, additive)

17. Add "Example use cases" to `docs/ai/zencoder/01–09` guides

### Out of scope

- Changes to `.github/agents/*.agent.md` prompt content (agents are sound)
- Changes to `.github/instructions/*.instructions.md` (correct for Copilot)
- Changes to agent prompt content in `docs/ai/general/01–09` (prompts are sound)
- Changes to `.copilot/tasks/` path in any Copilot file
- Application source code changes
- CI/CD pipeline changes

---

## 5. Safety Rules (applies to every task)

### For changes to `docs/ai/general/` or `docs/ai/templates/` (shared files):

- Must not alter any path referenced by `.github/agents/*.agent.md`
- Must not alter any path referenced by `.github/instructions/*.instructions.md`
- Must not alter any path referenced by `.github/prompts/*.prompt.md`
- Must not change `.copilot/tasks/` references in Copilot files
- Must preserve MODE_MANIFEST authority order and specialist boundaries

### For changes to `.zencoder/rules/` (Zencoder-only):

- Must not reference `.copilot/tasks/` — use `.zenflow/tasks/` exclusively
- Must be consistent with the governance in `docs/ai/general/00 - Agent Interaction Protocol.md`
- New rule files must use `alwaysApply: true` in frontmatter

### For changes to `.github/prompts/` (Copilot-only):

- Must follow existing frontmatter structure (name, description, argument-hint, agent)
- Must not reference `.zenflow/tasks/` — use `.copilot/tasks/` exclusively
- Must reference the correct agent file from `.github/agents/`

---

## 6. Acceptance Criteria

### Primary (shared fixes)

| #   | Criterion                                                                                  |
| --- | ------------------------------------------------------------------------------------------ |
| AC1 | `security-review-template.md` is non-empty with proper section structure                   |
| AC2 | MODE_MANIFEST has `incident-investigation` named mode                                      |
| AC3 | MODE_MANIFEST has `debug-investigation` named mode                                         |
| AC4 | MODE_MANIFEST `workflow-task` mode notes both tool-specific artifact paths                 |
| AC5 | `Workflow 04 - Incident Investigation Workflow.md` exists, consistent with Workflows 01–03 |
| AC6 | `ARTIFACTS_GUIDE.md` title is tool-agnostic and default path notes both tool paths         |

### Zencoder improvements

| #    | Criterion                                                                                                                                                |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC7  | `.zencoder/rules/agent-delegation.md` exists with `alwaysApply: true` — mirrors Copilot `agent-delegation.instructions.md` logic adapted for Zencoder    |
| AC8  | `.zencoder/rules/agent-artifacts.md` exists with `alwaysApply: true` — mirrors Copilot `agent-artifacts.instructions.md` but with `.zenflow/tasks/` path |
| AC9  | `.zencoder/rules/implementation-validation.md` exists with `alwaysApply: true` — mirrors Copilot `implementation-validation.instructions.md`             |
| AC10 | `incident-investigation.md` uses `.zenflow/tasks/{task_id}/` path                                                                                        |
| AC11 | `incident-investigation.md` Artifact Execution Rule precedes Step 1                                                                                      |
| AC12 | `docs/ai/zencoder/README.md` references Workflow 04 and 4 neutral specs                                                                                  |
| AC13 | `.zencoder/rules/repo.md` title updated from "temp-nextjs-scaffold"                                                                                      |

### Optional A (Copilot prompt parity)

| #    | Criterion                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------- |
| OAC1 | `safe-refactor.prompt.md` routes to `08 - Workflow Orchestrator` for refactor tasks             |
| OAC2 | `security-incident.prompt.md` routes to `08 - Workflow Orchestrator` for security incidents     |
| OAC3 | `incident-investigation.prompt.md` routes to `08 - Workflow Orchestrator` for general incidents |
| OAC4 | `docs/ai/copilot/README.md` lists all new prompts                                               |

### Optional B (Zencoder thin guide enrichment)

| #    | Criterion                                                                                    |
| ---- | -------------------------------------------------------------------------------------------- |
| OBC1 | Each `docs/ai/zencoder/01–09` file has an "Example use cases" or "Example scenarios" section |

---

## 7. Assumptions

1. The three new `.zencoder/rules/` files should be ADAPTED versions of their Copilot counterparts — same behavioral intent, but with Zencoder-specific paths and Zencoder-appropriate language (no Copilot-specific syntax like `applyTo`)
2. The `ARTIFACTS_GUIDE.md` note about tool-specific paths should not unify the paths — it should clearly document both with their respective tool contexts
3. Copilot prompts for safe-refactor, security-incident, and incident-investigation should route to `08 - Workflow Orchestrator` and be simpler entry points, not as detailed as ZenFlow workflows
4. "Example use cases" in Zencoder thin guides should be short (3–5 bullet examples, not full scripts)
5. The `.zencoder/rules/agent-delegation.md` MUST NOT copy `.copilot/tasks/` paths — it must reference `.zenflow/tasks/` and ZenFlow workflows

---

## 8. Open Questions

None — scope is clear enough to proceed to planning.

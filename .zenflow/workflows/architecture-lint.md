# Architecture Lint Workflow

## Configuration

- **Artifacts Path**: `{@artifacts_path}` → `.zenflow/tasks/{task_id}`
- **Step Agent Presets**: this workflow uses Zenflow's documented `<!-- agent: preset-name -->` step binding pattern.
- **Required Saved Presets**: create matching presets in Zenflow Settings → Agents, or rename the inline `agent:` comments below to match your actual preset names:
  - `architecture-guard-agent`

## Before Running

Before starting this workflow, read:

- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/ARCHITECTURE_LINT_RULES.md`
- `docs/ai/general/README-ARCHITECTURE_LINT.md`

Repository note:
In Next.js 16, `src/proxy.ts` is the valid middleware-equivalent file.
Analyze `src/proxy.ts` directly for request interception, redirect, auth pre-processing, and security header behavior.
Do not treat the absence of `middleware.ts` as a finding.

---

## Artifact Execution Rule

For every workflow step:

- the file shown under `Output:` is mandatory
- the active agent must create or overwrite that markdown file
- the artifact file must contain the full result for the step
- the agent must not respond only in chat without writing the artifact
- after writing the artifact, the agent should give only a short completion summary in chat

---

## Workflow Steps

### [ ] Step: Lint Intake

<!-- agent: architecture-guard-agent -->

Define the lint scope and inspection plan.

Output:
{@artifacts_path}/lint-intake.md

Include:

- lint scope: full repo, specific modules, or post-change boundary check
- known concerns or prior findings to prioritize
- inspection plan: which layers and modules will be checked
- lint rules to apply (from ARCHITECTURE_LINT_RULES.md)

---

### [ ] Step: Structure Inspection

<!-- agent: architecture-guard-agent -->

Run **Architecture Guard Agent** in read-only mode.

Inspect `src/app/`, `src/core/`, `src/features/`, `src/modules/`, `src/security/`, `src/shared/` for boundary compliance.

Output:
{@artifacts_path}/structure-inspection.md

Check for:

- module boundary violations (cross-module imports bypassing contracts)
- dependency direction violations (modules importing from layers above them)
- business logic leaking into `shared/`, `app/`, or presentation layers
- database access from the delivery layer
- hidden service locator patterns
- direct module-to-module imports bypassing public contracts

---

### [ ] Step: Contract and Provider Audit

<!-- agent: architecture-guard-agent -->

Inspect core contracts, DI/composition, auth provider isolation, and security placement.

Output:
{@artifacts_path}/contract-audit.md

Inspect `src/core/`, `src/modules/auth/`, `src/modules/authorization/`, `src/security/`.

Check for:

- core contracts: stable? Reverse dependencies?
- DI/composition: composition root discipline maintained?
- auth provider isolation: SDK usage limited to adapters?
- provider concepts leaking into contracts or authorization domain?
- security placement: authorization enforced server-side?
- role checks scattered across application layers?
- feature flags embedded directly inside UI components?
- global container resolution inside request-sensitive flows?

---

### [ ] Step: Findings Classification

<!-- agent: architecture-guard-agent -->

Classify all findings from Structure Inspection and Contract Audit.

Output:
{@artifacts_path}/findings.md

Classify each finding as:

**CRITICAL**:

- breaks modular-monolith boundary rules
- introduces reverse dependency to core
- bypasses authorization enforcement
- introduces cross-tenant or security risks
- creates architectural coupling blocking future extensibility

**MAJOR**:

- weakens DI discipline
- introduces cross-module knowledge leakage
- inconsistent runtime placement
- patterns likely to cause architectural drift

**MINOR**:

- small design inconsistencies
- non-blocking architectural smells

**INFORMATIONAL**:

- observations not representing problems

Include for each finding:

- file(s) involved
- description of the violation or smell
- why it matters
- whether it is a confirmed violation, a suspicious pattern, or an acceptable exception

---

### [ ] Step: Docs vs Code Drift Check

<!-- agent: architecture-guard-agent -->

Compare documentation claims against live code.

Output:
{@artifacts_path}/drift-report.md

Check:

- `docs/ai/general/REPOSITORY_AI_CONTEXT.md` claims vs actual structure
- Architecture docs or ADRs vs actual module organization
- Any explicit design docs that may be stale

Classify each drift as:

- **Minor wording drift**: docs ahead of code or slightly inaccurate
- **Stale file references**: docs reference files that moved or were renamed
- **Architectural drift**: docs claim a design the code does not implement

---

### [ ] Step: Output Report

<!-- agent: architecture-guard-agent -->

Consolidate all findings into a single architecture lint report.

Output:
{@artifacts_path}/architecture-lint-report.md

Include:

- objective
- lint scope
- confirmed violations (grouped by CRITICAL / MAJOR / MINOR / INFORMATIONAL)
- suspicious patterns (not confirmed violations but worth monitoring)
- acceptable exceptions (patterns that look like violations but are intentional)
- docs vs code drift
- recommended next action (highest-priority finding to address first)

**Implementation of fixes is NOT part of this workflow.**
Findings feed other workflows (safe-refactor-workflow, safe-feature-workflow, incident-investigation) for remediation.

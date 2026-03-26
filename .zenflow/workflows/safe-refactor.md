# Safe Refactor Workflow

## Configuration

- **Artifacts Path**: `{@artifacts_path}` → `.zenflow/tasks/{task_id}`
- **Step Agent Presets**: this workflow uses Zenflow's documented `<!-- agent: preset-name -->` step binding pattern.
- **Required Saved Presets**: create matching presets in Zenflow Settings → Agents, or rename the inline `agent:` comments below to match your actual preset names:
  - `architecture-guard-agent`
  - `security-auth-agent`
  - `validation-strategy-agent`
  - `implementation-agent`

---

## Before Running

Before starting this workflow, read:

- `AGENTS.md` (repository root) — primary always-applied context; `.zencoder/rules/repo.md` deprecated April 20, 2026.
- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/SECURITY_CODING_PATTERNS.md`

Repository note:
In Next.js 16, `src/proxy.ts` is the valid middleware-equivalent file.
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

### [ ] Step: Refactor Intake

Collect the refactor scope and the behavior-preservation guarantee.

Output:
{@artifacts_path}/refactor-intake.md

Include:

- refactor objective and motivation
- affected files and modules
- behavior contract being preserved (what must not change)
- security-sensitive code touched (yes/no + which patterns from `SECURITY_CODING_PATTERNS.md` apply)
- open questions or blockers

---

### [ ] Step: Architecture Safety Check

<!-- agent: architecture-guard-agent -->

Confirm the refactor preserves modular-monolith boundaries and dependency direction.

Output:
{@artifacts_path}/architecture-safety.md

Confirm:

- no module boundary regressions
- dependency direction unchanged
- DI and composition-root discipline maintained
- no blast radius expansion beyond stated scope

---

### [ ] Step: Security Safety Check

<!-- agent: security-auth-agent -->

Confirm the refactor does not weaken auth, authorization, or security-sensitive code paths.

Output:
{@artifacts_path}/security-safety.md

Confirm:

- no trust boundary weakening
- no removal of input validation or sanitization
- no violations of `docs/ai/general/SECURITY_CODING_PATTERNS.md` rules introduced
- redirect handling, logger dispatch, and DI mock patterns follow SEC-01 through SEC-06

If any new code introduced by the refactor creates scanner-flaggeable patterns not in `SECURITY_CODING_PATTERNS.md`, flag for patterns doc update.

---

### [ ] Step: Validation Strategy

<!-- agent: validation-strategy-agent -->

Determine the minimum safe validation scope to confirm behavior is preserved.

Output:
{@artifacts_path}/validation-strategy.md

Include:

- minimum required validation
- optional additional validation
- validation not required
- validation commands

---

### [ ] Step: Implementation

<!-- agent: implementation-agent -->

Execute the refactor within the established constraints.

Output:
{@artifacts_path}/implementation-report.md

Include:

- files changed
- behavior preserved (how verified)
- tests updated if needed
- security coding rules followed

---

### [ ] Step: Validation

Run repository validation commands.

Output:
{@artifacts_path}/validation-report.md

Commands:

- pnpm typecheck
- pnpm lint
- pnpm test

Include pass/fail per command and any failures with details.

---

### [ ] Step: Security Patterns Update (conditional)

<!-- agent: security-auth-agent -->

**Run this step only if the refactor touched security-sensitive patterns or introduced new patterns not yet in `SECURITY_CODING_PATTERNS.md`.**

Output:
{@artifacts_path}/patterns-update-report.md

Update `docs/ai/general/SECURITY_CODING_PATTERNS.md` with any new or updated patterns discovered during this refactor.

Propagate to:

- `.zencoder/rules/repo.md`
- `.github/agents/security-auth.agent.md`
- `.github/agents/implementation-agent.agent.md`
- `docs/ai/general/02 - Security & Auth Agent.md`
- `docs/ai/general/04 - Implementation Agents.md`

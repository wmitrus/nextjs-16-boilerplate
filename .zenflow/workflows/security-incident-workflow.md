# Security Incident Workflow

## Configuration

- **Artifacts Path**: `{@artifacts_path}` → `.zenflow/tasks/{task_id}`
- **Step Agent Presets**: this workflow uses Zenflow's documented `<!-- agent: preset-name -->` step binding pattern.
- **Required Saved Presets**: create matching presets in Zenflow Settings → Agents, or rename the inline `agent:` comments below to match your actual preset names:
  - `security-auth-agent`
  - `implementation-agent`
  - `validation-strategy-agent`

---

## Before Running

Before starting this workflow, read:

- `AGENTS.md` (repository root) — primary always-applied context; `.zencoder/rules/repo.md` deprecated April 20, 2026.
- `docs/ai/general/MODE_MANIFEST.md`
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/SECURITY_CODING_PATTERNS.md`

This workflow is used for:

- structured security scanner triage sessions
- security finding remediation
- security-related code review sessions
- post-incident hardening

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

### [ ] Step: Security Intake

<!-- agent: security-auth-agent -->

Collect the security findings, scanner output, or incident report.

Output:
{@artifacts_path}/security-intake.md

Include:

- source of findings (scanner name/version, manual review, incident report)
- full finding list with file paths, line numbers, rule IDs, and finding text
- environment context (production, test, CI)
- initial severity assessment per finding

---

### [ ] Step: Finding Classification

<!-- agent: security-auth-agent -->

Classify each finding as: **Real Risk** / **Latent Risk** / **False Positive**.

Output:
{@artifacts_path}/finding-classification.md

For each finding:

- finding ID and text
- context (what code is doing at that line)
- classification: Real Risk / Latent Risk / False Positive
- rationale for classification
- whether it matches a known pattern in `docs/ai/general/SECURITY_CODING_PATTERNS.md`
- action required: Fix / Suppress with comment / Document only

Cross-reference `docs/ai/general/SECURITY_CODING_PATTERNS.md` — if the finding matches an existing SEC-XX entry, reference it.

---

### [ ] Step: Remediation Plan

<!-- agent: security-auth-agent -->

Produce the minimum safe remediation plan for findings classified as Real Risk or Latent Risk.

Output:
{@artifacts_path}/remediation-plan.md

Include:

- findings to fix and findings to suppress
- for each fix: affected file, affected lines, minimum safe change, test impact
- for each suppression: suppression comment rationale
- findings safe to mark ignored in the scanner UI with rationale

---

### [ ] Step: Validation Strategy

<!-- agent: validation-strategy-agent -->

Determine the minimum safe validation scope for the planned remediations.

Output:
{@artifacts_path}/validation-strategy.md

Include:

- change risk classification per fix
- minimum required validation
- optional additional validation
- validation not required
- validation commands

---

### [ ] Step: Implementation

<!-- agent: implementation-agent -->

Apply fixes and suppressions per the remediation plan.

Output:
{@artifacts_path}/implementation-report.md

Include:

- files changed
- logic changes made
- tests added or updated
- suppression comments added with rationale

---

### [ ] Step: Validation

Run repository validation commands.

Output:
{@artifacts_path}/validation-report.md

Commands:

- pnpm typecheck
- pnpm lint
- pnpm test

Include:

- command output summary
- pass/fail status per command
- any failures with details

---

### [ ] Step: Scanner Ignore Report

<!-- agent: security-auth-agent -->

Produce a structured ignore report for the online scanner UI.

Output:
{@artifacts_path}/scanner-ignore-report.md

Include a table with columns:

| File | Line | Rule / Finding | Classification | Action | Rationale |

For every finding in this session:

- findings classified as False Positive → recommend "Ignore / False Positive"
- findings that were fixed → recommend "Resolved / Fixed"
- findings classified as Real Risk but deferred → recommend "Accepted Risk" with note

---

### [ ] Step: Security Patterns Update

<!-- agent: security-auth-agent -->

**MANDATORY — do not skip this step.**

Update `docs/ai/general/SECURITY_CODING_PATTERNS.md` with any new patterns identified in this session.

Output:
{@artifacts_path}/patterns-update-report.md

For each new or updated pattern:

1. Assign or confirm SEC-XX ID
2. Add to `SECURITY_CODING_PATTERNS.md`:
   - scanner finding text
   - context
   - classification rationale
   - dangerous pattern (code example)
   - correct pattern (code example)
   - mandatory rule for agents
3. Update the rule table in `.zencoder/rules/repo.md`
4. Verify `.github/agents/security-auth.agent.md` and `docs/ai/general/02 - Security & Auth Agent.md` reflect new mandatory rules
5. Verify `.github/agents/implementation-agent.agent.md` and `docs/ai/general/04 - Implementation Agents.md` reflect new mandatory rules if SEC-01 / SEC-03 / SEC-04 / SEC-06 category

In the output artifact, state:

- which patterns were added or updated
- which agent files were updated
- whether the rule table in `repo.md` was updated
- any patterns found in this session that match existing entries (reference the existing SEC-XX)

This step is the final gate. The workflow is not complete until `SECURITY_CODING_PATTERNS.md` is current.

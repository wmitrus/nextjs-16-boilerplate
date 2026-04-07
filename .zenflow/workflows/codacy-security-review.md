# Workflow: Codacy Security Review

## Purpose

Structured triage and remediation of CRITICAL/HIGH security findings raised by Codacy
on a pull request. Processes findings group by group with a manual pause between groups
so results can be reviewed before the next group begins.

Covers:

- Timing-attack false positives
- Open redirect findings
- Command/object injection findings
- Dynamic file access findings
- Weak RNG findings
- Any other Codacy SAST finding category

---

## Configuration

- **Artifacts Path**: `{@artifacts_path}` → `.zenflow/tasks/{task_id}`
- **Step Agent Presets**: this workflow uses Zenflow's documented `<!-- agent: preset-name -->` step binding pattern.
- **Required Saved Presets**: create matching presets in Zenflow Settings → Agents, or rename the `agent:` comments below to match your actual preset names:
  - `security-auth-agent`
  - `implementation-agent`
  - `validation-strategy-agent`

---

## Before Running

Before starting this workflow, read:

- `AGENTS.md` (repository root) — primary always-applied context; `.zencoder/rules/repo.md` deprecated April 20, 2026.
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/SECURITY_CODING_PATTERNS.md` — cross-reference every finding against existing SEC-XX entries before classifying.

Repository note:
In Next.js 16, `src/proxy.ts` is the valid middleware-equivalent file.
Do not treat the absence of `middleware.ts` as a finding.
Do not search for `middleware.ts`.

---

## Artifact Execution Rule

For every workflow step:

- the file shown under `Output:` is mandatory
- the active agent must create or overwrite that markdown file before completing the step
- the artifact file must contain the full result for the step
- the agent must NOT respond only in chat without writing the artifact
- after writing the artifact, give only a brief completion summary in chat

---

## Key Decision Rules (apply at every group)

These rules govern how every finding is handled. Read them before classifying.

**Rule 1 — Real fix beats suppress.**
Always prefer a code change that eliminates the scanner signal over an inline `eslint-disable` comment.
A real fix removes the vulnerable pattern; a suppress comment hides it.

**Rule 2 — Suppress is last resort.**
Use inline `eslint-disable-next-line` only when:
(a) the finding is a confirmed false positive AND
(b) no code change can eliminate the signal without degrading correctness or readability.
Every suppress comment must include a rationale explaining why the finding does not apply.

**Rule 3 — Hardening before suppressing.**
When a finding is a false positive on code that could be hardened (e.g. fs.\* with variable paths),
apply the hardening first (e.g. base-directory confinement check), then suppress only what remains.
Do not suppress a finding on unhardened code.

**Rule 4 — Scanner ignore ≠ ESLint suppress.**
The scanner ignore report (for the Codacy UI) and ESLint suppress comments serve different tools.
Only put a finding in the scanner ignore report if the code pattern **still exists** in source.
If the pattern was eliminated by a real code fix, put it in the "Resolved" section of the report — do NOT put it in the ignore table.

**Rule 5 — Read before editing.**
Inspect every affected file in full before making changes.
Identify the owning module/layer. Never edit across module boundaries opportunistically.

**Rule 6 — Patterns doc after every group.**
After each group is addressed, update `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
If the finding matches an existing SEC-XX entry, reference it. If it is a new pattern, add a new SEC-XX entry.

---

## Leantime Integration

**This workflow must include Leantime steps at task open and close.**

Read: `docs/ai/general/LEANTIME_AUTOMATION.md`

At workflow start, invoke `10 - Leantime Integration Agent` to:

- Check for existing tasks and milestones.
- Create milestone and main task with HTML description.
- Patch status to W toku (4).
- Record task ID in the workflow intake artifact.

At workflow end, invoke `10 - Leantime Integration Agent` to:

- Patch status to Zrobione (0).
- Log time with `pnpm lt -- run time.log`.
- Update wiki if findings should persist.

---

## Workflow Steps

### [ ] Step: Intake — Parse and Group Codacy Findings

<!-- agent: security-auth-agent -->

Parse the Codacy findings pasted by the user. Group them by vulnerability class.

Output:
{@artifacts_path}/intake.md

Include:

- source: Codacy PR comment, branch, PR number
- full finding list — for each finding:
  - file path and line number
  - Codacy rule / vulnerability class
  - finding text (exact quote from Codacy)
- grouping by vulnerability class (e.g. Timing Attack, Open Redirect, Command Injection, File Access, Weak RNG)
- count of findings per group
- total finding count

Cross-reference each finding against `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
If a finding matches an existing SEC-XX entry, mark it immediately as the expected classification.

**Pause after this step** and show the user the grouped findings before proceeding.

---

### [ ] Step: Group N — Triage, Fix, and Suppress

<!-- agent: security-auth-agent -->
<!-- implementation-agent -->

Repeat this step for each group identified in the intake step.
Process one group at a time. **Pause for user review after each group before continuing.**

Output:
{@artifacts_path}/group-{N}-{slug}.md

For each finding in the group:

**Triage phase** (`security-auth-agent`):

1. Read the affected file(s) fully before classifying.
2. Classify the finding: **Real Risk** / **Latent Risk** / **False Positive**.
3. State the exact runtime context — what the code is doing, what inputs flow through it.
4. If matching an SEC-XX entry in `docs/ai/general/SECURITY_CODING_PATTERNS.md`, reference it and apply the documented correct pattern immediately.
5. Determine the resolution:
   - Real Risk → code fix required
   - Latent Risk → code fix required
   - False Positive → attempt real code fix first; suppress only if no clean code fix exists

**Implementation phase** (`implementation-agent`):

6. Inspect affected files before editing.
7. Apply the minimum safe change per the triage decision.
8. Follow Rule 1 (real fix beats suppress) and Rule 2 (suppress is last resort).
9. For suppression comments: place the rationale comment on the line BEFORE `eslint-disable-next-line`. Explain exactly why the finding does not apply.
10. Update or add tests if behavior changes.

**Patterns update** (`security-auth-agent`):

11. Update `docs/ai/general/SECURITY_CODING_PATTERNS.md`:
    - If the pattern matches an existing SEC-XX: confirm or note any drift.
    - If the pattern is new: add a new SEC-XX entry with: finding text, context, classification rationale, dangerous pattern (code), correct pattern (code), mandatory rule for agents.

Group artifact must include:

- each finding: classification + rationale + resolution applied
- files changed with brief description of what changed
- any tests added or updated
- SEC-XX entries added or updated
- summary: how many were fixed, how many suppressed, how many matched existing patterns

---

### [ ] Step: Quality Gates

<!-- agent: validation-strategy-agent -->

Run all repository quality gates after all groups are complete.

Output:
{@artifacts_path}/quality-gates.md

Commands to run (in order):

```bash
pnpm typecheck
pnpm lint
pnpm test
```

For `pnpm lint`:

- 0 errors is the pass threshold
- Warnings are acceptable if pre-existing (do not introduce new warnings)
- Verify that all 6 affected files from the Codacy findings have 0 errors and 0 warnings

For `pnpm test`:

- Confirm any pre-existing failures are not caused by this session's changes
- If a test failure is new, block and report before proceeding

Include in artifact:

- pass/fail status per command
- exit codes
- for lint: count of errors (must be 0) and warnings (note pre-existing vs new)
- for test: pass/fail counts, any new failures vs pre-existing failures
- overall gate: PASS or FAIL

---

### [ ] Step: Scanner Ignore Report

<!-- agent: security-auth-agent -->

Produce the structured ignore report for the Codacy UI.

Output:
{@artifacts_path}/scanner-ignore-report.md

**Critical rule**: Only include findings whose code pattern **still exists** in source.
Findings resolved by real code fixes go into the "Resolved" section — NOT the ignore table.

**Table 1 — Safe to Ignore in Codacy UI:**

| #   | File | Current Line | Rule / Vulnerability Class | Why It Is a False Positive |
| --- | ---- | ------------ | -------------------------- | -------------------------- |

- File: exact repo-relative path
- Current Line: the line number **in the current code** (not the original Codacy line — code may have shifted)
- Rule: Codacy rule name / finding class
- Rationale: specific to the code at that line — not a generic explanation

**Table 2 — Resolved by Code Fix (Do NOT suppress in Codacy):**

| #   | File | Original Line | Vulnerability Class | How It Was Fixed |
| --- | ---- | ------------- | ------------------- | ---------------- |

Include instructions at the bottom of the artifact:

- How to use the ignore table in the Codacy UI
- Which findings in Table 2 should auto-resolve after re-scan
- Note: do NOT add Table 2 entries to the Codacy ignore list

---

### [ ] Step: Final Patterns Propagation

<!-- agent: security-auth-agent -->

**MANDATORY — do not skip. The workflow is not complete until this step passes.**

Review all new SEC-XX entries added during this session. Propagate mandatory rules to agent files only if new patterns were added.

Output:
{@artifacts_path}/patterns-propagation-report.md

If new SEC-XX entries were added this session:

1. Update `AGENTS.md` (repository root) — primary always-applied context.
2. Update `docs/ai/general/02 - Security & Auth Agent.md` — mandatory startup rules.
3. Update `docs/ai/general/04 - Implementation Agents.md` — mandatory editing constraints with code examples if SEC category affects implementation patterns.
4. Update corresponding `.github/agents/security-auth.agent.md` and `.github/agents/implementation-agent.agent.md`.
5. If pattern affects E2E code: update `docs/ai/general/07 - Playwright E2E Agent.md` and `.github/agents/playwright-e2e.agent.md`.
6. Update the Agent Infrastructure location map in `docs/ai/general/REPOSITORY_AI_CONTEXT.md` if any new agent file was created.

If no new SEC-XX entries were added (all findings matched existing patterns):

- State which existing entries were matched
- Confirm no propagation needed
- Still produce the artifact

In the artifact, state:

- new SEC-XX entries added (or "none — all matched existing patterns")
- agent files updated (list each file)
- any drift found between code and existing patterns doc (report even if not fixing it)

---

## Workflow Completion Checklist

Before closing the workflow, verify:

- [ ] All Codacy findings are addressed (fixed, suppressed with rationale, or ignored with documented reason)
- [ ] `pnpm typecheck` — exit code 0
- [ ] `pnpm lint` — 0 errors (warnings acceptable if pre-existing)
- [ ] `pnpm test` — no new failures introduced
- [ ] All inline suppress comments include a rationale
- [ ] Scanner ignore report contains only patterns still present in code
- [ ] `docs/ai/general/SECURITY_CODING_PATTERNS.md` is current
- [ ] Agent files propagated if new patterns were discovered
- [ ] All artifact files written to `{@artifacts_path}/`

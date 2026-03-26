# Workflow 10 — Codacy Security Review Workflow

Purpose:
Triage and remediate CRITICAL/HIGH security findings raised by Codacy on a pull request.
Processes findings group by group with a manual pause between groups so results can be
reviewed before the next group begins.

This workflow is specific to Codacy SAST scanner findings.
For general security incidents, use `Workflow 03 - Security Incident Workflow`.

ZenFlow reference:

- `.zenflow/workflows/codacy-security-review.md`

Mode ID:

- `codacy-security-review`

Available agents:

- Security & Auth Agent (owns classification and `SECURITY_CODING_PATTERNS.md`)
- Implementation Agent (applies code fixes and suppression comments)
- Validation Strategy Agent (runs quality gates)

Before running this workflow, read:

- `AGENTS.md` (repository root) — primary always-applied context; `.zencoder/rules/repo.md` deprecated April 20, 2026.
- `docs/ai/general/00 - Agent Interaction Protocol.md`
- `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
- `docs/ai/general/SECURITY_CODING_PATTERNS.md` — cross-reference every finding before classifying

Repository note:

In Next.js 16, `src/proxy.ts` is the valid middleware-equivalent file.
Analyze `src/proxy.ts` directly for request interception, redirect, auth pre-processing, and security header behavior.
Do not treat the absence of `middleware.ts` as a finding.

==================================================
WORKFLOW GOAL
==================================================

Use this workflow when Codacy raises CRITICAL or HIGH security findings on a PR and each
finding needs individual triage to distinguish real risks from false positives.

The workflow must:

- inspect real code before classifying any finding
- group findings by vulnerability class for efficient processing
- prefer real code fixes that eliminate the scanner signal over inline suppression comments
- apply hardening improvements when possible, even on false-positive findings
- keep blast radius low — one group at a time, one file at a time
- produce an ignore report usable directly in the Codacy UI
- update `docs/ai/general/SECURITY_CODING_PATTERNS.md` after every group

==================================================
WORKFLOW PRINCIPLES
==================================================

Always:

- treat repository code as the source of truth (not scanner output)
- inspect each affected file fully before classifying the finding at that line
- prefer the smallest safe change that eliminates the risk or the signal
- update or propose tests when behavior changes
- write every artifact to its task file — never chat-only output
- cross-reference findings against `docs/ai/general/SECURITY_CODING_PATTERNS.md` first

Never:

- add an `eslint-disable` comment without a rationale comment immediately before it
- add a finding to the scanner ignore table if it was eliminated by a real code fix
- suppress before hardening — apply confinement checks, typed maps, or other improvements first
- classify a finding as false positive without reading the actual code at that line
- process multiple groups simultaneously — one at a time, pause between each

==================================================
KEY DECISION RULES
==================================================

Rule 1 — Real fix beats suppress.
A code change that eliminates the vulnerable pattern is always preferred over an `eslint-disable` comment.

Rule 2 — Suppress is last resort.
Use `eslint-disable-next-line` only when the finding is a confirmed false positive AND
no code change can eliminate the signal without degrading correctness or readability.
Every suppress comment must include a rationale on the preceding line.

Rule 3 — Harden before suppressing.
When a finding is a false positive on code that could be hardened
(e.g. `fs.*` with variable paths, bracket-notation object access),
apply the hardening first (confinement check, `Map` instead of `Record`, typed dispatch map),
then suppress only what cannot be eliminated.

Rule 4 — Scanner ignore ≠ ESLint suppress.
The Codacy ignore table and ESLint suppress comments serve different tools.
Only include a finding in the scanner ignore report if the code pattern still exists in source.
If the pattern was eliminated by a real code fix, put it in the "Resolved" section — NOT the ignore table.

Rule 5 — Current line numbers in ignore report.
Code shifts during fixes. The ignore report must use current line numbers, not Codacy's original lines.
Verify line numbers after all fixes are applied.

Rule 6 — Patterns doc after every group.
Do not defer the patterns doc update to the end of the session.
After each group is addressed, update `docs/ai/general/SECURITY_CODING_PATTERNS.md`.

==================================================
WHEN TO USE THIS WORKFLOW
==================================================

Use for:

- Codacy PR comments listing CRITICAL or HIGH security findings
- SAST scanner results requiring individual finding triage
- batch false-positive review for security scanner signals
- situations where some findings are real risks and others are false positives in the same PR

Do not use for:

- production security incidents with a known trust-boundary breach (use `security-incident-workflow`)
- a single known vulnerability with a clear fix (use Implementation Agent directly)
- architecture audits (use `architecture-lint`)

==================================================
EXPECTED USER INPUT
==================================================

Required:

- the full Codacy finding list pasted from the PR comment or scanner UI
- each finding must include: file path, line number, rule name, finding text

Optional but helpful:

- the PR number and branch name
- whether any findings are already suspected to be false positives
- any known SEC-XX pattern matches from `docs/ai/general/SECURITY_CODING_PATTERNS.md`

==================================================
ORDERED WORKFLOW STEPS
==================================================

Step 1. Intake — Parse and Group

- Parse the raw Codacy findings from the user input.
- Group by vulnerability class (e.g. Timing Attack, Open Redirect, Command Injection, File Access, Weak RNG).
- For each finding, immediately cross-reference against `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
  If a finding matches an existing SEC-XX entry, mark its expected classification.
- Count findings per group, total count.

Output required from this step:

- `.copilot/tasks/{task_id}/intake.md`

**Pause for user review before proceeding to Step 2.**

---

Step 2. Group-by-Group Triage, Fix, and Suppress

Repeat for each group. One group at a time. Pause after each group.

For each finding in the group:

Triage (Security & Auth Agent):

1. Read the affected file in full.
2. Identify the exact runtime context — what the code does, what inputs reach that line.
3. Classify: Real Risk / Latent Risk / False Positive.
4. Apply Key Decision Rules 1–3 to determine the resolution.
5. If the finding matches a known SEC-XX entry, apply the documented correct pattern immediately.
6. If the finding is new, define the correct pattern before implementation begins.

Implementation (Implementation Agent): 7. Inspect affected files before editing. 8. Apply the minimum safe change. 9. For suppression: place rationale comment on the line before `eslint-disable-next-line`. 10. Update or add tests if behavior changes.

Patterns update (Security & Auth Agent): 11. Update `docs/ai/general/SECURITY_CODING_PATTERNS.md` with any new or updated SEC-XX entry.

Output required from this step:

- `.copilot/tasks/{task_id}/group-{N}-{slug}.md`

**Pause for user review after each group before continuing to the next.**

---

Step 3. Quality Gates

Run all quality gates after all groups are complete.

Commands (in order):

- `pnpm typecheck` — must exit 0
- `pnpm lint` — must produce 0 errors; pre-existing warnings acceptable
- `pnpm test` — no new failures; confirm any pre-existing failures were pre-existing

For lint: verify that all files from the Codacy findings have 0 errors and 0 warnings.
For test: if a new failure is found, stop and report before proceeding.

Output required from this step:

- `.copilot/tasks/{task_id}/quality-gates.md`

---

Step 4. Scanner Ignore Report

Produce the structured ignore report for the Codacy UI.

Apply Rule 4 strictly:

- Table 1 (safe to ignore): only findings whose code pattern still exists in source.
- Table 2 (resolved): findings fixed by real code changes — scanner should auto-resolve on re-scan.

Table 1 columns:
| # | File | Current Line | Rule / Vulnerability Class | Why It Is a False Positive |

Table 2 columns:
| # | File | Original Line | Vulnerability Class | How It Was Fixed |

Verify current line numbers against the actual post-fix code before writing the artifact.

Output required from this step:

- `.copilot/tasks/{task_id}/scanner-ignore-report.md`

---

Step 5. Final Patterns Propagation

**MANDATORY — the workflow is not complete until this step passes.**

Review all new SEC-XX entries added during this session.

If new SEC-XX entries were added:

1. Update `AGENTS.md` (root) — add rule to the SEC table.
2. Update `docs/ai/general/02 - Security & Auth Agent.md` — mandatory startup rules.
3. Update `docs/ai/general/04 - Implementation Agents.md` — if SEC category affects implementation patterns.
4. Update `.github/agents/security-auth.agent.md` and `.github/agents/implementation-agent.agent.md`.
5. If pattern affects E2E code: update `docs/ai/general/07 - Playwright E2E Agent.md` and `.github/agents/playwright-e2e.agent.md`.

If no new SEC-XX entries (all matched existing patterns):

- State which entries were matched.
- Confirm no propagation needed.
- Still produce the artifact.

Output required from this step:

- `.copilot/tasks/{task_id}/patterns-propagation-report.md`

==================================================
COMPLETION CHECKLIST
==================================================

Before closing the workflow:

- [ ] All Codacy findings are addressed (fixed, suppressed with rationale, or ignored with documented reason)
- [ ] `pnpm typecheck` — exit code 0
- [ ] `pnpm lint` — 0 errors
- [ ] `pnpm test` — no new failures
- [ ] All inline suppress comments have a rationale comment on the preceding line
- [ ] Scanner ignore report uses current line numbers and contains only still-present patterns
- [ ] `docs/ai/general/SECURITY_CODING_PATTERNS.md` is current
- [ ] Agent files propagated if new SEC-XX patterns were discovered
- [ ] All artifact files written to `.copilot/tasks/{task_id}/`

==================================================
ARTIFACT INDEX
==================================================

| Artifact                    | File                             | Step                             |
| --------------------------- | -------------------------------- | -------------------------------- |
| Task plan and checklist     | `plan.md`                        | Created by orchestrator at start |
| Grouped finding list        | `intake.md`                      | Step 1                           |
| Group triage + fix report   | `group-{N}-{slug}.md`            | Step 2 (one per group)           |
| Quality gate results        | `quality-gates.md`               | Step 3                           |
| Scanner ignore report       | `scanner-ignore-report.md`       | Step 4                           |
| Patterns propagation report | `patterns-propagation-report.md` | Step 5                           |

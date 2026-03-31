# Investigation: Agent Markdown Artifacts — Missing Code Fence Language Identifiers

## Bug Summary

CodeRabbit reviewed a PR that included AI agent-produced markdown artifacts
(`.zencoder/chats/1e50339e-aca5-45d4-ad3c-1b1acd16e48b/investigation.md`).
The review flagged multiple fenced code blocks with no language identifier (bare ` ``` `),
causing degraded syntax highlighting and accessibility.

Separately, the same PR had a critical bug: `.releaserc.json` still contained
`${nextRelease.notes}` in the commit message template — the fix described in the investigation
doc was never actually applied to the file. That issue is being handled via CodeRabbit's
apply-patch flow directly by the user.

This investigation focuses on the **structural cause**: agent instruction files do not mandate
language-tagged code fences in markdown output, so agents routinely produce bare fences.

---

## Root Cause Analysis

### Confirmed: No language-fence rule exists in agent instruction files

Neither `AGENTS.md` nor any file in `docs/ai/general/` currently contains a rule requiring:

- ` ```shell ` or ` ```bash ` for shell commands and terminal output
- ` ```json ` for JSON snippets
- ` ```text ` for plain text or stack traces
- ` ```typescript ` / ` ```javascript ` for code

Agents default to bare fences when no rule is enforced.

### Confirmed: The gap affects all agents that produce markdown artifacts

Investigation agents, orchestrators, and implementation agents all produce `.md` output
(investigation files, summaries, plans). Without an explicit rule, any of them may omit
language identifiers.

### Confirmed: CodeRabbit enforces this as an actionable finding (not just a preference)

The review categorized missing language identifiers as a concrete accessibility and
readability issue — not merely a style nitpick.

---

## Affected Components

| Component                                     | File                                                  | Role                                                     |
| --------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| Primary always-applied context                | `AGENTS.md`                                           | Applied to all agents; missing markdown formatting rules |
| Debug Investigation Agent prompt              | `docs/ai/general/06 - Debug Investigation Agent.md`   | Produces investigation.md artifacts                      |
| Workflow Orchestrator Agent prompt            | `docs/ai/general/08 - Workflow Orchestrator Agent.md` | Produces plan artifacts                                  |
| Implementation Agent prompt                   | `docs/ai/general/04 - Implementation Agents.md`       | Produces implementation notes                            |
| All other agent prompts in `docs/ai/general/` | `01` through `09`                                     | May produce markdown artifacts                           |
| GitHub Copilot agent files                    | `.github/agents/*.agent.md`                           | Parallel instruction surface                             |

---

## Proposed Solution

### Primary fix: Add markdown code-fence rule to `AGENTS.md`

Under the "Response Quality" or "Documentation And ADR Discipline" section, add:

> All fenced code blocks in markdown artifacts MUST include a language identifier.
> Use `shell` or `bash` for terminal output and commands, `json` for JSON, `text` for
> plain text or stack traces, and the appropriate language token for all source code.
> Bare ` ``` ` fences are not acceptable.

### Secondary fix: Propagate to `docs/ai/general/06 - Debug Investigation Agent.md`

Add the same rule to the output quality section of the Debug Investigation Agent prompt,
since it is the primary producer of investigation markdown artifacts.

### Optional: Propagate to other agent prompts

Apply to any other agent prompts that regularly produce markdown artifacts with code blocks.

---

## Implementation Notes

User confirmed all 3 CodeRabbit findings are valid. The `.releaserc.json` and `investigation.md`
inconsistency fixes are being applied directly via CodeRabbit's patch button.

This investigation artifact covers the agent instruction update work only.

**Scope of changes:**

- `AGENTS.md` — add language-fence rule to Response Quality section
- `docs/ai/general/06 - Debug Investigation Agent.md` — add language-fence rule to output quality section
- Evaluate other agent prompts for the same gap and propagate as needed

No automated tests applicable — these are AI instruction files with no test framework coverage.
Validation is by inspection: verify the rule text appears in each updated file.

---

## Implementation Results

**Changes applied:**

| File                                                | Change                                                        |
| --------------------------------------------------- | ------------------------------------------------------------- |
| `AGENTS.md`                                         | Added language-fence rule to `## Response Quality` section    |
| `docs/ai/general/06 - Debug Investigation Agent.md` | Added language-fence rule to `## Output Expectations` section |

**Rule text added to AGENTS.md:**

> All fenced code blocks in markdown artifacts MUST include a language identifier.
> Use `shell` or `bash` for terminal output and commands, `json` for JSON, `text` for plain text and
> stack traces, `typescript` / `javascript` for source code, and the appropriate token for all other
> languages. Bare fences without a language identifier are not acceptable.

**Rule text added to 06 - Debug Investigation Agent.md:**

> all fenced code blocks in markdown artifacts MUST include a language identifier — use `shell` or `bash`
> for terminal output and commands, `json` for JSON, `text` for plain text and stack traces, and the
> appropriate language token for all source code; bare fences are not acceptable

**No automated tests applicable.** These are AI instruction files. Validation confirmed by inspection — rule text verified present in both files via grep.

**Scope decision:** Rule added to `AGENTS.md` (always-applied to all agents) for global coverage, plus reinforced in `06 - Debug Investigation Agent.md` (the primary producer of the artifact that triggered this finding). Other agent files inherit the rule via `AGENTS.md`.

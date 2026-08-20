#!/usr/bin/env python3
"""
Phase 5: add a "Claude Code Skill" column to the two wide correspondence
tables in AGENTS.md and docs/ai/general/REPOSITORY_AI_CONTEXT.md, deriving
each Claude path from the existing Codex Skill column
(.agents/skills/<name>/SKILL.md -> .claude/skills/<name>/SKILL.md).

Re-parses each header/row rather than assuming fixed padding, so it's not
fragile to the whitespace-alignment mismatches that broke a plain
Edit-tool string match on the first attempt (recorded in plan.md).

This script is a record of what was run, not idempotent -- running it again
on an already-updated file would insert a second Claude column. It's kept
for reproducibility / audit, not for re-execution.
"""
import re
from pathlib import Path


def add_claude_column(lines, header_match_fn, last_col_name):
    start = None
    for i, line in enumerate(lines):
        if line.startswith("|") and header_match_fn(line):
            start = i
            break
    assert start is not None, "header not found"

    header = lines[start]
    sep = lines[start + 1]
    parts = [p.strip() for p in header.strip().strip("|").split("|")]
    assert parts[-1] == last_col_name, parts
    new_parts = parts[:-1] + ["Claude Code Skill"] + parts[-1:]
    lines[start] = "| " + " | ".join(new_parts) + " |"

    sep_parts = [p.strip() for p in sep.strip().strip("|").split("|")]
    new_sep_parts = sep_parts[:-1] + ["-" * len("Claude Code Skill")] + sep_parts[-1:]
    lines[start + 1] = "| " + " | ".join(new_sep_parts) + " |"

    i = start + 2
    count = 0
    while i < len(lines) and lines[i].startswith("|"):
        row = lines[i]
        parts = [p.strip() for p in row.strip().strip("|").split("|")]
        codex_cell = parts[-2]
        m = re.search(r"\.agents/skills/([a-z0-9-]+)/SKILL\.md", codex_cell)
        claude_cell = f"`.claude/skills/{m.group(1)}/SKILL.md`" if m else "—"
        new_parts = parts[:-1] + [claude_cell] + parts[-1:]
        lines[i] = "| " + " | ".join(new_parts) + " |"
        i += 1
        count += 1
    return count


if __name__ == "__main__":
    for path in [Path("AGENTS.md"), Path("docs/ai/general/REPOSITORY_AI_CONTEXT.md")]:
        lines = path.read_text().split("\n")
        n1 = add_claude_column(
            lines, lambda l: l.startswith("| #") and "Role" in l, "ZenFlow Preset"
        ) if path.name == "AGENTS.md" else add_claude_column(
            lines, lambda l: l.startswith("| #") and "Role" in l, "ZenFlow Presets"
        )
        n2 = add_claude_column(
            lines, lambda l: l.startswith("| Workflow") and "Neutral Spec" in l, "ZenFlow Workflow"
        )
        path.write_text("\n".join(lines))
        print(f"{path}: {n1} role rows, {n2} workflow rows")

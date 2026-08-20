#!/usr/bin/env python3
"""
Phase 6: add the new .claude/skills/ path to every per-role/workflow
"propagate updates to" list in docs/ai/codex/README.md's Compatibility
Notes section, plus docs/ai/claude/ to each guide-enumeration bullet.

Scoped to text after the "## Compatibility Notes" heading only -- the same
.agents/skills/<name>/SKILL.md path also appears earlier in the file's
"Real Codex Skill" inventory, which must NOT gain a Claude line (that's
Codex's own inventory, not a propagation list).

Record of what was run; not idempotent on an already-updated file.
"""
from pathlib import Path

path = Path("docs/ai/codex/README.md")
text = path.read_text()

marker = "## Compatibility Notes\n"
idx = text.index(marker)
head, tail = text[:idx], text[idx:]

roles = [
    "architecture-guard", "security-auth", "nextjs-runtime",
    "implementation-agent", "validation-strategy", "debug-investigation",
    "playwright-e2e", "workflow-orchestrator", "task-brief-authoring",
]
extra = ["safe-refactor-workflow"]

for name in roles + extra:
    old = f"- `.agents/skills/{name}/SKILL.md`\n"
    new = old + f"- `.claude/skills/{name}/SKILL.md`\n"
    assert tail.count(old) == 1, name
    tail = tail.replace(old, new, 1)

old_guides = "the non-authoritative guides under `docs/ai/copilot/`, `docs/ai/zencoder/`, and `docs/ai/codex/`"
new_guides = "the non-authoritative guides under `docs/ai/copilot/`, `docs/ai/zencoder/`, `docs/ai/codex/`, and `docs/ai/claude/`"
tail = tail.replace(old_guides, new_guides)

old_tba = "- `docs/ai/zencoder/09 - Task Brief Authoring.md`\n- the non-authoritative guides under `docs/ai/codex/`\n"
new_tba = "- `docs/ai/zencoder/09 - Task Brief Authoring.md`\n- the non-authoritative guides under `docs/ai/codex/` and `docs/ai/claude/`\n"
assert tail.count(old_tba) == 1
tail = tail.replace(old_tba, new_tba)

old_broad = (
    "- the matching `.github/prompts/*.prompt.md` files when they exist\n"
    "- the matching `.agents/skills/*-workflow/SKILL.md` files\n"
    "- the matching `.zenflow/workflows/*.md` files\n"
)
new_broad = (
    "- the matching `.github/prompts/*.prompt.md` files when they exist\n"
    "- the matching `.agents/skills/*-workflow/SKILL.md` files\n"
    "- the matching `.claude/skills/*-workflow/SKILL.md` files\n"
    "- the matching `.zenflow/workflows/*.md` files\n"
    "- the matching `docs/ai/claude/Workflow NN - *.md` guide files\n"
)
assert tail.count(old_broad) == 1
tail = tail.replace(old_broad, new_broad)

path.write_text(head + tail)
print("done")

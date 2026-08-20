#!/usr/bin/env python3
"""
Port docs/ai/codex/<file>.md (human-facing guide) -> docs/ai/claude/<file>.md.

Mechanical only: retargets the "real skill file" pointer from
.agents/skills/<name>/SKILL.md to .claude/skills/<name>/SKILL.md, adding the
Codex path back as a named sibling rather than dropping it. Everything else
("What it does", "When to use it", "When not to use it", "Startup Note",
"Output Shape", example prompts) is byte-identical -- that content describes
the role, not the tool.

README.md and Workflow Roadmap.md are intentionally NOT handled by this
script -- both contain Codex-specific reasoning (execution-model commentary,
full cross-tool compatibility tables) that needs deliberate authoring, not
mechanical substitution.
"""
from pathlib import Path

REPO = Path("/home/user/nextjs-16-boilerplate")

# guide filename (under docs/ai/codex/) -> skill directory name
MAPPING = {
    "01 - Architecture Guard Agent.md": "architecture-guard",
    "02 - Security & Auth Agent.md": "security-auth",
    "03 - Next.js Runtime Agent.md": "nextjs-runtime",
    "04 - Implementation Agents.md": "implementation-agent",
    "05 - Validation Strategy Agent.md": "validation-strategy",
    "06 - Debug Investigation Agent.md": "debug-investigation",
    "07 - Playwright E2E Agent.md": "playwright-e2e",
    "08 - Workflow Orchestrator Agent.md": "workflow-orchestrator",
    "09 - Task Brief Authoring.md": "task-brief-authoring",
    "Workflow 01 - Safe Feature Workflow.md": "safe-feature-workflow",
    "Workflow 02 - Safe Refactor Workflow.md": "safe-refactor-workflow",
    "Workflow 03 - Security Incident Workflow.md": "security-incident-workflow",
    "Workflow 04 - Incident Investigation Workflow.md": "incident-investigation-workflow",
    "Workflow 05 - Auth Flow Change Review Workflow.md": "auth-flow-change-review-workflow",
    "Workflow 06 - Playwright E2E Validation Workflow.md": "playwright-e2e-validation-workflow",
    "Workflow 07 - Change Validation Workflow.md": "change-validation-workflow",
    "Workflow 08 - Repository Baseline Validation Workflow.md": "repository-baseline-validation-workflow",
    "Workflow 10 - Codacy Security Review Workflow.md": "codacy-security-review-workflow",
    "Workflow 11 - Codacy Findings Review Workflow.md": "codacy-findings-review-workflow",
}


def port(filename: str, name: str) -> list[str]:
    src = REPO / "docs/ai/codex" / filename
    dst = REPO / "docs/ai/claude" / filename
    text = src.read_text()
    notes = []

    old_banner = (
        "> The real Codex skill that controls behavior is:\n"
        f"> **`.agents/skills/{name}/SKILL.md`**"
    )
    new_banner = (
        "> The real Claude Code skill that controls behavior is:\n"
        f"> **`.claude/skills/{name}/SKILL.md`**\n"
        f"> (Codex's equivalent: `.agents/skills/{name}/SKILL.md`.)"
    )
    n1 = text.count(old_banner)
    text = text.replace(old_banner, new_banner)
    notes.append(f"banner pointer: {n1} hit(s)")

    old_link = (
        f"Real Codex skill file: [`.agents/skills/{name}/SKILL.md`]"
        f"(../../../.agents/skills/{name}/SKILL.md)"
    )
    new_link = (
        f"Real Claude skill file: [`.claude/skills/{name}/SKILL.md`]"
        f"(../../../.claude/skills/{name}/SKILL.md) "
        f"(Codex equivalent: [`.agents/skills/{name}/SKILL.md`]"
        f"(../../../.agents/skills/{name}/SKILL.md))"
    )
    n2 = text.count(old_link)
    text = text.replace(old_link, new_link)
    notes.append(f"inline link: {n2} hit(s)")

    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(text)
    return notes


if __name__ == "__main__":
    for filename, name in MAPPING.items():
        print(f"=== {filename} ===")
        for line in port(filename, name):
            print(" ", line)

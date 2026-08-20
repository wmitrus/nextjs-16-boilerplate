#!/usr/bin/env python3
"""
Port .agents/skills/<name>/SKILL.md (Codex) -> .claude/skills/<name>/SKILL.md (Claude Code).

Rules applied (content is otherwise byte-identical — no rewording of Mission,
Working Mode, Forbidden Patterns, severity model, Working Sequence, etc.):

1. "Codex-native counterpart" -> "Claude-native counterpart"
2. "Codex-native runtime surface" -> "Claude-native runtime surface", and the
   sentence that used to make that claim gets a trailing clause naming Codex's
   file as the sibling surface for the same role/workflow (added, not removed).
3. In the "This is the Claude-native counterpart to:" bullet list, append a
   bullet pointing at the Codex source file itself, so Claude's version lists
   every sibling native surface (docs/ai/general source, Copilot/ZenFlow where
   present, and now Codex) instead of silently dropping it.
4. If a local "When the <role> changes, update:" propagation checklist exists,
   append a `.claude/skills/<name>/SKILL.md` bullet to it, right after the
   `.agents/skills/<name>/SKILL.md` line.
5. Nothing else is touched. If an anchor string isn't found, that rule is
   skipped for that file (logged), not guessed at — a missed annotation is
   safer than a wrong rewrite.
"""
import re
import sys
from pathlib import Path

REPO = Path("/home/user/nextjs-16-boilerplate")


def port(name: str) -> list[str]:
    src = REPO / ".agents/skills" / name / "SKILL.md"
    dst = REPO / ".claude/skills" / name / "SKILL.md"
    text = src.read_text()
    notes = []

    # Rule 1
    new_text, n = re.subn(r"Codex-native counterpart", "Claude-native counterpart", text)
    notes.append(f"rule1 (Codex-native counterpart -> Claude-native counterpart): {n} hit(s)")
    text = new_text

    # Rule 3: append a bullet for the Codex source right after the counterpart-to list.
    # Anchor: the "Claude-native counterpart to:" line, followed by a blank line,
    # then a run of "- `...`" bullets, then a blank line.
    pattern = re.compile(
        r"(This is the Claude-native counterpart to:\n\n(?:- `[^\n]+`\n)+)(\n)"
    )
    def add_codex_bullet(m):
        return m.group(1) + f"- `.agents/skills/{name}/SKILL.md`\n" + m.group(2)
    new_text, n = pattern.subn(add_codex_bullet, text)
    notes.append(f"rule3 (append Codex sibling bullet to counterpart list): {n} hit(s)")
    text = new_text

    # Rule 2: runtime-surface sentence. Two known phrasings depending on
    # specialist-role vs workflow file wording.
    replacements = [
        (
            "This skill is the Codex-native runtime surface for that role in this repository.",
            "This skill is the Claude-native runtime surface for that role in this repository. "
            f"`.agents/skills/{name}/SKILL.md` remains the Codex-native runtime surface for the same role.",
        ),
        (
            "this skill is the Codex-native runtime surface for that role in this repository",
            "this skill is the Claude-native runtime surface for that role in this repository, alongside "
            f"`.agents/skills/{name}/SKILL.md` as the Codex-native runtime surface for the same role",
        ),
        (
            "this skill is the Codex-native runtime surface for the same workflow intent",
            "this skill is the Claude-native runtime surface for the same workflow intent, alongside "
            f"`.agents/skills/{name}/SKILL.md` as the Codex-native runtime surface for the same workflow",
        ),
    ]
    total = 0
    for old, new in replacements:
        new_text, n = (text.replace(old, new), text.count(old))
        text = new_text
        total += n
    notes.append(f"rule2 (runtime-surface sentence gains Codex-sibling clause): {total} hit(s)")

    # Rule 4: local propagation checklist, if present.
    prop_anchor = f"- `.agents/skills/{name}/SKILL.md`\n"
    m = re.search(r"When (?:the role|this workflow) changes, update:", text)
    idx = m.start() if m else -1
    n4 = 0
    if idx != -1:
        # find the anchor bullet after that heading and append our bullet right after it
        rest = text[idx:]
        rel = rest.find(prop_anchor)
        if rel != -1:
            insert_at = idx + rel + len(prop_anchor)
            addition = f"- `.claude/skills/{name}/SKILL.md`\n"
            if addition not in text:
                text = text[:insert_at] + addition + text[insert_at:]
                n4 = 1
    notes.append(f"rule4 (append Claude bullet to local propagation checklist): {n4} hit(s)")

    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(text)
    return notes


if __name__ == "__main__":
    for skill_name in sys.argv[1:]:
        print(f"=== {skill_name} ===")
        for line in port(skill_name):
            print(" ", line)

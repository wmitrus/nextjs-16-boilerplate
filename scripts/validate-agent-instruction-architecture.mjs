import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MAX_ROOT_BYTES = 16_384;
let failed = false;

function fail(label, details) {
  console.error(`FAIL: ${label}`);
  for (const detail of details) console.error(`  ${detail}`);
  failed = true;
}

function pass(label) {
  console.log(`PASS: ${label}`);
}

function markdownFiles(path) {
  const stat = statSync(path);
  if (stat.isFile()) return path.endsWith('.md') ? [path] : [];

  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    return markdownFiles(child);
  });
}

function findText(files, pattern) {
  const findings = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (pattern.test(line)) findings.push(`${file}:${index + 1}: ${line.trim()}`);
      pattern.lastIndex = 0;
    });
  }
  return findings;
}

function skillNames(root) {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

const claudeFiles = [
  'CLAUDE.md',
  ...markdownFiles('.claude/skills'),
  ...markdownFiles('docs/ai/claude'),
];
const codexFiles = [
  'AGENTS.md',
  ...markdownFiles('.agents/skills'),
  ...markdownFiles('docs/ai/codex'),
];

const claudeCoupling = findText(claudeFiles, /AGENTS\.md/);
if (claudeCoupling.length > 0) {
  fail('Claude surfaces must not depend on AGENTS.md', claudeCoupling);
} else {
  pass('Claude surfaces are isolated from AGENTS.md');
}

const codexCoupling = findText(codexFiles, /CLAUDE\.md/);
if (codexCoupling.length > 0) {
  fail('Codex surfaces must not depend on CLAUDE.md', codexCoupling);
} else {
  pass('Codex surfaces are isolated from CLAUDE.md');
}

const codexReloads = findText(
  markdownFiles('.agents/skills'),
  /read `AGENTS\.md`|preload `AGENTS\.md`|preload full AGENTS/i,
);
if (codexReloads.length > 0) {
  fail('Codex skills inherit AGENTS.md and must not reload it', codexReloads);
} else {
  pass('Codex skills do not reload AGENTS.md');
}

const codexSkills = skillNames('.agents/skills');
const claudeSkills = skillNames('.claude/skills');
const onlyCodex = codexSkills.filter((name) => !claudeSkills.includes(name));
const onlyClaude = claudeSkills.filter((name) => !codexSkills.includes(name));

if (onlyCodex.length > 0 || onlyClaude.length > 0) {
  fail('Codex and Claude skill names must remain paired', [
    ...onlyCodex.map((name) => `Codex only: ${name}`),
    ...onlyClaude.map((name) => `Claude only: ${name}`),
  ]);
} else {
  pass(`Codex and Claude skill names are paired (${codexSkills.length}/${claudeSkills.length})`);
}

for (const [root, names] of [
  ['.agents/skills', codexSkills],
  ['.claude/skills', claudeSkills],
]) {
  const missing = names
    .map((name) => join(root, name, 'SKILL.md'))
    .filter((file) => {
      try {
        return !statSync(file).isFile();
      } catch {
        return true;
      }
    });

  if (missing.length > 0) {
    fail(`every skill under ${root} must contain SKILL.md`, missing);
  } else {
    pass(`every skill under ${root} contains SKILL.md`);
  }
}

for (const root of ['AGENTS.md', 'CLAUDE.md']) {
  const size = statSync(root).size;
  if (size > MAX_ROOT_BYTES) {
    fail(`${root} must stay within the ${MAX_ROOT_BYTES}-byte always-on budget`, [
      `${size} bytes`,
    ]);
  } else {
    pass(`${root} stays within the ${MAX_ROOT_BYTES}-byte always-on budget (${size} bytes)`);
  }
}

if (failed) process.exitCode = 1;

# Incident Intake

## Incident Description

Codacy static analysis reported 4 CRITICAL security findings in `scripts/e2e/`:

1. **[load-env.mjs:17] — File Access / Dynamic Path** — `fs.existsSync(filePath)` where `filePath` is dynamically constructed.
2. **[load-env.mjs:21] — File Access / Dynamic Path** — `fs.readFileSync(filePath, 'utf8')` where `filePath` is dynamically constructed.
3. **[run-scenario.mjs:211] — HTTP / User-Controlled URL** — `fetch(baseUrl, ...)` where `baseUrl` is derived from an environment variable without validation.
4. **[run-scenario.mjs:318] — File Access / Dynamic Path** — `fs.mkdirSync(path.dirname(databasePath), { recursive: true })` where `databasePath` is dynamically constructed.

All four findings fall under the categories: **path traversal** (CWE-22) and **SSRF** (CWE-918).

---

## Suspected Severity

**CRITICAL** per Codacy classification.

Actual exploitability in this specific repository context is **low** for the path traversal findings (allowlist validation exists upstream in `parseArgs`) and **medium** for the SSRF finding (no URL validation against localhost/allowed hosts before fetch).

However, the defense-in-depth is insufficient: the safety relies solely on upstream caller validation and is not enforced at the point of use.

---

## Affected Surface

| File                           | Line | Finding                                                                     |
| ------------------------------ | ---- | --------------------------------------------------------------------------- |
| `scripts/e2e/load-env.mjs`     | 17   | `fs.existsSync(filePath)` — no path canonicalization guard                  |
| `scripts/e2e/load-env.mjs`     | 21   | `fs.readFileSync(filePath, 'utf8')` — no path canonicalization guard        |
| `scripts/e2e/run-scenario.mjs` | 211  | `fetch(baseUrl)` — URL from env var, not validated                          |
| `scripts/e2e/run-scenario.mjs` | 318  | `fs.mkdirSync(path.dirname(databasePath))` — no path canonicalization guard |

These are **E2E test runner scripts** (Node.js, not Next.js App Router). They execute locally during development and CI. They are **not part of the deployed application**.

---

## Known Symptoms

- No runtime failure has occurred. These are static analysis findings.
- Codacy reports them as CRITICAL without distinguishing from runtime-exploitable issues.
- The current code uses allowlist validation of `scenario` and `variant` values in `parseArgs` (see `run-scenario.mjs:20-43`), but does **not** enforce that validation at the file path or URL construction layer.

---

## Known Constraints

1. These are scripts — not application code. No App Router, no server actions, no route handlers are involved.
2. Fixes must not break the E2E scenario runner behavior.
3. Fixes must be minimal and not restructure the scripts unnecessarily.
4. Path canonicalization must use `path.resolve()` + prefix-check pattern (canonical defense for CWE-22).
5. URL validation must restrict to `localhost` / `127.0.0.1` / `::1` (this is an E2E script; it only ever targets local dev server).
6. No new runtime dependencies should be added.
7. Rules documenting these patterns must be added to the appropriate AI governance files so agents and Copilot avoid introducing this pattern in future work.

---

## Initial Unknowns

1. **Whether the path canonicalization fix needs to be in `load-env.mjs` only, or also in `run-scenario.mjs` separately.**
   - Preliminary answer: both files require independent guards because the functions are reusable and their safety cannot rely on caller discipline.

2. **Which AI governance files should receive the new rules.**
   - Candidates: `AGENTS.md`, `docs/ai/general/02 - Security & Auth Agent.md`, `docs/ai/general/04 - Implementation Agents.md`, `docs/ai/copilot/02 - Security & Auth Agent.md`, `docs/ai/copilot/04 - Implementation Agents.md`, `docs/ai/zencoder/02 - Security & Auth Agent.md`, `docs/ai/zencoder/04 - Implementation Agents.md`, and possibly `docs/ai/general/REPOSITORY_AI_CONTEXT.md`.

3. **Whether the SSRF finding in `run-scenario.mjs:211` requires blocking private IP ranges or just localhost allowlisting.**
   - Since this is an E2E test script exclusively targeting `http://localhost:3000`, restricting to localhost is correct and sufficient.

4. **Whether existing tests cover these paths and would catch a regression.**
   - These are scripts, not tested by unit tests. Validation will rely on typecheck, lint, and manual smoke test of the script invocation pattern.

---

## Incident Classification

| Dimension            | Assessment                                                                   |
| -------------------- | ---------------------------------------------------------------------------- |
| Type                 | Static analysis security findings — CWE-22 (Path Traversal) + CWE-918 (SSRF) |
| Exploitability       | Low-to-Medium in practice (allowlist guards exist upstream)                  |
| Defense posture      | Insufficient (point-of-use guards are missing)                               |
| Blast radius of fix  | Low (scripts only, not application code)                                     |
| Urgency              | High (Codacy CRITICAL must be resolved before merge gates pass)              |
| Documentation impact | High (rules must be codified to prevent recurrence)                          |

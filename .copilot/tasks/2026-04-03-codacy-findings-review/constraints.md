# Constraints

## Review Constraints

- Treat `.codacy/reports/codacy-findings-preview.json` as the authoritative finding inventory.
- Treat live repository code as the source of truth for classification.
- Read affected code before proposing fixes, suppressions, or rule-tuning decisions.
- Cross-reference every finding against `docs/ai/general/SECURITY_CODING_PATTERNS.md`.

## Classification Constraints

- Every finding must end as one of: Real Risk, Latent Risk, False Positive, or Tooling Noise / Out-of-Scope.
- Group review by severity first, then by rule/type, then by repository priority.
- Prefer production runtime review effort over tests, scripts, and local tooling when severities are equal.

## Change Constraints

- Do not implement broad cleanups unless triage shows clear repository value.
- Do not add suppressions or ignores before verifying whether a safer code pattern exists.
- If durable false-positive or remediation patterns are confirmed, update `docs/ai/general/SECURITY_CODING_PATTERNS.md` and propagate the instruction to relevant AI guidance.

## Validation Constraints

- If no code changes are made, record review-only validation explicitly.
- If code changes are made later, keep validation focused on the touched surfaces.

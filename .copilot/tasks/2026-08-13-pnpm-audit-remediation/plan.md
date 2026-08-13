# Plan

## Task Metadata

- Task ID: `2026-08-13-pnpm-audit-remediation`
- Objective: Remediate current `pnpm audit` advisories with minimal override and
  direct dependency changes.
- Status: Done.

## Checklist

- [done] Capture and classify the current audit report.
- [done] Trace advisory paths and verify patched package versions exist.
- [done] Update resolvable dependency floors and regenerate the lockfile.
- [done] Re-run audit and record the upstream-blocked `image-size` exception.

## Scope Boundary

- Do not perform a broad dependency refresh.
- Do not add an override for unpublished `image-size@2.0.3`.
- Keep the `image-size` finding explicit until its upstream fix is published or
  its parent no longer requires the vulnerable package.

## Outcome

- `pnpm audit` exits successfully with only two documented ignored advisories
  for unpublished `image-size@2.0.3`.
- `pnpm audit --prod` reports zero known vulnerabilities.

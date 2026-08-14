# pnpm Audit Remediation Plan

## Baseline And Override Review

- `pnpm audit` reports active findings only through the dev dependency
  `vercel@59.0.0`; production dependencies are not in the reported paths.
- The actionable packages are `tar@7.5.7` (including a critical advisory),
  `path-to-regexp@6.1.0/8.2.0/8.3.0`, `minimatch@10.1.1`, `ajv@8.6.3`,
  `smol-toml@1.5.2`, and `@tootallnate/once@2.0.0`.
- `vercel@59.0.0` is already the latest release and still declares these
  vulnerable transitive versions, so a direct dependency update cannot fix the
  current audit.
- Existing `pnpm-workspace.yaml` overrides already serve as security and
  compatibility pins across several toolchains. Some overlap or target older
  ranges, but removing them is not required to close the current findings and
  would create unrelated lockfile churn. They remain unchanged in this task.
- The two ignored `image-size@2.0.2` advisories remain upstream-blocked because
  their declared fix `2.0.3` is not published. The existing GHSA-specific
  exceptions remain unchanged; no fabricated version override will be added.
- Unrelated staged and unstaged changes under
  `scripts/validate-vercel-prebuilt-artifact*` are outside scope and must remain
  untouched.

## Implementation

- [ ] Add range-scoped overrides for the minimum patched releases, preserving
      each package's current major version:
  - `@tootallnate/once@<2.0.1` -> `2.0.1`
  - `ajv@>=7.0.0 <8.18.0` -> `8.18.0`
  - `minimatch@>=10.0.0 <10.2.3` -> `10.2.3`
  - `path-to-regexp@>=6.0.0 <6.3.0` -> `6.3.0`
  - `path-to-regexp@>=8.0.0 <8.4.0` -> `8.4.0`
  - `smol-toml@<1.6.1` -> `1.6.1`
  - `tar@>=7.0.0 <7.5.21` -> `7.5.21`
- [ ] Regenerate only `pnpm-lock.yaml` with `pnpm install --lockfile-only`.
- [ ] Confirm the resolved versions and dependency ownership with `pnpm why`.

## Validation

- [ ] `pnpm audit` succeeds, with only the two documented ignored
      `image-size` advisories reported as exceptions.
- [ ] `pnpm audit --prod` reports zero known vulnerabilities.
- [ ] `pnpm typecheck` passes.
- [ ] Focused Vercel prebuilt-artifact tests pass because the vulnerable tree is
      owned by the Vercel CLI used by that tooling.
- [ ] ESLint remains skipped under the repository's temporary 2026-08-14
      execution blocker.

## Decision Rule

If lockfile regeneration cannot resolve any minimum patched version, or if the
focused checks expose an incompatible transitive API, revert only that new
override and reassess the owning Vercel package. Do not suppress a new advisory
and do not modify unrelated source changes.

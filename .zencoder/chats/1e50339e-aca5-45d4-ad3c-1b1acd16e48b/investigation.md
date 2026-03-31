# Bug Investigation: Release CI Failure (E2BIG)

## Bug Summary

The `release` CI job failed on the `main` branch push from the largest PR (#27 — `feat/drizzle`).
The failure occurred during the `prepare` step of `@semantic-release/git`, which attempted to
run `git commit -m "chore(release): 1.11.0 [skip ci]\n\n<FULL_RELEASE_NOTES>"`.
The OS rejected the `execve()` call with error `E2BIG` (errno -7: Argument list too long).

**v1.11.0 was NOT released.** The latest tag remains `v1.10.0`. The release aborted before
creating the tag, publishing, or pushing the commit.

---

## Root Cause Analysis

### Confirmed: `.releaserc` embeds `${nextRelease.notes}` in the git commit message

The `@semantic-release/git` plugin is configured as:

```json
[
  "@semantic-release/git",
  {
    "assets": ["CHANGELOG.md", "package.json"],
    "message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
  }
]
```

The `${nextRelease.notes}` variable is interpolated with the **full generated CHANGELOG entry**
for the release. With 1,475 commits since `v1.10.0`, this string is enormous.

### Confirmed: 1,475 commits since last release

```
semantic-release: Found 1475 commits since last release
```

Verified locally:

```
git log v1.10.0..HEAD --oneline | wc -l  →  1475
```

### Confirmed: Linux `E2BIG` kernel limit exceeded

The error is:

```
spawn E2BIG
errno: -7,
code: 'E2BIG',
syscall: 'spawn',
```

`E2BIG` is thrown by the Linux kernel when `execve()` is called with an argument list
(argv + environment) exceeding `ARG_MAX` (~2MB on Ubuntu 24.04). The release notes string
alone — with 1,475 commits converted to markdown — exceeded this limit.

### Confirmed: Failure location in the call stack

```
at commit (.../node_modules/@semantic-release/git@10.0.1/lib/git.js:38:9)
at module.exports (.../node_modules/@semantic-release/git@10.0.1/lib/prepare.js:63:11)
```

The failure is inside `execa@5.1.1` → `child_process.spawn()` — Node.js cannot even start
the `git commit` process because the argument is too large. This is not a git error — it is
an OS-level argument size rejection.

### Confirmed: CHANGELOG.md itself is a proxy for release notes size

Current CHANGELOG.md (all prior releases): **118,678 bytes / 767 lines**.
The v1.11.0 notes for 1,475 commits would be significantly larger than any prior release.

---

## Affected Components

| Component                      | File                            | Role                                                              |
| ------------------------------ | ------------------------------- | ----------------------------------------------------------------- |
| Semantic-release config        | `.releaserc`                    | Defines the commit `message` template with `${nextRelease.notes}` |
| Release CI workflow            | `.github/workflows/release.yml` | Triggers `pnpm run release` on `main` push                        |
| `@semantic-release/git@10.0.1` | npm package                     | Executes `git commit` with the expanded message string            |
| `execa@5.1.1`                  | npm package                     | Spawns the git process; propagates `E2BIG`                        |

No application source files are affected. This is a CI/release tooling configuration bug.

---

## Proposed Solution

### Option A — Temporary fix (user's preferred approach): remove notes from commit message for this one release, then revert

**Change in `.releaserc`** (`@semantic-release/git` `message` field):

```json
"message": "chore(release): ${nextRelease.version} [skip ci]"
```

Remove `\n\n${nextRelease.notes}` from the commit message. The CHANGELOG.md file is still
fully written by `@semantic-release/changelog` — no information is lost. It just stops being
duplicated in the git commit message body.

**After the release succeeds**, revert `.releaserc` back to:

```json
"message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
```

**Risk**: Low. CHANGELOG.md content is unaffected. The GitHub release notes are unaffected.
The only change is the git commit message body used for the release commit itself.

**Side effect of reverting**: After the revert commit, the next release (which will be small —
just the revert commit) will include `${nextRelease.notes}` in its commit message again.
That next release will be tiny, so it won't hit `E2BIG` again.

### Option B — Permanent fix: keep notes out of the commit message

Keep the shortened `message` permanently. The commit message body has no functional purpose —
the CHANGELOG.md file and GitHub Release both contain the notes. This is the safer long-term
configuration.

### Option C — Keep the template but truncate notes (not recommended)

Would require forking or wrapping `@semantic-release/git`, or using `@semantic-release/exec`
to do the commit manually. High complexity, not warranted.

---

## Pre-conditions for Running the Fix

Before running the release again:

1. **v1.11.0 tag does NOT exist** — confirmed. Safe to re-run without double-release risk.
2. **package.json** — was bumped to `1.11.0` by the partial run but NOT committed (the commit
   failed). The working tree on the runner was discarded. The local repo still shows `1.10.0`.
   Verify: `cat package.json | grep '"version"'` — should still be `1.10.0`.
3. **CHANGELOG.md** — was written on the runner but NOT committed. Local file is unchanged.

These confirm it is safe to re-trigger the release after applying the fix.

---

## Implementation Notes

**Change applied to**: `.releaserc.json`

**Before**:

```json
"message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
```

**After**:

```json
"message": "chore(release): ${nextRelease.version} [skip ci]"
```

Removed `\n\n${nextRelease.notes}` from the `@semantic-release/git` commit message template.
JSON validity confirmed after edit. No other files changed.

This is a **temporary fix** (Option A). After v1.11.0 releases successfully, the user must
open a second PR to restore the original message template.

---

## Test Results

No automated tests applicable: this is a CI tooling config file with no test framework coverage.
The only meaningful validation is the release CI run itself.

**Manual validation steps confirmed:**

- `.releaserc.json` is valid JSON ✓
- `v1.11.0` tag does not exist locally — safe to release ✓
- `package.json` version is still `1.10.0` — no partial state from failed run ✓

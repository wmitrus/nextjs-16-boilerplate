# Script Implementation Patterns

## Purpose

This document is the neutral cross-tool authority for recurring implementation
patterns under `scripts/**` and related E2E/tooling helpers.

Load it when creating or changing repository scripts, command-line entry
points, environment loaders, filesystem helpers, dynamic environment access,
or tooling that consumes configurable paths or URLs. Do not load it for
unrelated application work.

Security details remain authoritative in
`docs/ai/general/SECURITY_CODING_PATTERNS.md`. Implementation-wide anti-patterns
remain authoritative in
`docs/ai/general/IMPLEMENTATION_ANTI_PATTERNS.md`.

Inspect live helpers and call sites before choosing a pattern. Do not recreate a
utility that already exists.

## Environment Loading

Standalone `tsx` scripts do not automatically receive the repository's local
environment-file behavior. A script that depends on repository environment
files must import the established loader before importing modules that evaluate
environment configuration.

For simple scripts using the local environment contract:

```typescript
import '../load-env';
```

Adjust the relative path for the script location. This import must be the first
runtime import when later imports may initialize T3-Env or otherwise read
environment values at module evaluation time.

Scripts that require the wider layered environment-file contract should use
`scripts/load-env-files.ts`. That loader handles the repository's base, local,
and Vercel-pulled environment files while preserving process-injected values.
Use the loader already established by neighboring scripts instead of selecting
one by guesswork.

Do not launch the `tsx` shell wrapper through `node --env-file`. The repository
package-script shape is:

```json
{
  "scripts": {
    "example": "tsx scripts/example.ts"
  }
}
```

When adding or changing environment variables, update the live schema and
templates and run the environment consistency checks required by
`docs/ai/general/VALIDATION_AND_QUALITY_GATES.md`.

## Environment Variable Access

Avoid raw dynamic access such as:

```typescript
const value = process.env[name];
```

When the allowed keys form a finite set, use an explicit branch, switch, typed
record, or allowlisted accessor. Prefer a representation that makes the domain
visible to TypeScript and static analysis.

Dynamic access may be justified when a generic helper receives a closed,
validated key domain, but the validation must be visible at the access point.
Do not suppress a finding merely because the current caller happens to pass a
literal.

SEC-18 in `docs/ai/general/SECURITY_CODING_PATTERNS.md` is authoritative for
dynamic tooling environment access.

## Import-Safe Command Entry Points

A script that exports functions and also performs side effects must guard its
command entry point. Importing the module in tests must not execute the command.

Use the path convention established by neighboring scripts. A typical pattern
is:

```typescript
const isMain =
  typeof process.argv[1] === 'string' &&
  process.argv[1].endsWith('/scripts/example.ts');

if (isMain) {
  run().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
```

The suffix must identify the actual script narrowly. Do not use a broad suffix
that can match unrelated modules.

Use `process.exitCode` when normal cleanup and output flushing should complete.
Use immediate `process.exit(...)` only when the script's established failure
semantics require immediate termination.

Add an import-safety test when module-level execution previously caused a
regression or the entry-point guard is non-obvious.

## Static Paths And `path.resolve`

For repository-owned static paths, use `path.resolve(...)` rather than
`path.join(...)` in script filesystem access. This is the established SEC-12
convention and is the shape expected by repository tooling and review.

A static literal path resolved from a trusted repository base is not equivalent
to a dynamic caller-controlled path. Do not add unnecessary confinement layers
or broad suppressions when the complete path is demonstrably static.

SEC-05 and SEC-12 in
`docs/ai/general/SECURITY_CODING_PATTERNS.md` define the distinction between
safe static paths, scanner false positives, and paths requiring confinement.

## Dynamic Path Confinement At The Sink

Any reusable helper or script that accepts a path from arguments,
configuration, environment, artifacts, ledger content, or another external
source must enforce base-directory confinement at the filesystem sink.

Use the shared TypeScript helpers from
`scripts/lib/fs-guards-shared.ts`, including:

- `assertPathWithinBase`;
- `pathExistsWithinBase`;
- `readTextFileWithinBase`;
- `writeTextFileSyncWithinBase`;
- `writeTextFileWithinBase`;
- `statPathWithinBase` and `statWithinBase`;
- `readDirentsWithinBase`;
- `createReadStreamWithinBase`;
- `ensureDirectorySyncWithinBase` and `ensureDirectoryWithinBase`;
- `unlinkSyncWithinBase`;
- `openSyncWithinBase`.

Use `scripts/lib/fs-guards.mjs` for JavaScript modules that cannot consume the
TypeScript helper directly.

Example:

```typescript
const content = readTextFileWithinBase(
  requestedPath,
  allowedDirectory,
  'deployment result',
);
```

The allowed base must express the actual trust boundary. Using the target's own
directory as the base after accepting an arbitrary target does not provide
meaningful confinement.

Do not validate a path in one layer and then reconstruct or mutate it before a
later filesystem call. The value returned by the confinement helper should be
the value passed to the sink.

SEC-16 and SEC-19 in
`docs/ai/general/SECURITY_CODING_PATTERNS.md` are authoritative for sink-level
confinement and shared helper usage.

## Reuse Before New Filesystem Wrappers

Do not repeat raw `fs.*` access when an existing shared wrapper represents the
required operation. Repeated one-off suppressions create inconsistent trust
boundaries and scanner churn.

Before adding a wrapper:

1. inspect `scripts/lib/fs-guards-shared.ts` and
   `scripts/lib/fs-guards.mjs`;
2. inspect nearby scripts with the same sink shape;
3. add a shared operation only when no existing helper preserves the required
   semantics;
4. test both an allowed path and an escaping path;
5. keep the base directory explicit at the call site.

Test-owned temporary directories may use direct setup and cleanup operations
when the test itself created and owns the exact directory. Keep any lint
suppression narrow and explain that ownership rather than weakening the rule
globally.

## Configurable URLs And Outbound Requests

Treat configurable and caller-influenced URLs as trust-boundary inputs.

Before an outbound request:

- parse the URL and validate its protocol;
- apply the repository's host allowlist policy;
- reject private, loopback, link-local, and otherwise forbidden address space
  according to the outbound security authority;
- resolve and validate DNS according to the established SSRF guard;
- reapply validation to every redirect target;
- preserve credential/header and request-body rules across redirects;
- use explicit timeout and response-size limits where the operation requires
  them.

Application outbound HTTP should use the established centralized transport,
such as `src/security/outbound/secure-fetch.ts`, when its contract applies.
Scripts must not create a weaker parallel fetch path merely because they run
outside an application request.

Retrieve SEC-28 and the related outbound transport entries from
`docs/ai/general/SECURITY_CODING_PATTERNS.md` before changing reusable outbound
request logic.

A literal trusted service URL does not require pretending that the value is
attacker-controlled. Conversely, a value coming from environment configuration
is not safe solely because operators normally control it; validate it when it
selects an outbound destination or crosses a reusable trust boundary.

## Error Handling And Sensitive Output

Script errors must be actionable without exposing secrets.

- include a stable operation label and the affected non-sensitive path or
  resource identifier when useful;
- never print tokens, connection strings, credentials, or raw environment-file
  contents;
- do not include credential-shaped example values in committed documentation or
  fixtures;
- distinguish invalid input, unavailable dependencies, and internal failures;
- preserve the original error as a cause where repository runtime support and
  logging conventions allow it;
- set a non-zero exit status for failed command execution.

If evidence must be written to task artifacts or committed markdown, redact
credential values with neutral placeholders.

## Testing And Validation

Select tests according to the script's boundary:

- parser or transformation logic: focused unit tests;
- filesystem confinement: allowed-path and escaping-path tests;
- environment loading: precedence, missing-file, malformed-entry, and
  non-overwrite behavior as applicable;
- importable command module: import-safety and command failure behavior;
- dynamic environment key: valid allowlisted key and rejected/absent-key cases;
- configurable URL or outbound request: protocol, host, address-resolution,
  redirect, timeout, and size-limit cases required by the applicable SEC rules;
- migration tooling: real journal and literal-path mapping validation.

Run applicable lint and type checks in addition to owning tests. Use
`docs/ai/general/VALIDATION_AND_QUALITY_GATES.md` for phase-close and reporting
requirements.

## Ownership And Propagation

This document owns the shared script-focused retrieval path. More specific SEC,
validation, and implementation documents remain authoritative for their
respective rules.

Runtime skills should load only the applicable sections. Do not duplicate this
document in `AGENTS.md`, `CLAUDE.md`, or every implementation skill. Propagate
instruction changes according to
`docs/ai/general/AGENT_INSTRUCTION_ARCHITECTURE.md`.

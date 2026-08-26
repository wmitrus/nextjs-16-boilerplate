# Database and Schema Patterns

## Purpose

This document is the neutral cross-tool entry point for recurring database,
schema, migration, and database-test constraints in this repository.

Load it when work touches Drizzle schemas or adapters, route parameters bound to
database identifiers, migrations, constraints, tenant-scoped persistence, or
database integration tests. Do not load it for unrelated implementation work.

Detailed security rules remain authoritative in
`docs/ai/general/SECURITY_CODING_PATTERNS.md`. Detailed validation behavior
remains authoritative in
`docs/ai/general/05 - Validation Strategy Agent.md`. This document connects
those rules into one database-focused retrieval path rather than duplicating
their full incident histories.

Live schemas, migrations, repositories, scripts, and tests remain
authoritative. Report drift between this document and executable code.

## Identifier Column Types

Choose a database type according to the identifier's authority and origin, not
according to whether its current example value happens to look UUID-shaped.

| Column type | Use when                                                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `uuid`      | Database-generated primary keys and foreign keys referencing UUID-typed primary keys.                                               |
| `text`      | Externally supplied or application-level string identifiers such as provider organization IDs, tenant slugs, and string scope keys. |

Do not use a Postgres `uuid` column for an externally controlled identifier
unless the external contract guarantees a valid UUID and the repository
deliberately adopts that contract.

Postgres validates UUID values during parameter binding. A non-UUID string
bound to a UUID column raises `22P02` before row predicates can protect the
query. Mocked query-builder tests do not reproduce this behavior.

See SEC-07 in `docs/ai/general/SECURITY_CODING_PATTERNS.md` for the complete
security rule and rationale.

## Route Parameters Bound To UUID Columns

App Router route parameters are untrusted strings. Validate a dynamic segment
before it reaches a Drizzle predicate, repository call, or mutation that binds a
Postgres UUID column.

Prefer the repository helper:

```typescript
const result = parseUuidRouteParam(params, 'id');

if (!result.ok) {
  return createValidationErrorResponse(result.fieldErrors);
}

const entity = await repository.findById(result.value);
```

An existing route may use an equivalent `z.uuid()` schema when that is its
established pattern. A presence check proves only that a string exists; it does
not prove that Postgres can bind it as a UUID.

Do not:

- alias a raw `params.*` value as a trusted identifier;
- pass a raw route parameter directly into `eq(...)` for a UUID column;
- rely on a valid-UUID not-found test as proof of malformed-input handling;
- convert a malformed identifier into an internal server error.

SEC-23 in `docs/ai/general/SECURITY_CODING_PATTERNS.md` is authoritative for the
security boundary and enforcement details.

## Required Malformed-Identifier Validation

Every route handler with a dynamic segment that is later bound to a UUID column
must have negative validation using a malformed value such as `not-a-uuid`.

The test must prove:

- the response status is `400`;
- no DB, repository, or read-service call that would bind the malformed value
  is reached;
- no mutation side effect is reached.

The repository's static UUID route-param guard must also remain passing. Do not
add an exemption without a written reason proving that the segment is not a
UUID-backed identifier.

## Nullable Unique Constraints

A conventional Postgres unique index does not treat two `NULL` values as equal.
Therefore, this shape does not enforce one row for a logical key when a member
of that key is nullable:

```typescript
uniqueIndex('example_unique').on(table.key, table.nullableScope);
```

When `NULL` values must participate as equal values in uniqueness, use a unique
constraint with `NULLS NOT DISTINCT` through Drizzle:

```typescript
unique('example_unique').on(table.key, table.nullableScope).nullsNotDistinct();
```

This is PostgreSQL-specific behavior supported by PostgreSQL 15 and later. Do
not hand-edit generated migration SQL merely to satisfy a scanner that treats
the syntax as a non-ANSI finding. Confirm the configured database dialect and
use a narrow documented suppression when the scanner cannot model the valid
PostgreSQL syntax.

See the nullable-unique-index pattern in
`docs/ai/general/SECURITY_CODING_PATTERNS.md` for the full rationale.

## Migration Completeness

A generated migration is not complete when only the SQL file and
`meta/_journal.json` entry exist.

`scripts/validate-migration-journal.ts` resolves journal tags through the
hand-maintained literal-path `readMigrationSql` switch. This avoids rebuilding a
dynamic filesystem path from a journal value.

For every new migration, include in the same change:

1. the generated SQL migration;
2. the matching journal and snapshot updates produced by the repository
   migration tooling;
3. the corresponding literal `readMigrationSql` case in
   `scripts/validate-migration-journal.ts`.

Run `scripts/validate-migration-journal.test.ts` through the owning test command
before completion. The test walks the real journal and must fail when a tag is
not supported by the literal-path switch.

Do not replace the switch with an unconstrained dynamic
`readFile(join(directory, tag))` implementation. Filesystem confinement rules
remain authoritative in the applicable SEC entries and the repository script
patterns.

## Drizzle Adapter Integration Tests

Every `Drizzle*Service` or `Drizzle*Repository` must have a companion
`*.db.test.ts` integration test.

Use `resolveTestDb()` from `@/testing/db/create-test-db` so the test remains
compatible with the repository's supported DB test profiles. Follow the
current setup and cleanup conventions in
`docs/usage/03 - Testing Usage & DB Workflows.md`.

Required cases depend on the adapter, but commonly include:

- not found behavior;
- enabled and disabled states where applicable;
- tenant-scoped behavior overriding or isolating global behavior;
- cross-tenant isolation;
- real schema type compatibility;
- database-enforced uniqueness, ordering, idempotency, or concurrency when the
  adapter relies on those properties.

Mocked-DB unit tests may complement these tests but are not sufficient alone.
They cannot establish Postgres binding, constraint, transaction, or concurrency
behavior.

Pattern B in `docs/ai/general/05 - Validation Strategy Agent.md` is the
authoritative shared validation contract.

## Tenant And Resource Scope

Keep tenant/resource scope in the database statement that reads or mutates the
row. A preceding authorization or ownership check does not scope a later query
that uses only a row ID.

For scoped mutations:

- derive tenant or organization authority from verified server-side context;
- make scope an explicit service or repository input;
- include row ID, tenant/resource scope, and applicable state guard in the same
  SQL predicate;
- add direct cross-tenant negative coverage against a real database when the
  guarantee depends on SQL behavior.

Do not treat action-level RBAC or ABAC permission as proof that the caller may
access a client-supplied tenant or resource identifier.

SEC-26 and SEC-41 in
`docs/ai/general/SECURITY_CODING_PATTERNS.md` remain authoritative for scope and
authorization rules.

## Environment And Deployment Contracts

A database pipeline fix is incomplete if it makes a build command pass while
the deployed runtime receives a different or missing database configuration.

Before introducing a fallback, determine whether the value is required at
build time, runtime, or both. If the deployed runtime requires it, validate the
hosted environment contract and fail fast when the value is absent. Do not use
a build-only synthetic database URL to conceal runtime configuration drift.

SEC-25 and `docs/ai/general/VALIDATION_AND_QUALITY_GATES.md` own the wider
deployment-validation requirements.

## Validation Checklist

For database- or schema-affecting changes, select the applicable checks:

- schema and migration diff inspected;
- identifier origin matches the chosen column type;
- malformed UUID route parameters fail before DB access;
- nullable uniqueness semantics are tested against a real database;
- migration journal validation passes;
- owning `*.db.test.ts` coverage passes;
- tenant/resource scope is present in the actual query or mutation;
- typecheck and applicable lint checks pass;
- environment and deployment behavior is validated when configuration changes.

Use `docs/ai/general/VALIDATION_AND_QUALITY_GATES.md` to determine the complete
risk-based validation set. Report checks not run and any remaining uncertainty.

## Ownership And Propagation

Database semantics shared by all tools belong here or in the more specific
security, validation, usage, or architecture authority named above.

Runtime skills should route to the smallest applicable section. Do not copy the
full database contract into `AGENTS.md`, `CLAUDE.md`, or every implementation
skill. Propagate instruction changes according to
`docs/ai/general/AGENT_INSTRUCTION_ARCHITECTURE.md`.

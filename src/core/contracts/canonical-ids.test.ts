import { describe, expect, it } from 'vitest';

import type { AccessContext, DataScope } from './access-context';
import type { OrganizationId, TenantId, UserId } from './canonical-ids';
import type {
  OrganizationId as LegacyOrganizationId,
  SubjectId as LegacySubjectId,
  TenantId as LegacyTenantId,
} from './primitives';

/**
 * OZI-71 Slice 1 — compile-time contract proof for the canonical branded
 * identities (`./canonical-ids`) and the `AccessContext` / `DataScope`
 * shapes (`./access-context`).
 *
 * These assertions live in a function that is intentionally NEVER called:
 * `tsc` (via `pnpm typecheck`) still fully type-checks its body, so every
 * `@ts-expect-error` is a genuine negative compile-time assertion. If a
 * guarantee regresses — branding removed, or a `?: never` forbidden-property
 * pin dropped — the suppressed error disappears and `tsc` reports the
 * now-unused `@ts-expect-error` directive (TS2578), i.e. `pnpm typecheck`
 * fails. `keyof`-based checks below regress by resolving to `never` and
 * failing a positive `= true` assignment.
 *
 * The guarantee proven here is the COMPILE-TIME contract shape, not runtime
 * sanitization: structural typing does not stop a JavaScript object from
 * physically holding an extra property at runtime.
 *
 * Typed parameters give us canonical-id-typed values without a constructor
 * (Slice 1 deliberately ships no id constructor/parser/cast — Slice 2 owns
 * the first real representation boundary).
 */
function _typeContract(
  aTenantId: TenantId,
  anOrganizationId: OrganizationId,
  aUserId: UserId,
  aLegacyTenantId: LegacyTenantId,
): void {
  // 1. TenantId is not assignable to OrganizationId.
  // @ts-expect-error - a TenantId must never satisfy OrganizationId
  const _t1: OrganizationId = aTenantId;

  // 2. OrganizationId is not assignable to TenantId.
  // @ts-expect-error - an OrganizationId must never satisfy TenantId
  const _t2: TenantId = anOrganizationId;

  // 3. UserId is not assignable to TenantId or OrganizationId.
  // @ts-expect-error - a UserId must never satisfy TenantId
  const _t3: TenantId = aUserId;
  // @ts-expect-error - a UserId must never satisfy OrganizationId
  const _t4: OrganizationId = aUserId;

  // 4. A plain string is not implicitly assignable to any canonical id.
  // @ts-expect-error - a plain string is not a canonical TenantId
  const _t5: TenantId = 'not-a-branded-id';
  // @ts-expect-error - a plain string is not a canonical OrganizationId
  const _t6: OrganizationId = 'not-a-branded-id';
  // @ts-expect-error - a plain string is not a canonical UserId
  const _t7: UserId = 'not-a-branded-id';

  // 5. Organization DataScope requires BOTH OrganizationId and TenantId.
  // @ts-expect-error - organization DataScope is missing the required tenantId
  const _s1: DataScope = {
    kind: 'organization',
    organizationId: anOrganizationId,
  };
  const _s2: DataScope = {
    kind: 'organization',
    // @ts-expect-error - organizationId must be a canonical OrganizationId, not a plain string
    organizationId: 'plain-string',
    tenantId: aTenantId,
  };

  // 6. Tenant DataScope cannot carry an organizationId — proven both as a
  //    fresh object literal (excess-property check) AND as an already-built,
  //    fully-typed value (structural check enforced by `organizationId?:
  //    never`). The second case is the load-bearing one; it fails if the
  //    `?: never` pin is removed.
  // @ts-expect-error - fresh literal: tenant DataScope must not carry organizationId
  const _s3: DataScope = {
    kind: 'tenant',
    tenantId: aTenantId,
    organizationId: anOrganizationId,
  };
  const tenantShapedWithOrg: {
    readonly kind: 'tenant';
    readonly tenantId: TenantId;
    readonly organizationId: OrganizationId;
  } = { kind: 'tenant', tenantId: aTenantId, organizationId: anOrganizationId };
  // @ts-expect-error - pre-built value: a tenant shape carrying organizationId is not a DataScope
  const _si1: DataScope = tenantShapedWithOrg;

  // 7. Platform-global DataScope carries neither tenantId nor organizationId
  //    — fresh literal AND pre-built value (structural, via `?: never`).
  // @ts-expect-error - fresh literal: platform-global DataScope must not carry tenantId
  const _s4: DataScope = { kind: 'platform-global', tenantId: aTenantId };
  // @ts-expect-error - fresh literal: platform-global DataScope must not carry organizationId
  const _s5: DataScope = {
    kind: 'platform-global',
    organizationId: anOrganizationId,
  };
  const globalShapedWithTenant: {
    readonly kind: 'platform-global';
    readonly tenantId: TenantId;
  } = { kind: 'platform-global', tenantId: aTenantId };
  // @ts-expect-error - pre-built value: a platform-global shape carrying tenantId is not a DataScope
  const _si2: DataScope = globalShapedWithTenant;
  const globalShapedWithOrg: {
    readonly kind: 'platform-global';
    readonly organizationId: OrganizationId;
  } = { kind: 'platform-global', organizationId: anOrganizationId };
  // @ts-expect-error - pre-built value: a platform-global shape carrying organizationId is not a DataScope
  const _si3: DataScope = globalShapedWithOrg;

  // 8. AccessContext's public type contract does not expose `scope` or
  //    `membershipOrganizationIds` as keys. Proven with `keyof`, not with
  //    object-literal excess-property checking and not by adding `?: never`
  //    to AccessContext — the claim is about the type's key set, which is
  //    what the contract actually guarantees.
  type _AccessContextKeys = keyof AccessContext;
  const _noScopeKey: 'scope' extends _AccessContextKeys ? never : true = true;
  const _noMembershipKey: 'membershipOrganizationIds' extends _AccessContextKeys
    ? never
    : true = true;

  // 9. activeOrganization requires BOTH canonical ids.
  const _a3: AccessContext = {
    userId: aUserId,
    // @ts-expect-error - activeOrganization is missing the required tenantId
    activeOrganization: { organizationId: anOrganizationId },
    isPlatformAdmin: false,
  };
  const _a4: AccessContext = {
    userId: aUserId,
    activeOrganization: {
      organizationId: anOrganizationId,
      // @ts-expect-error - activeOrganization.tenantId must be a canonical TenantId
      tenantId: 'plain-string',
    },
    isPlatformAdmin: false,
  };

  // 10. Legacy primitives are untouched: `./primitives` aliases are still
  //     plain `string`, so these compile with NO `@ts-expect-error`...
  const _legacyTenant: LegacyTenantId = 'plain-string';
  const _legacyOrg: LegacyOrganizationId = 'plain-string';
  const _legacySubject: LegacySubjectId = 'plain-string';
  // ...and a legacy string id must NOT satisfy a canonical branded id
  //    (proves the two coexisting `TenantId` types are genuinely distinct).
  // @ts-expect-error - legacy string TenantId is not the canonical branded TenantId
  const _legacyIsNotCanonical: TenantId = aLegacyTenantId;

  // Positive shape proofs — these MUST compile.
  const _okOrgScope = {
    kind: 'organization',
    organizationId: anOrganizationId,
    tenantId: aTenantId,
  } satisfies DataScope;
  const _okTenantScope = {
    kind: 'tenant',
    tenantId: aTenantId,
  } satisfies DataScope;
  const _okGlobalScope = { kind: 'platform-global' } satisfies DataScope;
  const _okCtxNull = {
    userId: aUserId,
    activeOrganization: null,
    isPlatformAdmin: false,
  } satisfies AccessContext;
  const _okCtxActive = {
    userId: aUserId,
    activeOrganization: {
      organizationId: anOrganizationId,
      tenantId: aTenantId,
    },
    isPlatformAdmin: true,
  } satisfies AccessContext;

  void [
    _t1,
    _t2,
    _t3,
    _t4,
    _t5,
    _t6,
    _t7,
    _s1,
    _s2,
    _s3,
    _si1,
    _s4,
    _s5,
    _si2,
    _si3,
    _noScopeKey,
    _noMembershipKey,
    _a3,
    _a4,
    _legacyTenant,
    _legacyOrg,
    _legacySubject,
    _legacyIsNotCanonical,
    _okOrgScope,
    _okTenantScope,
    _okGlobalScope,
    _okCtxNull,
    _okCtxActive,
  ];
}
void _typeContract;

/**
 * Exhaustive narrowing over the `DataScope` discriminant. `tsc` enforces
 * that every `kind` is handled (no `default`), so adding a fourth variant
 * without a branch would fail `pnpm typecheck`.
 */
function describeScopeKind(scope: DataScope): DataScope['kind'] {
  switch (scope.kind) {
    case 'organization':
      return 'organization';
    case 'tenant':
      return 'tenant';
    case 'platform-global':
      return 'platform-global';
  }
}

describe('OZI-71 Slice 1 — canonical id / AccessContext / DataScope contracts', () => {
  it('DataScope discriminant narrows exhaustively (compile-time enforced, no default branch)', () => {
    // `describeScopeKind` has no `default`: `tsc` fails if a fourth
    // `DataScope` variant is ever added without a case. Exercised at runtime
    // for the id-free `platform-global` variant — this asserts discriminant
    // narrowing, NOT any runtime property-sanitization guarantee.
    expect(describeScopeKind({ kind: 'platform-global' })).toBe(
      'platform-global',
    );
  });
});

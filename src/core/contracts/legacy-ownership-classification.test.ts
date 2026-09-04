import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  classifyLegacyOwnership,
  type LegacyOwnershipEvidence,
  type ProviderMappingEvidence,
  type ResolvedOrganization,
} from './legacy-ownership-classification';

const ORG_A: ResolvedOrganization = {
  organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  parentTenantId: 'tttttttt-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
};
const ORG_B: ResolvedOrganization = {
  organizationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  parentTenantId: 'tttttttt-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
};

function providerRow(
  provider: string,
  verified: ResolvedOrganization | null,
  mappedOrganizationId = verified?.organizationId ??
    '00000000-0000-4000-8000-000000000000',
): ProviderMappingEvidence {
  return { provider, mappedOrganizationId, verified };
}

function evidence(
  over: Partial<LegacyOwnershipEvidence>,
): LegacyOwnershipEvidence {
  return {
    legacyValue: 'something',
    nullSemantics: 'proven_intentional_global',
    directInternalOrganization: null,
    providerMappings: [],
    isKnownTenantId: false,
    ...over,
  };
}

describe('classifyLegacyOwnership — neutrality', () => {
  it('imports no feature-flags / audit-log / auth infrastructure (source scan)', () => {
    const src = readFileSync(
      resolve(
        process.cwd(),
        'src/core/contracts/legacy-ownership-classification.ts',
      ),
      'utf8',
    );
    // No import from a module / security / drizzle (prose mentions are fine).
    expect(src).not.toMatch(/from ['"]@\/modules\//);
    expect(src).not.toMatch(/from ['"]@\/security\//);
    expect(src).not.toMatch(/from ['"]drizzle/);
    expect(src).not.toMatch(/from ['"]@\/core\/db\//);
  });
});

describe('classifyLegacyOwnership — §14a.10 Cases A–G', () => {
  it('B — exact internal organizations.id -> canonical + parent tenant from the org row', () => {
    expect(
      classifyLegacyOwnership(
        evidence({
          legacyValue: ORG_A.organizationId,
          directInternalOrganization: ORG_A,
        }),
      ),
    ).toEqual({
      proposedOwnershipState: 'canonical_organization',
      organizationId: ORG_A.organizationId,
      parentTenantId: ORG_A.parentTenantId,
      reason: 'resolved_internal_organization',
      mutates: true,
    });
  });

  it('C — a single provider mapping, verified -> canonical (mapped internal id, never the external string)', () => {
    expect(
      classifyLegacyOwnership(
        evidence({
          legacyValue: 'org_ext_a',
          providerMappings: [providerRow('clerk', ORG_A)],
        }),
      ),
    ).toMatchObject({
      proposedOwnershipState: 'canonical_organization',
      organizationId: ORG_A.organizationId,
      parentTenantId: ORG_A.parentTenantId,
      reason: 'resolved_provider_organization',
      mutates: true,
    });
  });

  it('C — provider mapping only under a provider OTHER than the current runtime provider still resolves', () => {
    // The classifier has no notion of a "current" provider — the caller passes
    // whatever it found. A row mapped only under authjs still resolves.
    expect(
      classifyLegacyOwnership(
        evidence({
          legacyValue: 'org_ext_y',
          providerMappings: [providerRow('authjs', ORG_A)],
        }),
      ),
    ).toMatchObject({
      proposedOwnershipState: 'canonical_organization',
      organizationId: ORG_A.organizationId,
      reason: 'resolved_provider_organization',
    });
  });

  it('C — multiple providers map the same string to the SAME organization -> canonical', () => {
    expect(
      classifyLegacyOwnership(
        evidence({
          legacyValue: 'org_ext_shared',
          providerMappings: [
            providerRow('clerk', ORG_A),
            providerRow('authjs', ORG_A),
          ],
        }),
      ),
    ).toMatchObject({
      proposedOwnershipState: 'canonical_organization',
      organizationId: ORG_A.organizationId,
      reason: 'resolved_multi_provider_organization',
      mutates: true,
    });
  });

  it('G — multiple providers map the same string to DIFFERENT organizations -> unresolved, no precedence', () => {
    expect(
      classifyLegacyOwnership(
        evidence({
          legacyValue: 'org_ext_conflict',
          providerMappings: [
            providerRow('clerk', ORG_A),
            providerRow('authjs', ORG_B),
          ],
        }),
      ),
    ).toEqual({
      proposedOwnershipState: 'unresolved_legacy',
      organizationId: null,
      parentTenantId: null,
      reason: 'ambiguous_provider_evidence',
      mutates: false,
    });
  });

  it('D — direct internal AND all provider mappings agree -> canonical', () => {
    expect(
      classifyLegacyOwnership(
        evidence({
          legacyValue: ORG_A.organizationId,
          directInternalOrganization: ORG_A,
          providerMappings: [
            providerRow('clerk', ORG_A),
            providerRow('authjs', ORG_A),
          ],
        }),
      ),
    ).toMatchObject({
      proposedOwnershipState: 'canonical_organization',
      organizationId: ORG_A.organizationId,
      reason: 'resolved_same_internal_and_provider',
    });
  });

  it('D — direct internal ORG_A but ONE provider maps to ORG_B -> unresolved, no precedence for direct', () => {
    expect(
      classifyLegacyOwnership(
        evidence({
          legacyValue: ORG_A.organizationId,
          directInternalOrganization: ORG_A,
          providerMappings: [providerRow('clerk', ORG_B)],
        }),
      ),
    ).toEqual({
      proposedOwnershipState: 'unresolved_legacy',
      organizationId: null,
      parentTenantId: null,
      reason: 'ambiguous_internal_vs_provider',
      mutates: false,
    });
  });

  it('a stale provider mapping does NOT block a clean internal-id match', () => {
    expect(
      classifyLegacyOwnership(
        evidence({
          legacyValue: ORG_A.organizationId,
          directInternalOrganization: ORG_A,
          providerMappings: [providerRow('clerk', null)],
        }),
      ),
    ).toMatchObject({
      proposedOwnershipState: 'canonical_organization',
      organizationId: ORG_A.organizationId,
      reason: 'resolved_internal_organization',
    });
  });

  it('§6 — only signal is a mapping to a missing organization -> unresolved, stale_provider_mapping', () => {
    expect(
      classifyLegacyOwnership(
        evidence({
          legacyValue: 'org_ext_stale',
          providerMappings: [providerRow('clerk', null)],
        }),
      ),
    ).toEqual({
      proposedOwnershipState: 'unresolved_legacy',
      organizationId: null,
      parentTenantId: null,
      reason: 'stale_provider_mapping',
      mutates: false,
    });
  });

  it('E — bare tenants.id, nothing else -> unresolved_legacy, no mutation', () => {
    expect(
      classifyLegacyOwnership(
        evidence({
          legacyValue: '55555555-5555-4555-8555-555555555555',
          isKnownTenantId: true,
        }),
      ),
    ).toMatchObject({
      proposedOwnershipState: 'unresolved_legacy',
      reason: 'unresolved_tenant_id_only',
      mutates: false,
    });
  });

  it('F — unknown UUID -> unresolved_unknown_uuid', () => {
    expect(
      classifyLegacyOwnership(
        evidence({ legacyValue: '99999999-9999-4999-8999-999999999999' }),
      ),
    ).toMatchObject({
      proposedOwnershipState: 'unresolved_legacy',
      reason: 'unresolved_unknown_uuid',
    });
  });

  it('F — arbitrary non-UUID string (incl. an unmapped provider id) -> unresolved_arbitrary_string', () => {
    expect(
      classifyLegacyOwnership(evidence({ legacyValue: 'legacy-acme' })),
    ).toMatchObject({
      proposedOwnershipState: 'unresolved_legacy',
      reason: 'unresolved_arbitrary_string',
    });
  });

  it('never brands by UUID shape alone', () => {
    const result = classifyLegacyOwnership(
      evidence({ legacyValue: '12345678-1234-4234-8234-123456789abc' }),
    );
    expect(result.organizationId).toBeNull();
    expect(result.proposedOwnershipState).toBe('unresolved_legacy');
  });
});

describe('classifyLegacyOwnership — table-specific NULL semantics (§6)', () => {
  it('NULL + proven_intentional_global -> intentional_global (Feature Flag behaviour, unchanged)', () => {
    expect(
      classifyLegacyOwnership(
        evidence({
          legacyValue: null,
          nullSemantics: 'proven_intentional_global',
        }),
      ),
    ).toEqual({
      proposedOwnershipState: 'intentional_global',
      organizationId: null,
      parentTenantId: null,
      reason: 'intentional_global_legacy_null',
      mutates: true,
    });
  });

  it('NULL + not_proven -> unresolved_legacy (never automatically global)', () => {
    expect(
      classifyLegacyOwnership(
        evidence({ legacyValue: null, nullSemantics: 'not_proven' }),
      ),
    ).toEqual({
      proposedOwnershipState: 'unresolved_legacy',
      organizationId: null,
      parentTenantId: null,
      reason: 'unresolved_null_semantics_not_proven',
      mutates: false,
    });
  });
});

import { describe, expect, it } from 'vitest';

import {
  classifyOwnershipConstraint,
  classifyOwnershipDispositionTable,
  gatherOwnershipDispositionEvidence,
  normalizeOwnershipCheckExpression,
  type OwnershipConstraintInspection,
  type OwnershipStateCounts,
} from './ownership-disposition-gate';
import type { SqlRunner } from './post-migrate-steps';

const SETTINGS_EXPR =
  "ownership_state = 'canonical_organization'::text AND organization_id IS NOT NULL OR " +
  "(ownership_state = ANY (ARRAY['intentional_global'::text, 'unresolved_legacy'::text, " +
  "'quarantined'::text])) AND organization_id IS NULL";

const EVENTS_EXPR =
  "ownership_state = 'canonical_organization'::text OR " +
  "(ownership_state = ANY (ARRAY['organization_owned_orphaned'::text, " +
  "'intentional_global'::text, 'unresolved_legacy'::text, 'quarantined'::text])) " +
  'AND organization_id IS NULL';

function counts(
  over: Partial<OwnershipStateCounts> = {},
): OwnershipStateCounts {
  return {
    total: 4,
    canonicalOrganization: 1,
    intentionalGlobal: 3,
    unresolvedLegacy: 0,
    quarantined: 0,
    organizationOwnedOrphaned: 0,
    ...over,
  };
}

function constraint(
  over: Partial<OwnershipConstraintInspection> = {},
): OwnershipConstraintInspection {
  return {
    name: 'ck_feature_flags_ownership_state_org',
    exists: true,
    validated: true,
    currentExpression: SETTINGS_EXPR,
    expectedExpression: SETTINGS_EXPR,
    definitionMatches: true,
    state: 'exact-validated',
    ...over,
  };
}

describe('ownership-disposition-gate — pure classification', () => {
  it('normalizes formatting whitespace without changing SQL semantics', () => {
    expect(
      normalizeOwnershipCheckExpression(
        `  ownership_state   = 'canonical_organization'::text `,
      ),
    ).toBe("ownership_state = 'canonical_organization'::text");
  });

  it('does not erase case-sensitive differences inside ownership-state literals', () => {
    const wrongLiteralCase = SETTINGS_EXPR.replace(
      "'canonical_organization'",
      "'CANONICAL_ORGANIZATION'",
    );

    expect(
      classifyOwnershipConstraint(
        'ck_feature_flags_ownership_state_org',
        SETTINGS_EXPR,
        {
          convalidated: true,
          connoinherit: false,
          expression: wrongLiteralCase,
        },
      ),
    ).toMatchObject({
      exists: true,
      definitionMatches: false,
      state: 'wrong-definition',
    });
  });

  it('fails closed on an otherwise exact NO INHERIT CHECK', () => {
    expect(
      classifyOwnershipConstraint(
        'ck_feature_flags_ownership_state_org',
        SETTINGS_EXPR,
        {
          convalidated: false,
          connoinherit: true,
          expression: SETTINGS_EXPR,
        },
      ),
    ).toMatchObject({
      exists: true,
      definitionMatches: false,
      state: 'wrong-definition',
    });
  });

  it('classifies an exact but NOT VALID CHECK separately from its identity', () => {
    expect(
      classifyOwnershipConstraint(
        'ck_feature_flags_ownership_state_org',
        SETTINGS_EXPR,
        {
          convalidated: false,
          connoinherit: false,
          expression: SETTINGS_EXPR,
        },
      ),
    ).toMatchObject({
      exists: true,
      validated: false,
      definitionMatches: true,
      state: 'exact-unvalidated',
    });
  });

  it('fails closed on a same-name CHECK with another expression', () => {
    expect(
      classifyOwnershipConstraint(
        'ck_feature_flags_ownership_state_org',
        SETTINGS_EXPR,
        {
          convalidated: true,
          connoinherit: false,
          expression: "ownership_state <> 'broken'::text",
        },
      ),
    ).toMatchObject({
      exists: true,
      definitionMatches: false,
      state: 'wrong-definition',
    });
  });

  it('marks settled rows with an unvalidated exact CHECK as validate-only, not ready', () => {
    const result = classifyOwnershipDispositionTable({
      table: 'feature_flags',
      gate: 'r4a',
      counts: counts(),
      invalidCombinationCount: 0,
      constraint: constraint({
        validated: false,
        state: 'exact-unvalidated',
      }),
    });

    expect(result).toMatchObject({
      dispositionSettled: true,
      gateReady: false,
      plannedAction: 'validate-constraint',
    });
  });

  it('marks the table ready only after disposition is settled and CHECK is validated', () => {
    expect(
      classifyOwnershipDispositionTable({
        table: 'feature_flags',
        gate: 'r4a',
        counts: counts(),
        invalidCombinationCount: 0,
        constraint: constraint(),
      }),
    ).toMatchObject({
      dispositionSettled: true,
      gateReady: true,
      plannedAction: 'no-op',
    });
  });

  it.each([
    ['unresolved legacy rows', { unresolvedLegacy: 1 }],
    ['quarantined rows', { quarantined: 1 }],
  ])('blocks R4a readiness on %s', (_label, over) => {
    expect(
      classifyOwnershipDispositionTable({
        table: 'feature_flags',
        gate: 'r4a',
        counts: counts(over),
        invalidCombinationCount: 0,
        constraint: constraint(),
      }),
    ).toMatchObject({
      dispositionSettled: false,
      gateReady: false,
      plannedAction: 'blocked-unsettled-rows',
    });
  });

  it('blocks when historical rows violate the cross-column ownership contract', () => {
    expect(
      classifyOwnershipDispositionTable({
        table: 'audit_log_settings',
        gate: 'r4a',
        counts: counts({ total: 1, canonicalOrganization: 1 }),
        invalidCombinationCount: 1,
        constraint: constraint({
          name: 'ck_audit_log_settings_ownership_state_org',
        }),
      }),
    ).toMatchObject({
      dispositionSettled: false,
      gateReady: false,
      plannedAction: 'blocked-unsettled-rows',
    });
  });

  it('blocks a missing CHECK instead of inferring readiness from row counts', () => {
    expect(
      classifyOwnershipDispositionTable({
        table: 'feature_flags',
        gate: 'r4a',
        counts: counts(),
        invalidCombinationCount: 0,
        constraint: constraint({
          exists: false,
          validated: false,
          currentExpression: null,
          definitionMatches: false,
          state: 'missing',
        }),
      }),
    ).toMatchObject({
      dispositionSettled: true,
      gateReady: false,
      plannedAction: 'blocked-missing-constraint',
    });
  });

  it('blocks a wrong-definition CHECK even when every current row looks legal', () => {
    expect(
      classifyOwnershipDispositionTable({
        table: 'feature_flags',
        gate: 'r4a',
        counts: counts(),
        invalidCombinationCount: 0,
        constraint: constraint({
          definitionMatches: false,
          currentExpression: "ownership_state <> 'broken'::text",
          state: 'wrong-definition',
        }),
      }),
    ).toMatchObject({
      dispositionSettled: true,
      gateReady: false,
      plannedAction: 'blocked-wrong-constraint',
    });
  });

  it('keeps schema convergence separate from historical data disposition', () => {
    const dataBlocked = classifyOwnershipDispositionTable({
      table: 'feature_flags',
      gate: 'r4a',
      counts: counts({ unresolvedLegacy: 1 }),
      invalidCombinationCount: 0,
      constraint: constraint(),
    });

    const schemaBlocked = classifyOwnershipDispositionTable({
      table: 'feature_flags',
      gate: 'r4a',
      counts: counts(),
      invalidCombinationCount: 0,
      constraint: constraint({
        exists: false,
        validated: false,
        currentExpression: null,
        definitionMatches: false,
        state: 'missing',
      }),
    });

    expect(dataBlocked).toMatchObject({
      dispositionSettled: false,
      gateReady: false,
      plannedAction: 'blocked-unsettled-rows',
    });

    expect(schemaBlocked).toMatchObject({
      dispositionSettled: true,
      gateReady: false,
      plannedAction: 'blocked-missing-constraint',
    });
  });
});

describe('gatherOwnershipDispositionEvidence', () => {
  it('keeps FF/settings R4a readiness independent from audit-events R4b-1 readiness', async () => {
    const replies: unknown[][] = [
      [
        {
          total: '4',
          canonical_organization: '1',
          intentional_global: '3',
          unresolved_legacy: '0',
          quarantined: '0',
          organization_owned_orphaned: '0',
          invalid_combinations: '0',
        },
      ],
      [{ convalidated: true, connoinherit: false, expression: SETTINGS_EXPR }],
      [
        {
          total: '0',
          canonical_organization: '0',
          intentional_global: '0',
          unresolved_legacy: '0',
          quarantined: '0',
          organization_owned_orphaned: '0',
          invalid_combinations: '0',
        },
      ],
      [{ convalidated: true, connoinherit: false, expression: SETTINGS_EXPR }],
      [
        {
          total: '29',
          canonical_organization: '28',
          intentional_global: '0',
          unresolved_legacy: '1',
          quarantined: '0',
          organization_owned_orphaned: '0',
          invalid_combinations: '0',
        },
      ],
      [{ convalidated: true, connoinherit: false, expression: EVENTS_EXPR }],
    ];

    const runner: SqlRunner = {
      query: async <T>() => (replies.shift() ?? []) as T[],
    };

    const evidence = await gatherOwnershipDispositionEvidence(runner);

    expect(evidence.featureFlags).toMatchObject({
      gate: 'r4a',
      gateReady: true,
      plannedAction: 'no-op',
    });
    expect(evidence.auditLogSettings).toMatchObject({
      gate: 'r4a',
      gateReady: true,
      plannedAction: 'no-op',
    });
    expect(evidence.auditEvents).toMatchObject({
      gate: 'r4b1',
      gateReady: false,
      plannedAction: 'blocked-unsettled-rows',
    });
  });

  it('reports the current Production-like NOT VALID state as three independent validation actions', async () => {
    const replies: unknown[][] = [
      [
        {
          total: '4',
          canonical_organization: '1',
          intentional_global: '3',
          unresolved_legacy: '0',
          quarantined: '0',
          organization_owned_orphaned: '0',
          invalid_combinations: '0',
        },
      ],
      [{ convalidated: false, connoinherit: false, expression: SETTINGS_EXPR }],
      [
        {
          total: '0',
          canonical_organization: '0',
          intentional_global: '0',
          unresolved_legacy: '0',
          quarantined: '0',
          organization_owned_orphaned: '0',
          invalid_combinations: '0',
        },
      ],
      [{ convalidated: false, connoinherit: false, expression: SETTINGS_EXPR }],
      [
        {
          total: '28',
          canonical_organization: '28',
          intentional_global: '0',
          unresolved_legacy: '0',
          quarantined: '0',
          organization_owned_orphaned: '0',
          invalid_combinations: '0',
        },
      ],
      [{ convalidated: false, connoinherit: false, expression: EVENTS_EXPR }],
    ];

    const runner: SqlRunner = {
      query: async <T>() => (replies.shift() ?? []) as T[],
    };

    const evidence = await gatherOwnershipDispositionEvidence(runner);

    expect([
      evidence.featureFlags.plannedAction,
      evidence.auditLogSettings.plannedAction,
      evidence.auditEvents.plannedAction,
    ]).toEqual([
      'validate-constraint',
      'validate-constraint',
      'validate-constraint',
    ]);

    expect([
      evidence.featureFlags.dispositionSettled,
      evidence.auditLogSettings.dispositionSettled,
      evidence.auditEvents.dispositionSettled,
    ]).toEqual([true, true, true]);

    expect([
      evidence.featureFlags.gateReady,
      evidence.auditLogSettings.gateReady,
      evidence.auditEvents.gateReady,
    ]).toEqual([false, false, false]);
  });
});

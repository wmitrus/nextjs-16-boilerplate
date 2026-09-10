import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AudAConvergenceEvidence,
  AudAConvergenceInspection,
  AudAForeignKeyInspection,
  SqlRunner,
} from '@/core/db/post-migrate-steps';

import {
  formatEvidence,
  formatRecoveryGuidance,
  missingMandatoryEvidence,
  parseArgs,
  run,
  type ConvergeDeps,
} from './db-aud-a-converge';
import {
  describeMigrationTarget,
  resolveMigrationUrlWithSource,
} from './db-migrate-prod';

/**
 * OZI-71 AUD·A — dedicated Production convergence CLI (Codex P1 correction).
 *
 * These are the argument-gating / fail-closed contract tests. The mutating
 * `--apply --production-approved` path and the read-only DB introspection are
 * covered against a real database by `src/core/db/post-migrate-steps.db.test.ts`
 * (`inspectAudAConvergence` / `gatherAudAConvergenceEvidence`) — the same
 * primitives this CLI reuses.
 */

const POOLED = 'postgresql://u:p@ep-x-pooler.us-east-1.aws.neon.tech/app';
const DIRECT = 'postgresql://u:p@ep-x.us-east-1.aws.neon.tech/app';

/** A structurally-complete `AudAForeignKeyInspection` for fixtures. */
function fkInsp(
  over: Partial<AudAForeignKeyInspection> = {},
): AudAForeignKeyInspection {
  return {
    constraint: 'audit_events_organization_id_organizations_id_fk',
    schema: 'public',
    table: 'audit_events',
    state: 'present-exact-validated',
    present: true,
    convalidated: true,
    expectedDefinition:
      'FOREIGN KEY (organization_id) REFERENCES public.organizations (id) ON DELETE SET NULL ON UPDATE NO ACTION',
    currentDefinition:
      'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL',
    definitionMismatches: [],
    plannedAction: 'no-op',
    ...over,
  };
}

describe('db:aud-a:converge — operator gate (fails closed before any DB work)', () => {
  const savedUrl = process.env.DATABASE_URL;
  const savedUnpooled = process.env.DATABASE_URL_UNPOOLED;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    if (savedUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedUrl;
    if (savedUnpooled === undefined) delete process.env.DATABASE_URL_UNPOOLED;
    else process.env.DATABASE_URL_UNPOOLED = savedUnpooled;
  });

  it('rejects --apply without --production-approved before touching env or a connection', async () => {
    // No DB env set at all — proves the gate is the very first check.
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_URL_UNPOOLED;
    await expect(run(['--apply'])).rejects.toThrow(/--production-approved/);
  });

  it('rejects a pooled URL on --check (evidence would describe an unusable path)', async () => {
    delete process.env.DATABASE_URL_UNPOOLED;
    process.env.DATABASE_URL = POOLED;
    await expect(run(['--check'])).rejects.toThrow(/DIRECT \(unpooled\)/i);
  });

  it('rejects a pooled URL even with --apply --production-approved, before any mutation', async () => {
    delete process.env.DATABASE_URL_UNPOOLED;
    process.env.DATABASE_URL = POOLED;
    await expect(run(['--apply', '--production-approved'])).rejects.toThrow(
      /DIRECT \(unpooled\)/i,
    );
  });

  it('requires a migration URL', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_URL_UNPOOLED;
    await expect(run(['--check'])).rejects.toThrow(
      /DATABASE_URL_UNPOOLED or DATABASE_URL is required/i,
    );
  });

  it('does not leak credentials in the logged convergence target', async () => {
    delete process.env.DATABASE_URL_UNPOOLED;
    process.env.DATABASE_URL = POOLED;
    await expect(run(['--check'])).rejects.toThrow();
    const logged = logSpy.mock.calls.flat().map(String).join('\n');
    expect(logged).toContain('convergeTarget');
    expect(logged).not.toContain(':p@');
  });
});

describe('db:aud-a:converge — evidence & recovery formatting', () => {
  const target = describeMigrationTarget(
    resolveMigrationUrlWithSource(undefined, DIRECT)!,
  );

  const evidence: AudAConvergenceEvidence = {
    auditEventsRowCount: 1234567,
    auditEventsTableBytes: 4096 * 5000,
    auditEventsTotalRelationBytes: 4096 * 9000,
    inspection: {
      expandMigrationApplied: true,
      index: {
        name: 'idx_audit_events_organization_occurred',
        table: 'audit_events',
        state: 'absent',
        currentDefinition: null,
        expectedDefinition:
          'CREATE INDEX idx_audit_events_organization_occurred ON public.audit_events USING btree (organization_id, occurred_at)',
        plannedAction: 'create-concurrently',
      },
      foreignKeys: [
        fkInsp({
          constraint: 'audit_events_organization_id_organizations_id_fk',
          table: 'audit_events',
          state: 'present-exact-unvalidated',
          convalidated: false,
          plannedAction: 'validate',
        }),
        fkInsp({
          constraint: 'audit_log_settings_organization_id_organizations_id_fk',
          table: 'audit_log_settings',
        }),
      ],
      timeoutPolicy: {
        lockTimeoutMs: 3000,
        indexBuildStatementTimeoutMs: 0,
        fkValidateStatementTimeoutMs: 3_600_000,
      },
    },
  };

  it('renders every field the operator gate needs', () => {
    const out = formatEvidence(target, evidence, 'check');
    // Target
    expect(out).toContain('DATABASE_URL_UNPOOLED');
    expect(out).toContain('ep-x.us-east-1.aws.neon.tech');
    expect(out).toMatch(/endpoint\s+: direct/);
    // 0023 applied
    expect(out).toMatch(/applied \(columns present\): yes/);
    // audit_events size / cardinality
    expect(out).toContain('1234567');
    expect(out).toMatch(/table size\s+: \d+ B/);
    expect(out).toMatch(/total relation size\s+: \d+ B/);
    // index state + planned action
    expect(out).toContain('state                  : absent');
    expect(out).toMatch(/CREATE INDEX CONCURRENTLY WILL run/);
    // both FKs, with per-FK structural detail + planned action
    expect(out).toContain('audit_events_organization_id_organizations_id_fk');
    expect(out).toContain(
      'audit_log_settings_organization_id_organizations_id_fk',
    );
    expect(out).toMatch(/expected source table : public\.audit_events/);
    expect(out).toMatch(/definition state      : present-exact-unvalidated/);
    expect(out).toMatch(/definition state      : present-exact-validated/);
    expect(out).toMatch(
      /expected definition   : FOREIGN KEY \(organization_id\)/,
    );
    expect(out).toMatch(
      /current definition    : FOREIGN KEY \(organization_id\)/,
    );
    expect(out).toMatch(/VALIDATE CONSTRAINT WILL run/);
    expect(out).toMatch(/VALIDATE CONSTRAINT will NOT run/i);
    // timeout policy
    expect(out).toContain('lock_timeout');
    expect(out).toContain('3000 ms');
    expect(out).toMatch(/index build\)\s+: 0 /);
    expect(out).toContain('3600000 ms');
  });

  it('reports each already-converged / blocked index state distinctly', () => {
    const states = [
      ['valid-exact', 'no-op', /CREATE INDEX will NOT run/],
      ['invalid', 'rebuild-invalid', /rebuilt/],
      ['valid-wrong-definition', 'abort-wrong-definition', /HARD FAIL/],
      ['absent', 'blocked-expand-not-applied', /BLOCKED/],
    ] as const;
    for (const [state, plan, re] of states) {
      const out = formatEvidence(
        target,
        {
          ...evidence,
          inspection: {
            ...evidence.inspection,
            index: {
              ...evidence.inspection.index,
              state,
              plannedAction: plan,
            },
          },
        },
        'check',
      );
      expect(out).toMatch(re);
    }
  });

  it('renders a wrong-definition FK with mismatches and the abort plan', () => {
    const out = formatEvidence(
      target,
      {
        ...evidence,
        inspection: {
          ...evidence.inspection,
          foreignKeys: [
            fkInsp({
              state: 'present-wrong-definition',
              convalidated: true,
              currentDefinition:
                'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE',
              definitionMismatches: [
                "ON DELETE: expected 'set null', got 'cascade'",
              ],
              plannedAction: 'abort-wrong-definition',
            }),
            fkInsp({
              constraint:
                'audit_log_settings_organization_id_organizations_id_fk',
              table: 'audit_log_settings',
            }),
          ],
        },
      },
      'check',
    );
    expect(out).toMatch(/definition state      : present-wrong-definition/);
    expect(out).toMatch(
      /mismatches            : ON DELETE: expected 'set null'/,
    );
    expect(out).toMatch(/HARD FAIL — a same-name FK on the expected table/);
  });

  it('renders an absent FK as blocked-missing on its expected table', () => {
    const out = formatEvidence(
      target,
      {
        ...evidence,
        inspection: {
          ...evidence.inspection,
          foreignKeys: [
            fkInsp({
              state: 'absent',
              present: false,
              convalidated: null,
              currentDefinition: null,
              plannedAction: 'blocked-missing',
            }),
          ],
        },
      },
      'check',
    );
    expect(out).toMatch(/present on that table : NO/);
    expect(out).toMatch(/current definition    : \(absent\)/);
    expect(out).toMatch(/BLOCKED — expected FK absent on its table/);
  });

  it('marks size evidence unavailable rather than printing null', () => {
    const out = formatEvidence(
      target,
      {
        ...evidence,
        auditEventsTableBytes: null,
        auditEventsTotalRelationBytes: null,
      },
      'check',
    );
    expect(out).toMatch(/table size\s+: \(unavailable/);
    expect(out).not.toContain(': null');
  });

  it('recovery guidance covers every required failure mode', () => {
    const g = formatRecoveryGuidance();
    expect(g).toMatch(/interrupted create index concurrently|INVALID index/i);
    expect(g).toMatch(/lock_timeout abort/i);
    expect(g).toMatch(/wrong definition/i);
    expect(g).toMatch(/FK VALIDATE failure/i);
    // never instructs an automatic drop of a valid index
    expect(g).toMatch(/NEVER drops a valid index/i);
    // FK schema-drift: hard fail, never auto drop/recreate/validate
    expect(g).toMatch(/Same-name FK on the expected table with a WRONG/i);
    expect(g).toMatch(/NEVER drops\/recreates\/validates it/i);
    // both canonical expected FK definitions are printed for the operator
    expect(g).toMatch(
      /audit_events_organization_id_organizations_id_fk: FOREIGN KEY \(organization_id\) REFERENCES public\.organizations \(id\) ON DELETE SET NULL ON UPDATE NO ACTION/,
    );
    expect(g).toMatch(
      /audit_log_settings_organization_id_organizations_id_fk: FOREIGN KEY \(organization_id\) REFERENCES public\.organizations \(id\) ON DELETE CASCADE ON UPDATE NO ACTION/,
    );
  });
});

// ── Hardening 2: strict, fail-closed CLI argument parsing ──────────────────
describe('db:aud-a:converge — strict argument parsing (fail closed)', () => {
  it('parseArgs accepts exactly the two supported invocations', () => {
    expect(parseArgs(['--check'])).toEqual({ mode: 'check' });
    expect(parseArgs(['--apply', '--production-approved'])).toEqual({
      mode: 'apply',
    });
  });

  it.each([
    [[], /a mode is required/],
    [['--check', '--apply', '--production-approved'], /not both/],
    [['--check', '--apply'], /not both/],
    [['--production-approved'], /only valid together with --apply/],
    [['--apply'], /--apply requires the explicit operator gate/],
    [['--check', '--force'], /unknown argument\(s\): --force/],
    [
      ['--apply', '--production-approved', 'extra'],
      /unknown argument\(s\): extra/,
    ],
    [['-c'], /unknown argument\(s\): -c/],
  ])('parseArgs(%j) is rejected', (argv, re) => {
    expect(() => parseArgs(argv as string[])).toThrow(re as RegExp);
  });

  it('every rejected combination fails before a DB connection or the executor', async () => {
    // A direct URL is present, so only the arg gate can stop these.
    process.env.DATABASE_URL_UNPOOLED = DIRECT;
    delete process.env.DATABASE_URL;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const deps = makeDeps();
    try {
      for (const argv of [
        [],
        ['--check', '--apply', '--production-approved'],
        ['--check', '--apply'],
        ['--production-approved'],
        ['--apply'],
        ['--check', '--bogus'],
      ]) {
        await expect(run(argv, deps.deps)).rejects.toThrow();
      }
      expect(deps.openRunner).not.toHaveBeenCalled();
      expect(deps.runConvergence).not.toHaveBeenCalled();
      expect(deps.gatherEvidence).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
      delete process.env.DATABASE_URL_UNPOOLED;
    }
  });
});

// ── Shared DI harness for the --apply orchestration tests ─────────────────
const INDEX_NAME = 'idx_audit_events_organization_occurred';
const EXPECTED_DEF =
  'CREATE INDEX idx_audit_events_organization_occurred ON public.audit_events USING btree (organization_id, occurred_at)';

function inspection(
  over: Partial<AudAConvergenceInspection> = {},
): AudAConvergenceInspection {
  return {
    expandMigrationApplied: true,
    index: {
      name: INDEX_NAME,
      table: 'audit_events',
      state: 'valid-exact',
      currentDefinition: EXPECTED_DEF,
      expectedDefinition: EXPECTED_DEF,
      plannedAction: 'no-op',
    },
    foreignKeys: [
      fkInsp({
        constraint: 'audit_events_organization_id_organizations_id_fk',
        table: 'audit_events',
      }),
      fkInsp({
        constraint: 'audit_log_settings_organization_id_organizations_id_fk',
        table: 'audit_log_settings',
      }),
    ],
    timeoutPolicy: {
      lockTimeoutMs: 3000,
      indexBuildStatementTimeoutMs: 0,
      fkValidateStatementTimeoutMs: 3_600_000,
    },
    ...over,
  };
}

function evidenceOf(
  ins: AudAConvergenceInspection,
  over: Partial<AudAConvergenceEvidence> = {},
): AudAConvergenceEvidence {
  return {
    inspection: ins,
    auditEventsRowCount: 5000,
    auditEventsTableBytes: 4_096_000,
    auditEventsTotalRelationBytes: 8_192_000,
    ...over,
  };
}

const COMPLETE_JOURNAL = {
  expectedCount: 24,
  recordedCount: 24,
  missing: [],
  duplicateHashes: [],
  unknownHashes: [],
};

function makeDeps(over: Partial<ConvergeDeps> = {}) {
  const runner: SqlRunner = { query: vi.fn(async () => []) };
  const close = vi.fn(async () => {});
  const openRunner = vi.fn((_url: string) => ({ runner, close }));
  const gatherEvidence = vi.fn(async () => evidenceOf(inspection()));
  const validateJournal = vi.fn(async () => ({ ...COMPLETE_JOURNAL }));
  const assertJournalComplete = vi.fn((_s: unknown) => {});
  const runConvergence = vi.fn(async () => ({ indexes: [], foreignKeys: [] }));
  const deps = {
    openRunner,
    gatherEvidence,
    validateJournal,
    assertJournalComplete,
    runConvergence,
    ...over,
  } as unknown as ConvergeDeps;
  return {
    deps,
    runner,
    close,
    openRunner,
    gatherEvidence,
    validateJournal,
    assertJournalComplete,
    runConvergence,
  };
}

// ── Hardening 1: fail closed when mandatory Production evidence is missing ─
describe('db:aud-a:converge — mandatory dry-run evidence gate', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.env.DATABASE_URL_UNPOOLED = DIRECT;
    delete process.env.DATABASE_URL;
  });
  afterEach(() => {
    logSpy.mockRestore();
    delete process.env.DATABASE_URL_UNPOOLED;
  });

  it('missingMandatoryEvidence flags row count and table size, ignores total relation size', () => {
    const base = evidenceOf(inspection());
    expect(missingMandatoryEvidence(base)).toEqual([]);
    expect(
      missingMandatoryEvidence({ ...base, auditEventsRowCount: null }),
    ).toEqual(['audit_events row count']);
    expect(
      missingMandatoryEvidence({ ...base, auditEventsTableBytes: null }),
    ).toEqual(['audit_events table size']);
    expect(
      missingMandatoryEvidence({
        ...base,
        auditEventsTotalRelationBytes: null,
      }),
    ).toEqual([]);
    expect(
      missingMandatoryEvidence({ ...base, auditEventsRowCount: Number.NaN }),
    ).toEqual(['audit_events row count']);
  });

  it('--apply aborts before the executor when row count evidence is unavailable', async () => {
    const h = makeDeps({
      gatherEvidence: vi.fn(async () =>
        evidenceOf(inspection(), { auditEventsRowCount: null }),
      ) as ConvergeDeps['gatherEvidence'],
    });
    await expect(
      run(['--apply', '--production-approved'], h.deps),
    ).rejects.toThrow(/mandatory Production dry-run evidence is unavailable/i);
    expect(h.validateJournal).not.toHaveBeenCalled();
    expect(h.runConvergence).not.toHaveBeenCalled();
  });

  it('--apply aborts before the executor when table-size evidence is unavailable', async () => {
    const h = makeDeps({
      gatherEvidence: vi.fn(async () =>
        evidenceOf(inspection(), { auditEventsTableBytes: null }),
      ) as ConvergeDeps['gatherEvidence'],
    });
    await expect(
      run(['--apply', '--production-approved'], h.deps),
    ).rejects.toThrow(/audit_events table size/i);
    expect(h.runConvergence).not.toHaveBeenCalled();
  });

  it('--check stays read-only and reports that --apply is BLOCKED on missing evidence', async () => {
    const h = makeDeps({
      gatherEvidence: vi.fn(async () =>
        evidenceOf(inspection(), {
          auditEventsRowCount: null,
          auditEventsTableBytes: null,
        }),
      ) as ConvergeDeps['gatherEvidence'],
    });
    await expect(run(['--check'], h.deps)).resolves.toBeUndefined();
    const out = logSpy.mock.calls.flat().map(String).join('\n');
    expect(out).toMatch(/--apply is BLOCKED/);
    expect(out).toMatch(/--check complete\. No schema, data, index/);
    expect(h.runConvergence).not.toHaveBeenCalled();
    // read-only: the CLI issued no SQL of its own beyond the injected runner,
    // and never called the journal validator or the executor.
    expect(h.validateJournal).not.toHaveBeenCalled();
  });
});

// ── Hardening 3: the new CLI --apply orchestration itself ─────────────────
describe('db:aud-a:converge — approved --apply orchestration', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.env.DATABASE_URL_UNPOOLED = DIRECT;
    delete process.env.DATABASE_URL;
  });
  afterEach(() => {
    logSpy.mockRestore();
    delete process.env.DATABASE_URL_UNPOOLED;
  });

  it('runs the pipeline in order and invokes the EXISTING executor exactly once', async () => {
    const order: string[] = [];
    const h = makeDeps();
    h.gatherEvidence.mockImplementation(async () => {
      order.push('gather');
      return evidenceOf(inspection());
    });
    h.validateJournal.mockImplementation(async () => {
      order.push('journal');
      return { ...COMPLETE_JOURNAL };
    });
    h.assertJournalComplete.mockImplementation(() => {
      order.push('assert-journal');
    });
    h.runConvergence.mockImplementation(async () => {
      order.push('converge');
      return { indexes: [], foreignKeys: [] };
    });

    await expect(
      run(['--apply', '--production-approved'], h.deps),
    ).resolves.toBeUndefined();

    expect(h.runConvergence).toHaveBeenCalledTimes(1);
    expect(h.runConvergence).toHaveBeenCalledWith(h.runner, 'concurrent', {
      enforcement: 'enforce',
    });
    // evidence → journal gate → executor → re-inspection
    expect(order).toEqual([
      'gather',
      'journal',
      'assert-journal',
      'converge',
      'gather',
    ]);
    expect(h.close).toHaveBeenCalled();
    expect(logSpy.mock.calls.flat().map(String).join('\n')).toMatch(
      /AUD·A Production convergence COMPLETE/,
    );
  });

  it('already-converged database: approved --apply succeeds idempotently (executor still called once, no-ops)', async () => {
    const h = makeDeps(); // default evidence is fully converged
    await expect(
      run(['--apply', '--production-approved'], h.deps),
    ).resolves.toBeUndefined();
    expect(h.runConvergence).toHaveBeenCalledTimes(1);
  });

  it('rejects before executor mutation when migration 0023 is not applied', async () => {
    const h = makeDeps({
      gatherEvidence: vi.fn(async () =>
        evidenceOf(
          inspection({
            expandMigrationApplied: false,
            index: {
              name: INDEX_NAME,
              table: 'audit_events',
              state: 'absent',
              currentDefinition: null,
              expectedDefinition: EXPECTED_DEF,
              plannedAction: 'blocked-expand-not-applied',
            },
          }),
        ),
      ) as ConvergeDeps['gatherEvidence'],
    });
    await expect(
      run(['--apply', '--production-approved'], h.deps),
    ).rejects.toThrow(/migration 0023 is not applied/i);
    expect(h.validateJournal).not.toHaveBeenCalled();
    expect(h.runConvergence).not.toHaveBeenCalled();
  });

  it('rejects before executor mutation when the migration journal is incomplete', async () => {
    const h = makeDeps({
      assertJournalComplete: vi.fn(() => {
        throw new Error('[migration-journal] 1 expected migration missing');
      }) as ConvergeDeps['assertJournalComplete'],
    });
    await expect(
      run(['--apply', '--production-approved'], h.deps),
    ).rejects.toThrow(/expected migration missing/i);
    expect(h.runConvergence).not.toHaveBeenCalled();
  });

  it('rejects when the final postcondition is not met after convergence', async () => {
    const h = makeDeps();
    let call = 0;
    h.gatherEvidence.mockImplementation(async () => {
      call += 1;
      // first call: pre-apply evidence is fine; second call: still not converged
      return call === 1
        ? evidenceOf(inspection())
        : evidenceOf(
            inspection({
              index: {
                name: INDEX_NAME,
                table: 'audit_events',
                state: 'invalid',
                currentDefinition: EXPECTED_DEF,
                expectedDefinition: EXPECTED_DEF,
                plannedAction: 'rebuild-invalid',
              },
            }),
          );
    });
    await expect(
      run(['--apply', '--production-approved'], h.deps),
    ).rejects.toThrow(/post-condition check failed after convergence/i);
    expect(h.runConvergence).toHaveBeenCalledTimes(1);
    expect(h.close).toHaveBeenCalled();
  });

  it('final postcondition FAILS when a FK is not present-exact-validated after convergence', async () => {
    const h = makeDeps();
    let call = 0;
    h.gatherEvidence.mockImplementation(async () => {
      call += 1;
      if (call === 1) return evidenceOf(inspection());
      // post-convergence: index fine, but one FK is convalidated with a
      // wrong definition — convalidated alone must NOT satisfy COMPLETE.
      return evidenceOf(
        inspection({
          foreignKeys: [
            fkInsp({
              constraint: 'audit_events_organization_id_organizations_id_fk',
              state: 'present-wrong-definition',
              convalidated: true,
              definitionMismatches: [
                "ON DELETE: expected 'set null', got 'cascade'",
              ],
              plannedAction: 'abort-wrong-definition',
            }),
            fkInsp({
              constraint:
                'audit_log_settings_organization_id_organizations_id_fk',
              table: 'audit_log_settings',
            }),
          ],
        }),
      );
    });
    await expect(
      run(['--apply', '--production-approved'], h.deps),
    ).rejects.toThrow(/post-condition check failed after convergence/i);
  });

  it('final postcondition FAILS when the FK set count differs from the canonical AUD·A set', async () => {
    const h = makeDeps();
    let call = 0;
    h.gatherEvidence.mockImplementation(async () => {
      call += 1;
      if (call === 1) return evidenceOf(inspection());
      // only ONE FK reported back — not the full canonical set of two.
      return evidenceOf(
        inspection({
          foreignKeys: [
            fkInsp({
              constraint: 'audit_events_organization_id_organizations_id_fk',
            }),
          ],
        }),
      );
    });
    await expect(
      run(['--apply', '--production-approved'], h.deps),
    ).rejects.toThrow(/post-condition check failed after convergence/i);
  });

  it('a VALID wrong-definition index stays fail-closed: executor error propagates, CLI never drops it', async () => {
    const h = makeDeps({
      gatherEvidence: vi.fn(async () =>
        evidenceOf(
          inspection({
            index: {
              name: INDEX_NAME,
              table: 'audit_events',
              state: 'valid-wrong-definition',
              currentDefinition:
                'CREATE INDEX idx_audit_events_organization_occurred ON public.audit_events USING btree (occurred_at)',
              expectedDefinition: EXPECTED_DEF,
              plannedAction: 'abort-wrong-definition',
            },
          }),
        ),
      ) as ConvergeDeps['gatherEvidence'],
      runConvergence: vi.fn(async () => {
        throw new Error(
          '[post-migrate-steps] index "idx_audit_events_organization_occurred" already exists with an unexpected definition; refusing to proceed.',
        );
      }) as ConvergeDeps['runConvergence'],
    });
    await expect(
      run(['--apply', '--production-approved'], h.deps),
    ).rejects.toThrow(/unexpected definition; refusing to proceed/i);
    // The CLI issues no DROP itself — its only DB access is the injected runner,
    // which recorded no calls.
    expect(h.runner.query).not.toHaveBeenCalled();
    expect(h.close).toHaveBeenCalled();
  });
});

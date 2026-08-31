import type { execFileSync } from 'node:child_process';

import { gate, type LocalRollbackAssessment } from './evidence';
import { assessContainmentFloorAncestry } from './git-ancestry';
import {
  assertProductionDeployment,
  parseRollbackAssessmentArgs,
  type ProductionDeploymentDetail,
  type TrustedProductionCandidate,
} from './guards';
import {
  assessAppliedMigrationHashSetCompatibility,
  readCandidateMigrationJournal,
  readProductionAppliedMigrationHashes,
} from './production-schema';
import {
  readExpectedProductionIdentity,
  readRemoteCandidateDetail,
  type ExpectedProductionIdentity,
} from './remote-candidate';
import {
  checkCandidateEnvironmentContractInstrumentation,
  readCandidateEnvironmentContract,
  readOperatorDeclaredProductionContractDimensions,
} from './remote-environment';

import { buildEnvironmentContractEvidence } from '@/security/internal-api/rollback-environment-contract';

interface EnvironmentContractEvidence {
  authProvider: 'authjs' | 'clerk';
  contractVersion: string;
  fingerprint: string;
}

type EvidenceSource = 'LOCAL_SUPPLIED' | 'REMOTE_READ';
type AcquisitionFailure = { reason: string; status: 'BLOCKED' | 'ERROR' };

interface RemoteProvenance {
  candidate: EvidenceSource;
  environment: EvidenceSource;
  schema: EvidenceSource;
}

const LOCAL_PROVENANCE: RemoteProvenance = {
  candidate: 'LOCAL_SUPPLIED',
  environment: 'LOCAL_SUPPLIED',
  schema: 'LOCAL_SUPPLIED',
};

/**
 * Shape/secret-shape validation always runs, regardless of provenance --
 * malformed or secret-shaped evidence is INVALID whether it was locally
 * supplied or remotely read. Only a well-formed candidate contract compared
 * against the expected/current contract may reach PASS, and only when
 * `provenance === 'REMOTE_READ'` -- the internal-only signal set exclusively
 * by `run()` after it has actually executed
 * `readCandidateEnvironmentContract()`.
 *
 * The expected contract is `readOperatorDeclaredProductionContractDimensions()`
 * -- explicit, dedicated `PRODUCTION_*` local trust anchors, never the
 * operator's own ambient `@/core/env` resolution, which could be Preview or
 * development.
 */
function assessEnvironmentContract(
  evidence: unknown,
  provenance: EvidenceSource,
): ReturnType<typeof gate> {
  if (evidence === undefined) {
    return provenance === 'REMOTE_READ'
      ? gate(
          'ERROR',
          'Candidate environment-contract evidence could not be acquired.',
        )
      : gate('BLOCKED', 'Deployment-bound environment evidence is required.');
  }
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return gate(
      'INVALID',
      'Deployment-bound environment evidence is malformed.',
    );
  }
  const entries = Object.entries(evidence as Record<string, unknown>);
  const allowed = new Set(['authProvider', 'contractVersion', 'fingerprint']);
  if (
    entries.length !== 3 ||
    entries.some(
      ([key]) =>
        !allowed.has(key) || /key|secret|token|database|url/i.test(key),
    )
  ) {
    return gate(
      'INVALID',
      'Deployment-bound environment evidence is malformed.',
    );
  }
  const typed = evidence as Partial<EnvironmentContractEvidence>;
  if (
    (typed.authProvider !== 'authjs' && typed.authProvider !== 'clerk') ||
    typeof typed.contractVersion !== 'string' ||
    !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(typed.contractVersion) ||
    typeof typed.fingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/.test(typed.fingerprint)
  ) {
    return gate(
      'INVALID',
      'Deployment-bound environment evidence is malformed.',
    );
  }
  if (provenance !== 'REMOTE_READ') {
    return gate(
      'BLOCKED',
      'Deployment-bound environment evidence is not remotely verified.',
    );
  }
  const expectedDimensions = readOperatorDeclaredProductionContractDimensions();
  if (!expectedDimensions) {
    return gate(
      'BLOCKED',
      'Expected Production environment contract is not declared locally (PRODUCTION_AUTH_PROVIDER/PRODUCTION_TENANCY_MODE/PRODUCTION_TENANT_CONTEXT_SOURCE/PRODUCTION_DB_PROVIDER/PRODUCTION_DB_DRIVER/PRODUCTION_RUNTIME_DATABASE_HOST/PRODUCTION_DATABASE_NAME, and PRODUCTION_DEFAULT_TENANT_ID when PRODUCTION_TENANCY_MODE=single).',
    );
  }
  const expected = buildEnvironmentContractEvidence(expectedDimensions);
  if (
    typed.authProvider !== expected.authProvider ||
    typed.contractVersion !== expected.contractVersion ||
    typed.fingerprint !== expected.fingerprint
  ) {
    return gate(
      'BLOCKED',
      'Candidate environment contract does not match the expected Production contract.',
    );
  }
  return gate(
    'PASS',
    'Candidate environment contract matches the expected Production contract.',
  );
}

/**
 * `schemaCompatibility` means exact applied-migration *hash-set* equality --
 * never positional/tag equality. Production's `drizzle.__drizzle_migrations`
 * table never stored a `tag`, and its `created_at` ordering does not
 * reproduce this repository's real `_journal.entries` order (see
 * `readProductionAppliedMigrationHashes`'s doc comment), so order must never
 * influence this result; only set membership does. A PASS the comparator
 * produces is downgraded to BLOCKED unless `provenance === 'REMOTE_READ'` --
 * otherwise a caller of the exported, always-local builder could supply
 * matching fixture hash sets directly and be told they were remotely
 * verified.
 */
function assessSchemaCompatibility(
  input: {
    candidateMigrationHashes?: unknown;
    productionAppliedMigrationHashes?: unknown;
  },
  provenance: EvidenceSource,
): ReturnType<typeof gate> {
  const result = assessAppliedMigrationHashSetCompatibility(input);
  if (result.status === 'PASS' && provenance !== 'REMOTE_READ') {
    return gate(
      'BLOCKED',
      'Migration-journal evidence is not remotely verified.',
    );
  }
  return result;
}

function assessSmoke(evidence: unknown): ReturnType<typeof gate> {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return gate(
      'BLOCKED',
      'Smoke requires deployment-bound environment evidence.',
    );
  }
  const provider = (evidence as Partial<EnvironmentContractEvidence>)
    .authProvider;
  if (provider === 'authjs') {
    return gate(
      'BLOCKED',
      'AuthJS read-only smoke is future-supported but not executed in A4.2b.',
    );
  }
  if (provider === 'clerk') {
    return gate(
      'BLOCKED',
      'Clerk smoke is blocked pending separately approved provider-specific coverage.',
    );
  }
  return gate(
    'BLOCKED',
    'Smoke is blocked for an unsupported or unknown provider.',
  );
}

interface RollbackAssessmentInput {
  candidateDetail?: ProductionDeploymentDetail;
  candidateMigrationHashes?: unknown;
  deploymentId: string;
  environmentContract?: unknown;
  expectedIdentity?: {
    orgId: string;
    owner: string;
    projectId: string;
    repository: string;
  };
  gitExecutor?: typeof execFileSync;
  productionAppliedMigrationHashes?: unknown;
}

interface AcquisitionFailures {
  environment?: AcquisitionFailure;
  schema?: AcquisitionFailure;
}

/**
 * Shared assessment builder. `provenance` and `acquisitionFailures` are
 * module-private parameters -- neither is part of either exported builder's
 * public signature, so no external caller can source `REMOTE_READ`
 * provenance for candidate identity, environment contract, or schema
 * compatibility. Only `buildRemoteVerifiedRollbackAssessment()` below (used
 * exclusively by `run()`, and only after it has actually executed the
 * corresponding real remote/local-Git read) may request it.
 */
function buildAssessment(
  input: RollbackAssessmentInput,
  provenance: RemoteProvenance,
  acquisitionFailures?: AcquisitionFailures,
): LocalRollbackAssessment {
  let candidateIdentity = gate(
    'BLOCKED',
    'Authoritative candidate DETAIL evidence is required.',
  );
  let containmentFloorAncestry = gate(
    'BLOCKED',
    'Authoritative candidate DETAIL evidence is required.',
  );
  let remoteCandidateEvidence: LocalRollbackAssessment['remoteCandidateEvidence'] =
    provenance.candidate === 'REMOTE_READ'
      ? { status: 'ERROR' }
      : { status: 'NOT_REQUESTED' };
  if (
    input.candidateDetail !== undefined &&
    input.expectedIdentity !== undefined
  ) {
    try {
      const candidate = assertProductionDeployment(
        input.candidateDetail,
        input.expectedIdentity,
        input.deploymentId,
      );
      candidateIdentity = gate(
        'PASS',
        'Production candidate DETAIL identity is exact.',
      );
      containmentFloorAncestry = assessContainmentFloorAncestry(
        candidate.gitSha,
        input.gitExecutor,
      );
      if (provenance.candidate === 'REMOTE_READ') {
        remoteCandidateEvidence = {
          deploymentId: candidate.deploymentId,
          gitRef: candidate.gitRef,
          gitSha: candidate.gitSha,
          immutableUrl: candidate.immutableUrl,
          status: 'READ_AND_VALIDATED',
        };
      }
    } catch {
      candidateIdentity = gate(
        'INVALID',
        'Candidate DETAIL identity is invalid.',
      );
      containmentFloorAncestry = gate(
        'BLOCKED',
        'Candidate identity must pass before ancestry assessment.',
      );
      // remoteCandidateEvidence already reflects ERROR for REMOTE_READ and
      // stays NOT_REQUESTED for LOCAL_SUPPLIED.
    }
  }
  return {
    candidateIdentity,
    containmentFloorAncestry,
    environmentContract: acquisitionFailures?.environment
      ? gate(
          acquisitionFailures.environment.status,
          acquisitionFailures.environment.reason,
        )
      : assessEnvironmentContract(
          input.environmentContract,
          provenance.environment,
        ),
    nominatedDeploymentId: input.deploymentId,
    remoteCandidateEvidence,
    rollbackAction: 'NOT_AUTHORIZED',
    rollbackExecutable: false,
    schemaCompatibility: acquisitionFailures?.schema
      ? gate(
          acquisitionFailures.schema.status,
          acquisitionFailures.schema.reason,
        )
      : assessSchemaCompatibility(input, provenance.schema),
    smoke: assessSmoke(input.environmentContract),
  };
}

/**
 * Public local-only assessment builder. Always represents locally supplied
 * or missing evidence -- it can never produce `READ_AND_VALIDATED` candidate
 * evidence, a PASS environment contract, or a PASS schema compatibility,
 * regardless of inputs, because it has no way to request `REMOTE_READ`
 * provenance for any of the three.
 */
export function buildLocalRollbackAssessment(
  input: RollbackAssessmentInput,
): LocalRollbackAssessment {
  return buildAssessment(input, LOCAL_PROVENANCE);
}

/**
 * Not exported. Used only by `run()`, and only for the categories it has
 * actually executed the real remote/local-Git read for -- this is the sole
 * path that may establish REMOTE_READ provenance for any evidence category.
 */
function buildRemoteVerifiedRollbackAssessment(
  input: RollbackAssessmentInput,
  provenance: RemoteProvenance,
  acquisitionFailures?: AcquisitionFailures,
): LocalRollbackAssessment {
  return buildAssessment(input, provenance, acquisitionFailures);
}

/**
 * Not caller-configurable by design: an importing module must not be able to
 * inject a fake Vercel executor, a fake expected-identity resolver, a fake
 * candidate-runtime probe, or a fake Production DB reader and obtain
 * REMOTE_READ provenance without performing the real reads. Every remote
 * category is structurally bound to its own real implementation, and each
 * of `--execute-remote-candidate-read`, `--execute-production-environment-read`,
 * and `--execute-production-schema-read` authorizes only its own read.
 *
 * Environment and schema reads are both bound to the trusted candidate: if
 * `--execute-remote-candidate-read` was not also given (or it fails), those
 * reads never proceed and their gates stay BLOCKED -- there is no path from
 * either flag alone to a Vercel DETAIL read or a Production connection.
 *
 * The environment read additionally never fires until a purely local Git
 * check (`checkCandidateEnvironmentContractInstrumentation`) has confirmed
 * the trusted candidate's own commit actually contains the attestation
 * route -- a candidate built before this instrumentation existed can never
 * serve it, and that must fail closed to BLOCKED, not a 404 read as ERROR.
 */
export async function run(argv = process.argv): Promise<void> {
  const flags = parseRollbackAssessmentArgs(argv.slice(2));
  const { deploymentId } = flags;

  if (
    !flags.executeRemoteCandidateRead &&
    !flags.executeProductionEnvironmentRead &&
    !flags.executeProductionSchemaRead
  ) {
    console.log(
      JSON.stringify(buildLocalRollbackAssessment({ deploymentId }), null, 2),
    );
    return;
  }

  let candidateDetail: ProductionDeploymentDetail | undefined;
  let expectedIdentity: ExpectedProductionIdentity | undefined;
  let trustedCandidate: TrustedProductionCandidate | undefined;

  if (flags.executeRemoteCandidateRead) {
    try {
      expectedIdentity = readExpectedProductionIdentity();
      candidateDetail = readRemoteCandidateDetail(deploymentId);
      trustedCandidate = assertProductionDeployment(
        candidateDetail,
        expectedIdentity,
        deploymentId,
      );
    } catch {
      // buildAssessment re-derives BLOCKED/INVALID/ERROR from whatever
      // partial state exists (candidateDetail may or may not be set).
    }
  }

  let environmentContractEvidence: unknown;
  let environmentAcquisitionFailure: AcquisitionFailure | undefined;

  if (flags.executeProductionEnvironmentRead) {
    if (!trustedCandidate) {
      environmentAcquisitionFailure = {
        reason:
          'Production environment read requires a validated rollback candidate.',
        status: 'BLOCKED',
      };
    } else {
      const instrumentation = checkCandidateEnvironmentContractInstrumentation(
        trustedCandidate.gitSha,
      );
      if (instrumentation.status !== 'PRESENT') {
        environmentAcquisitionFailure = {
          reason: instrumentation.reason,
          status: instrumentation.status,
        };
      } else {
        try {
          environmentContractEvidence = await readCandidateEnvironmentContract(
            trustedCandidate.immutableUrl,
          );
        } catch {
          environmentAcquisitionFailure = {
            reason:
              'Candidate environment-contract evidence could not be acquired.',
            status: 'ERROR',
          };
        }
      }
    }
  }

  let candidateMigrationHashes: unknown;
  let productionAppliedMigrationHashes: unknown;
  let schemaAcquisitionFailure: AcquisitionFailure | undefined;

  if (flags.executeProductionSchemaRead) {
    if (!trustedCandidate) {
      schemaAcquisitionFailure = {
        reason:
          'Production schema read requires a validated rollback candidate.',
        status: 'BLOCKED',
      };
    } else {
      const candidateResult = readCandidateMigrationJournal(
        trustedCandidate.gitSha,
      );
      if (candidateResult.status !== 'OK') {
        schemaAcquisitionFailure = {
          reason: candidateResult.reason,
          status: candidateResult.status,
        };
      } else {
        candidateMigrationHashes = candidateResult.journal.map(
          (entry) => entry.hash,
        );
        const productionResult = await readProductionAppliedMigrationHashes(
          candidateResult.journal.length,
        );
        if (productionResult.status === 'OK') {
          productionAppliedMigrationHashes = productionResult.hashes;
        } else {
          schemaAcquisitionFailure = {
            reason: productionResult.reason,
            status: productionResult.status,
          };
        }
      }
    }
  }

  const provenance: RemoteProvenance = {
    candidate: flags.executeRemoteCandidateRead
      ? 'REMOTE_READ'
      : 'LOCAL_SUPPLIED',
    environment:
      flags.executeProductionEnvironmentRead && trustedCandidate
        ? 'REMOTE_READ'
        : 'LOCAL_SUPPLIED',
    schema:
      flags.executeProductionSchemaRead && trustedCandidate
        ? 'REMOTE_READ'
        : 'LOCAL_SUPPLIED',
  };

  console.log(
    JSON.stringify(
      buildRemoteVerifiedRollbackAssessment(
        {
          candidateDetail,
          candidateMigrationHashes,
          deploymentId,
          environmentContract: environmentContractEvidence,
          expectedIdentity,
          productionAppliedMigrationHashes,
        },
        provenance,
        {
          environment: environmentAcquisitionFailure,
          schema: schemaAcquisitionFailure,
        },
      ),
      null,
      2,
    ),
  );
}

const isMain = process.argv[1]?.endsWith('/scripts/rollback-assessment/cli.ts');
if (isMain) {
  run().catch((error: unknown) => {
    console.error(
      `[rollback-assessment] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}

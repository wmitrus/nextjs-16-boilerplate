import type { execFileSync } from 'node:child_process';

import { gate, type LocalRollbackAssessment } from './evidence';
import { assessContainmentFloorAncestry } from './git-ancestry';
import {
  assertProductionDeployment,
  parseRollbackAssessmentArgs,
  type ProductionDeploymentDetail,
} from './guards';
import { assessMigrationCompatibility } from './migration-compatibility';
import {
  readExpectedProductionIdentity,
  readRemoteCandidateDetail,
  type ExpectedProductionIdentity,
} from './remote-candidate';

interface EnvironmentContractEvidence {
  authProvider: 'authjs' | 'clerk';
  contractVersion: string;
  fingerprint: string;
}

function assessEnvironmentContract(evidence: unknown): ReturnType<typeof gate> {
  if (evidence === undefined) {
    return gate(
      'BLOCKED',
      'Deployment-bound environment evidence is required.',
    );
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
  return gate(
    'BLOCKED',
    'Deployment-bound environment evidence is not remotely verified in A4.1.',
  );
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
      'AuthJS read-only smoke is future-supported but not executed in A4.1.',
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
  candidateMigrationJournal?: unknown;
  deploymentId: string;
  environmentContract?: unknown;
  expectedIdentity?: {
    orgId: string;
    owner: string;
    projectId: string;
    repository: string;
  };
  gitExecutor?: typeof execFileSync;
  productionAppliedMigrationJournal?: unknown;
}

/**
 * Shared assessment builder. `candidateEvidenceSource` is a module-private
 * parameter — it is intentionally NOT part of either exported builder's
 * public signature, so no external caller can source `REMOTE_READ`
 * provenance. Only `buildRemoteVerifiedRollbackAssessment()` below (used
 * exclusively by `run()` after it has actually executed
 * `readRemoteCandidateDetail()`) may request it.
 */
function buildAssessment(
  input: RollbackAssessmentInput,
  candidateEvidenceSource: 'LOCAL_SUPPLIED' | 'REMOTE_READ',
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
    candidateEvidenceSource === 'REMOTE_READ'
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
      if (candidateEvidenceSource === 'REMOTE_READ') {
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
    environmentContract: assessEnvironmentContract(input.environmentContract),
    nominatedDeploymentId: input.deploymentId,
    remoteCandidateEvidence,
    rollbackAction: 'NOT_AUTHORIZED',
    rollbackExecutable: false,
    schemaCompatibility: assessMigrationCompatibility({
      candidateMigrationJournal: input.candidateMigrationJournal,
      productionAppliedMigrationJournal:
        input.productionAppliedMigrationJournal,
    }),
    smoke: assessSmoke(input.environmentContract),
  };
}

/**
 * Public local-only assessment builder. Always represents locally supplied
 * or missing evidence — it can never produce
 * `remoteCandidateEvidence.status === 'READ_AND_VALIDATED'`, regardless of
 * inputs, because it has no way to request `REMOTE_READ` provenance.
 */
export function buildLocalRollbackAssessment(
  input: RollbackAssessmentInput,
): LocalRollbackAssessment {
  return buildAssessment(input, 'LOCAL_SUPPLIED');
}

/**
 * Not exported. Used only by `run()`, and only after it has actually
 * executed `readRemoteCandidateDetail()` for the exact nominated deployment
 * ID — this is the sole path that may establish REMOTE_READ provenance.
 */
function buildRemoteVerifiedRollbackAssessment(
  input: RollbackAssessmentInput,
): LocalRollbackAssessment {
  return buildAssessment(input, 'REMOTE_READ');
}

/**
 * Not caller-configurable by design: an importing module must not be able to
 * inject a fake Vercel executor or a fake expected-identity resolver and
 * obtain REMOTE_READ provenance without performing the real
 * `readRemoteCandidateDetail()` call. The remote branch is structurally
 * bound to the real `readExpectedProductionIdentity()`,
 * `readRemoteCandidateDetail()`, and local ancestry implementations.
 */
export function run(argv = process.argv): void {
  const { deploymentId, executeRemoteCandidateRead } =
    parseRollbackAssessmentArgs(argv.slice(2));
  if (!executeRemoteCandidateRead) {
    console.log(
      JSON.stringify(buildLocalRollbackAssessment({ deploymentId }), null, 2),
    );
    return;
  }
  let candidateDetail: ProductionDeploymentDetail;
  let expectedIdentity: ExpectedProductionIdentity;
  try {
    expectedIdentity = readExpectedProductionIdentity();
    candidateDetail = readRemoteCandidateDetail(deploymentId);
  } catch {
    console.log(
      JSON.stringify(
        buildRemoteVerifiedRollbackAssessment({ deploymentId }),
        null,
        2,
      ),
    );
    return;
  }
  console.log(
    JSON.stringify(
      buildRemoteVerifiedRollbackAssessment({
        candidateDetail,
        deploymentId,
        expectedIdentity,
      }),
      null,
      2,
    ),
  );
}

const isMain = process.argv[1]?.endsWith('/scripts/rollback-assessment/cli.ts');
if (isMain) {
  try {
    run();
  } catch (error: unknown) {
    console.error(
      `[rollback-assessment] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

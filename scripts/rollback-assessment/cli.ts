import { gate, type LocalRollbackAssessment } from './evidence';
import { assessContainmentFloorAncestry } from './git-ancestry';
import {
  assertProductionDeployment,
  parseRollbackAssessmentArgs,
  type ProductionDeploymentDetail,
} from './guards';
import { assessMigrationCompatibility } from './migration-compatibility';

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

export function buildLocalRollbackAssessment(input: {
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
  productionAppliedMigrationJournal?: unknown;
}): LocalRollbackAssessment {
  let candidateIdentity = gate(
    'BLOCKED',
    'Authoritative candidate DETAIL evidence is required.',
  );
  let containmentFloorAncestry = gate(
    'BLOCKED',
    'Authoritative candidate DETAIL evidence is required.',
  );
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
      );
    } catch {
      candidateIdentity = gate(
        'INVALID',
        'Candidate DETAIL identity is invalid.',
      );
      containmentFloorAncestry = gate(
        'BLOCKED',
        'Candidate identity must pass before ancestry assessment.',
      );
    }
  }
  return {
    candidateIdentity,
    containmentFloorAncestry,
    environmentContract: assessEnvironmentContract(input.environmentContract),
    nominatedDeploymentId: input.deploymentId,
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

export function run(argv = process.argv): void {
  const { deploymentId } = parseRollbackAssessmentArgs(argv.slice(2));
  console.log(
    JSON.stringify(buildLocalRollbackAssessment({ deploymentId }), null, 2),
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

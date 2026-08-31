export type AssessmentStatus = 'PASS' | 'BLOCKED' | 'ERROR' | 'INVALID';

export interface AssessmentGate {
  reason: string;
  status: AssessmentStatus;
}

export interface LocalRollbackAssessment {
  candidateIdentity: AssessmentGate;
  containmentFloorAncestry: AssessmentGate;
  environmentContract: AssessmentGate;
  nominatedDeploymentId: string;
  remoteCandidateEvidence:
    | { status: 'NOT_REQUESTED' }
    | {
        deploymentId: string;
        gitRef: string;
        gitSha: string;
        immutableUrl: string;
        status: 'READ_AND_VALIDATED';
      }
    | { status: 'ERROR' };
  rollbackAction: 'NOT_AUTHORIZED';
  rollbackExecutable: false;
  schemaCompatibility: AssessmentGate;
  smoke: AssessmentGate;
}

export function gate(status: AssessmentStatus, reason: string): AssessmentGate {
  return { reason, status };
}

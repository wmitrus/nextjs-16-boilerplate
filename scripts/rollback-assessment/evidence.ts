export type AssessmentStatus = 'PASS' | 'BLOCKED' | 'ERROR' | 'INVALID';

export type AssessmentGate = {
  reason: string;
  status: AssessmentStatus;
};

export type LocalRollbackAssessment = {
  candidateIdentity: AssessmentGate;
  containmentFloorAncestry: AssessmentGate;
  environmentContract: AssessmentGate;
  nominatedDeploymentId: string;
  rollbackAction: 'NOT_AUTHORIZED';
  rollbackExecutable: false;
  schemaCompatibility: AssessmentGate;
  smoke: AssessmentGate;
};

export function gate(status: AssessmentStatus, reason: string): AssessmentGate {
  return { reason, status };
}

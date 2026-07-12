export class DuplicateRoleNameError extends Error {
  readonly code = 'DUPLICATE_ROLE_NAME';

  constructor(roleName: string) {
    super(`A role named '${roleName}' already exists in this organization`);
    this.name = 'DuplicateRoleNameError';
  }
}

export class ProtectedSystemRoleNameError extends Error {
  readonly code = 'PROTECTED_ROLE_NAME';

  constructor(roleName: string) {
    super(`The role name '${roleName}' is reserved for system roles`);
    this.name = 'ProtectedSystemRoleNameError';
  }
}

export class RoleNotFoundError extends Error {
  readonly code = 'ROLE_NOT_FOUND';

  constructor() {
    super('Role not found in this organization');
    this.name = 'RoleNotFoundError';
  }
}

export class ProtectedRoleMutationError extends Error {
  readonly code = 'PROTECTED_ROLE_MUTATION';

  constructor(roleName: string) {
    super(`The role '${roleName}' is protected and cannot be changed`);
    this.name = 'ProtectedRoleMutationError';
  }
}

export class ProtectedRoleDeletionError extends Error {
  readonly code = 'PROTECTED_ROLE_DELETION';

  constructor(roleName: string) {
    super(`The role '${roleName}' is currently in use and cannot be deleted`);
    this.name = 'ProtectedRoleDeletionError';
  }
}

export class DuplicatePolicyError extends Error {
  readonly code = 'DUPLICATE_POLICY';

  constructor() {
    super(
      'An identical policy already exists for this role in this organization',
    );
    this.name = 'DuplicatePolicyError';
  }
}

export class PolicyNotFoundError extends Error {
  readonly code = 'POLICY_NOT_FOUND';

  constructor() {
    super('Policy not found in this organization');
    this.name = 'PolicyNotFoundError';
  }
}

export class ProtectedPolicyDeletionError extends Error {
  readonly code = 'PROTECTED_POLICY_DELETION';

  constructor() {
    super(
      'The baseline owner policy granting policy management cannot be deleted',
    );
    this.name = 'ProtectedPolicyDeletionError';
  }
}

export class ProtectedPolicyMutationError extends Error {
  readonly code = 'PROTECTED_POLICY_MUTATION';

  constructor() {
    super(
      'The baseline owner policy granting policy management cannot be edited',
    );
    this.name = 'ProtectedPolicyMutationError';
  }
}

export class OrganizationNotFoundError extends Error {
  readonly code = 'ORGANIZATION_NOT_FOUND';

  constructor() {
    super('Organization not found in this tenant');
    this.name = 'OrganizationNotFoundError';
  }
}

export class MembershipNotFoundError extends Error {
  readonly code = 'MEMBERSHIP_NOT_FOUND';

  constructor() {
    super('Membership not found in this organization');
    this.name = 'MembershipNotFoundError';
  }
}

export class ProtectedMembershipMutationError extends Error {
  readonly code = 'PROTECTED_MEMBERSHIP_MUTATION';

  constructor(message: string) {
    super(message);
    this.name = 'ProtectedMembershipMutationError';
  }
}
